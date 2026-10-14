-- Revisão de consumo, item 9 (12/10/2026): a Cobertura e o "Salvar simulação" passam a gravar os
-- lotes direto no banco, sem passar pela função de servidor (Worker/Compute). Mesma segurança (só
-- admin, envio/simulação em andamento) e a mesma validação de antes (os esquemas zod do servidor,
-- reescritos aqui). Início e conclusão do envio/da simulação continuam nas funções de servidor.
-- APLICADO PELO SQL EDITOR do Lovable Cloud em 12/10/2026 (script único; conferência ok): por isso não está em
-- meta/_journal.json. Pode rodar mais de uma vez sem efeito. Não apaga tabela nem dado nenhum.

-- ---------- 1. Envio da Cobertura em andamento (uso interno: sem grant) ----------
create or replace function public.envio_cobertura_aberto(p_envio bigint, p_linhas jsonb)
returns public.bases_envios
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.bases_envios;
begin
  if not public.is_admin() then
    raise exception 'Só o admin envia bases.';
  end if;
  select * into v from public.bases_envios where id = p_envio;
  if not found or v.base <> 'cobertura' then
    raise exception 'Envio não encontrado.';
  end if;
  if v.status <> 'em_andamento' then
    raise exception 'Este envio foi encerrado (talvez outro envio da mesma base tenha começado). Envie de novo.';
  end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) not between 1 and 5000 then
    raise exception 'Lote vazio ou grande demais (máximo 5.000 linhas).';
  end if;
  return v;
end;
$$;

revoke all on function public.envio_cobertura_aberto(bigint, jsonb) from public, anon, authenticated;

-- ---------- 2. Cobertura: SKUs fora do cadastro (parte "skus") ----------
-- Antes: skuCoberturaSchema (sku 1–40 caracteres; descrição obrigatória, cortada em 300).
create or replace function public.gravar_skus_cobertura(p_envio bigint, p_linhas jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  perform public.envio_cobertura_aberto(p_envio, p_linhas);
  if exists (
    select 1 from jsonb_to_recordset(p_linhas) as x(sku text, descricao text)
     where x.sku is null or length(btrim(x.sku)) not between 1 and 40
        or x.descricao is null or length(x.descricao) < 1
  ) then
    raise exception 'Linha inválida no lote de SKUs da Cobertura (SKU ou descrição).';
  end if;
  -- fornecedor e marca vêm depois (completar_produtos, na conclusão do envio)
  insert into public.produtos (sku, descricao, origem_cadastro, origem_fornecedor, envio_id)
  select btrim(x.sku),
         case when length(x.descricao) > 300 then left(x.descricao, 299) || '…' else x.descricao end,
         'cobertura', 'nao_encontrado', p_envio
    from jsonb_to_recordset(p_linhas) as x(sku text, descricao text)
  on conflict (sku) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------- 3. Cobertura: estoque (parte "registros") ----------
-- Antes: estoqueSchema (bcps e sku 1–40; estoque número; vmd, preço e custo ≥ 0, custo pode faltar;
-- situação cortada em 60). base_versao = data de referência do envio.
create or replace function public.gravar_lote_cobertura(p_envio bigint, p_linhas jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bases_envios;
  v_n integer;
begin
  v := public.envio_cobertura_aberto(p_envio, p_linhas);
  if exists (
    select 1
      from jsonb_to_recordset(p_linhas)
           as x(bcps text, sku text, estoque numeric, vmd numeric, preco numeric, custo numeric, situacao text)
     where x.bcps is null or length(btrim(x.bcps)) not between 1 and 40
        or x.sku is null or length(btrim(x.sku)) not between 1 and 40
        or x.estoque is null
        or x.vmd is null or x.vmd < 0
        or x.preco is null or x.preco < 0
        or x.custo < 0
  ) then
    raise exception 'Linha inválida no lote da Cobertura (BCPS, SKU, estoque, VMD, preço ou custo).';
  end if;
  insert into public.estoque (bcps, sku, estoque, vmd, preco, custo, situacao, base_versao, envio_id)
  select btrim(x.bcps), btrim(x.sku), x.estoque, x.vmd, x.preco, x.custo,
         case when length(x.situacao) > 60 then left(x.situacao, 59) || '…' else x.situacao end,
         v.versao_ref, p_envio
    from jsonb_to_recordset(p_linhas)
         as x(bcps text, sku text, estoque numeric, vmd numeric, preco numeric, custo numeric, situacao text)
  on conflict (bcps, sku) do update
     set estoque = excluded.estoque, vmd = excluded.vmd, preco = excluded.preco,
         custo = excluded.custo, situacao = excluded.situacao,
         base_versao = excluded.base_versao, envio_id = excluded.envio_id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.gravar_skus_cobertura(bigint, jsonb) from public, anon;
revoke all on function public.gravar_lote_cobertura(bigint, jsonb) from public, anon;
grant execute on function public.gravar_skus_cobertura(bigint, jsonb) to authenticated;
grant execute on function public.gravar_lote_cobertura(bigint, jsonb) to authenticated;

-- ---------- 4. Salvar simulação: uma parte (kits, itens, kit_lojas ou lojas) ----------
-- Antes: ESQUEMAS_SIMULACAO (simulacoes.server.ts), lotes de até 2.000 linhas, simulação "gravando".
create or replace function public.gravar_parte_simulacao(p_id bigint, p_parte text, p_linhas jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_n integer;
begin
  if not public.is_admin() then
    raise exception 'Só o admin salva simulações.';
  end if;
  select status into v_status from public.simulacoes where id = p_id;
  if not found then
    raise exception 'Simulação não encontrada.';
  end if;
  if v_status <> 'gravando' then
    raise exception 'Esta simulação já foi concluída.';
  end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) not between 1 and 2000 then
    raise exception 'Lote vazio ou grande demais (máximo 2.000 linhas).';
  end if;

  if p_parte = 'kits' then
    if exists (
      select 1 from jsonb_to_recordset(p_linhas) as x(
        codigo text, tema text, nicho text, preco numeric, valor_cheio numeric,
        desconto_pct numeric, heroi_sku text, composicao text, lojas integer)
       where length(x.codigo) not between 1 and 40 or x.codigo is null
          or length(x.tema) not between 1 and 20 or x.tema is null
          or length(x.nicho) > 1
          or x.preco is null or x.valor_cheio is null
          or x.desconto_pct is null or x.desconto_pct not between 0 and 100
          or length(x.heroi_sku) not between 1 and 40 or x.heroi_sku is null
          or x.composicao is null or length(x.composicao) > 400
          or x.lojas is null or x.lojas < 0
    ) then
      raise exception 'Linha inválida na simulação (kits).';
    end if;
    insert into public.simulacao_kits (simulacao_id, codigo, tema, nicho, preco, valor_cheio,
                                       desconto_pct, heroi_sku, composicao, lojas)
    select p_id, x.codigo, x.tema, x.nicho, x.preco, x.valor_cheio, x.desconto_pct, x.heroi_sku,
           x.composicao, x.lojas
      from jsonb_to_recordset(p_linhas) as x(
        codigo text, tema text, nicho text, preco numeric, valor_cheio numeric,
        desconto_pct numeric, heroi_sku text, composicao text, lojas integer);

  elsif p_parte = 'itens' then
    if exists (
      select 1 from jsonb_to_recordset(p_linhas) as x(
        codigo text, ordem integer, papel text, sku text, descricao text,
        preco_item numeric, promo_pct numeric)
       where length(x.codigo) not between 1 and 40 or x.codigo is null
          or x.ordem is null or x.ordem not between 1 and 20
          or x.papel is null or x.papel not in ('heroi', 'surpresa', 'mimo')
          or length(x.sku) not between 1 and 40 or x.sku is null
          or length(x.descricao) not between 1 and 300 or x.descricao is null
          or x.preco_item is null
          or x.promo_pct not between 0 and 100
    ) then
      raise exception 'Linha inválida na simulação (itens).';
    end if;
    insert into public.simulacao_kit_itens (simulacao_id, codigo, ordem, papel, sku, descricao,
                                            preco_item, promo_pct)
    select p_id, x.codigo, x.ordem, x.papel::public.kit_papel, x.sku, x.descricao, x.preco_item,
           x.promo_pct
      from jsonb_to_recordset(p_linhas) as x(
        codigo text, ordem integer, papel text, sku text, descricao text,
        preco_item numeric, promo_pct numeric);

  elsif p_parte = 'kit_lojas' then
    if exists (
      select 1 from jsonb_to_recordset(p_linhas) as x(
        codigo text, bcps text, qtd integer, custo numeric, margem numeric, valor_cheio numeric,
        desconto_pct numeric, reaproveitado boolean, detalhes jsonb)
       where length(x.codigo) not between 1 and 40 or x.codigo is null
          or length(x.bcps) not between 1 and 40 or x.bcps is null
          or x.qtd is null or x.qtd < 0
          or x.custo is null or x.margem is null or x.valor_cheio is null
          or x.desconto_pct is null or x.desconto_pct not between 0 and 100
          or x.reaproveitado is null
    ) then
      raise exception 'Linha inválida na simulação (kits por loja).';
    end if;
    insert into public.simulacao_kit_lojas (simulacao_id, codigo, bcps, qtd, custo, margem,
                                            valor_cheio, desconto_pct, reaproveitado, detalhes)
    select p_id, x.codigo, x.bcps, x.qtd, x.custo, x.margem, x.valor_cheio, x.desconto_pct,
           x.reaproveitado, coalesce(x.detalhes, '[]'::jsonb)
      from jsonb_to_recordset(p_linhas) as x(
        codigo text, bcps text, qtd integer, custo numeric, margem numeric, valor_cheio numeric,
        desconto_pct numeric, reaproveitado boolean, detalhes jsonb);

  elsif p_parte = 'lojas' then
    if exists (
      select 1 from jsonb_to_recordset(p_linhas) as x(
        bcps text, praca text, vendedoras integer, meta numeric, meta_semana numeric,
        meta_vend_semana numeric, metas_mes jsonb, sacolas_meta integer,
        sacolas_possiveis integer, sacolas_planejadas integer, receita numeric, custo numeric,
        pool_tamanho integer, avisos jsonb)
       where length(x.bcps) not between 1 and 40 or x.bcps is null
          or length(x.praca) not between 1 and 100 or x.praca is null
          or x.vendedoras is null or x.vendedoras < 0
          or x.meta is null or x.meta_semana is null
          or x.metas_mes is null or jsonb_typeof(x.metas_mes) <> 'object'
          or x.sacolas_meta is null or x.sacolas_meta < 0
          or x.sacolas_possiveis is null or x.sacolas_possiveis < 0
          or x.sacolas_planejadas is null or x.sacolas_planejadas < 0
          or x.receita is null or x.custo is null
          or x.pool_tamanho is null or x.pool_tamanho < 0
          or x.avisos is null or jsonb_typeof(x.avisos) <> 'array'
    ) then
      raise exception 'Linha inválida na simulação (lojas).';
    end if;
    insert into public.simulacao_lojas (simulacao_id, bcps, praca, vendedoras, meta, meta_semana,
                                        meta_vend_semana, metas_mes, sacolas_meta,
                                        sacolas_possiveis, sacolas_planejadas, receita, custo,
                                        pool_tamanho, avisos)
    select p_id, x.bcps, x.praca, x.vendedoras, x.meta, x.meta_semana, x.meta_vend_semana,
           x.metas_mes, x.sacolas_meta, x.sacolas_possiveis, x.sacolas_planejadas, x.receita,
           x.custo, x.pool_tamanho, x.avisos
      from jsonb_to_recordset(p_linhas) as x(
        bcps text, praca text, vendedoras integer, meta numeric, meta_semana numeric,
        meta_vend_semana numeric, metas_mes jsonb, sacolas_meta integer,
        sacolas_possiveis integer, sacolas_planejadas integer, receita numeric, custo numeric,
        pool_tamanho integer, avisos jsonb);

  else
    raise exception 'Parte "%" não existe na simulação.', p_parte;
  end if;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.gravar_parte_simulacao(bigint, text, jsonb) from public, anon;
grant execute on function public.gravar_parte_simulacao(bigint, text, jsonb) to authenticated;

-- ---------- 5. Item 8, segunda barreira: simulação que virou base não pode ser excluída ----------
create or replace function public.trava_excluir_simulacao_base()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.planos p where p.simulacao_id = old.id) then
    raise exception 'Esta simulação virou base de um período e não pode ser excluída.';
  end if;
  return old;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'simulacoes_trava_base' and tgrelid = 'public.simulacoes'::regclass
  ) then
    create trigger simulacoes_trava_base
      before delete on public.simulacoes
      for each row execute function public.trava_excluir_simulacao_base();
  end if;
end;
$$;
