-- SCRIPT ÚNICO (12/10/2026): 0002h + 0002i + 0002j, na ordem. Rodar uma vez no SQL editor do Lovable Cloud.
-- Pode rodar mais de uma vez sem efeito; não apaga tabela nem dado. Os arquivos ficam em drizzle/migrations.
-- No fim, a consulta de conferência.

-- ======================================================================
-- 0002h_gravacao_direta.sql
-- ======================================================================
-- Revisão de consumo, item 9 (12/10/2026): a Cobertura e o "Salvar simulação" passam a gravar os
-- lotes direto no banco, sem passar pela função de servidor (Worker/Compute). Mesma segurança (só
-- admin, envio/simulação em andamento) e a mesma validação de antes (os esquemas zod do servidor,
-- reescritos aqui). Início e conclusão do envio/da simulação continuam nas funções de servidor.
-- PARA APLICAR PELO SQL EDITOR do Lovable Cloud (sem créditos do Lovable): por isso não está em
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

-- ======================================================================
-- 0002i_nome_completo_lojas.sql
-- ======================================================================
-- Busca de lojas pelo nome completo (12/10/2026): o banco guardava só o "Nome Abreviado" da dCentros
-- (ex.: "Hiper M" para Carrefour Mossoró). A coluna nova guarda o "Nome" completo; a tela continua
-- mostrando o abreviado, e a busca procura nos dois. O upload da dCentros passa a gravar a coluna.
-- PARA APLICAR PELO SQL EDITOR do Lovable Cloud (sem créditos do Lovable): por isso não está em
-- meta/_journal.json. Pode rodar mais de uma vez sem efeito. Não apaga tabela nem dado nenhum.
alter table public.lojas add column if not exists nome_completo text;

-- ======================================================================
-- 0002j_f2b_vendas.sql
-- ======================================================================
-- Parte F2b (12/10/2026): acompanhamento de vendas do canal App Delivery.
-- O arquivo (export "Quebrar Por Data") é lido no navegador do admin; o banco guarda só o resumo por
-- loja e dia (GMV, boletos, itens) e o ruído calculado por loja e dia da semana. Declarações dos GVOs
-- com aprovação do admin. Nada de cupom ou item cru.
-- PARA APLICAR PELO SQL EDITOR do Lovable Cloud (sem créditos do Lovable): por isso não está em
-- meta/_journal.json. Pode rodar mais de uma vez sem efeito. Não apaga tabela nem dado nenhum.

-- ---------- 1. Início da campanha por ciclo (admin; vazio = início do ciclo) ----------
alter table public.ciclos add column if not exists inicio_campanha date;

-- ---------- 2. Vendas do canal por loja e dia ----------
create table if not exists public.vendas_canal_dia (
  bcps          text not null,
  dia           date not null,
  gmv           numeric(14,2) not null default 0,
  boletos       integer not null default 0 check (boletos >= 0),
  itens         numeric(14,2) not null default 0 check (itens >= 0),
  atualizado_em timestamptz not null default now(),
  primary key (bcps, dia)
);
create index if not exists vendas_canal_dia_dia_idx on public.vendas_canal_dia (dia);

-- cada envio (o período do arquivo substitui o que havia nesses dias)
create table if not exists public.vendas_envios (
  id          bigint generated always as identity primary key,
  inicio      date not null,
  fim         date not null check (fim >= inicio),
  arquivo     text,
  linhas      integer not null default 0,
  gmv         numeric(14,2) not null default 0,
  enviado_por uuid references auth.users (id) on delete set null,
  enviado_em  timestamptz not null default now()
);

-- ---------- 3. Ruído por ciclo, loja e dia da semana (0 = domingo … 6 = sábado) ----------
create table if not exists public.ruido_lojas (
  ciclo           smallint not null references public.ciclos (id),
  bcps            text not null,
  dow             smallint not null check (dow between 0 and 6),
  ruido           numeric(14,2) not null default 0 check (ruido >= 0),
  dias_historico  integer not null default 0,
  outliers        integer not null default 0,
  inicio_campanha date not null,
  calculado_em    timestamptz not null default now(),
  primary key (ciclo, bcps, dow)
);

-- ---------- 4. Declarações de vendas dos GVOs ----------
create table if not exists public.declaracoes_vendas (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  bcps         text not null,
  ciclo        smallint not null references public.ciclos (id),
  tipo         text not null check (tipo in ('dia', 'semana')),
  inicio       date not null,
  fim          date not null,
  sacolas      integer not null check (sacolas between 0 and 10000),
  preco_medio  numeric(12,2) not null default 0 check (preco_medio >= 0),
  status       text not null default 'pendente' check (status in ('pendente', 'aprovada', 'recusada')),
  motivo       text check (length(motivo) <= 300),
  criado_em    timestamptz not null default now(),
  decidido_por uuid references auth.users (id) on delete set null,
  decidido_em  timestamptz,
  check ((tipo = 'dia' and fim = inicio) or (tipo = 'semana' and fim = inicio + 6))
);
-- a mesma loja e período não pode ter duas declarações valendo (recusada não conta)
create unique index if not exists declaracoes_vendas_periodo_idx
  on public.declaracoes_vendas (bcps, inicio, fim) where status <> 'recusada';
create index if not exists declaracoes_vendas_bcps_idx on public.declaracoes_vendas (bcps, ciclo);

-- ---------- 5. Lojas onde o usuário é o GVO (só o GVO declara) ----------
create or replace function public.minhas_lojas_gvo()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select gl.bcps
    from public.gerentes_lojas gl
    join public.perfis p on p.matricula = gl.matricula
   where p.user_id = (select auth.uid())
     and p.ativo
     and gl.nivel = 'gvo';
$$;

revoke all on function public.minhas_lojas_gvo() from public, anon;
grant execute on function public.minhas_lojas_gvo() to authenticated;

-- ---------- 6. Declaração nova: dono, status e preço médio dos kits da praça (pelo banco) ----------
-- preço médio = receita planejada ÷ sacolas planejadas das lojas da praça na base do período
-- (ponderado pelas quantidades planejadas). O gerente não informa o preço.
create or replace function public.declaracao_nova()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plano bigint;
  v_preco numeric;
begin
  new.user_id := (select auth.uid());
  new.status := 'pendente';
  new.decidido_por := null;
  new.decidido_em := null;
  if new.inicio > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Não dá para declarar vendas de um período que ainda não começou.';
  end if;
  select p.id into v_plano
    from public.planos p
   where p.ciclo = new.ciclo and p.inicio is not null and p.inicio <= new.inicio
   order by (p.fim >= new.inicio) desc, p.inicio desc
   limit 1;
  select sum(bl.receita) / nullif(sum(bl.sacolas_planejadas), 0) into v_preco
    from public.base_lojas bl
    join public.lojas l on l.bcps = bl.bcps
   where bl.plano_id = v_plano
     and l.praca = (select l2.praca from public.lojas l2 where l2.bcps = new.bcps);
  if v_preco is null then
    raise exception 'Sem base definida para este período: não dá para calcular o preço médio da praça.';
  end if;
  new.preco_medio := round(v_preco, 2);
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'declaracoes_vendas_nova' and tgrelid = 'public.declaracoes_vendas'::regclass
  ) then
    create trigger declaracoes_vendas_nova
      before insert on public.declaracoes_vendas
      for each row execute function public.declaracao_nova();
  end if;
end;
$$;

-- ---------- 7. Admin aprova ou recusa ----------
create or replace function public.decidir_declaracao(p_id bigint, p_aprovar boolean, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Só o admin aprova ou recusa declarações.';
  end if;
  update public.declaracoes_vendas
     set status = case when p_aprovar then 'aprovada' else 'recusada' end,
         motivo = nullif(left(btrim(coalesce(p_motivo, '')), 300), ''),
         decidido_por = (select auth.uid()),
         decidido_em = now()
   where id = p_id and status = 'pendente';
  if not found then
    raise exception 'Declaração não encontrada ou já decidida.';
  end if;
end;
$$;

revoke all on function public.decidir_declaracao(bigint, boolean, text) from public, anon;
grant execute on function public.decidir_declaracao(bigint, boolean, text) to authenticated;

-- ---------- 8. Gravar as vendas de um arquivo (admin): o período do arquivo substitui ----------
-- p_linhas = [{ "bcps", "dia", "gmv", "boletos", "itens" }]. Dia sem linha = venda 0 (some do período).
create or replace function public.gravar_vendas_canal(
  p_inicio  date,
  p_fim     date,
  p_arquivo text,
  p_linhas  jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
  v_gmv numeric;
begin
  if not public.is_admin() then
    raise exception 'Só o admin envia as vendas.';
  end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio or p_fim - p_inicio > 400 then
    raise exception 'Período do arquivo inválido (até 400 dias).';
  end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) > 100000 then
    raise exception 'Arquivo grande demais (máximo 100.000 linhas).';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_linhas)
           as x(bcps text, dia date, gmv numeric, boletos integer, itens numeric)
     where x.bcps is null or length(btrim(x.bcps)) not between 1 and 40
        or x.dia is null or x.dia not between p_inicio and p_fim
        or x.gmv is null or x.boletos is null or x.boletos < 0
        or x.itens is null or x.itens < 0
  ) then
    raise exception 'Linha inválida no arquivo de vendas (BCPS, data fora do período, GMV, boletos ou itens).';
  end if;

  delete from public.vendas_canal_dia where dia between p_inicio and p_fim;
  insert into public.vendas_canal_dia (bcps, dia, gmv, boletos, itens)
  select btrim(x.bcps), x.dia, sum(x.gmv), sum(x.boletos), sum(x.itens)
    from jsonb_to_recordset(p_linhas)
         as x(bcps text, dia date, gmv numeric, boletos integer, itens numeric)
   group by btrim(x.bcps), x.dia;
  get diagnostics v_n = row_count;

  select coalesce(sum(x.gmv), 0) into v_gmv
    from jsonb_to_recordset(p_linhas) as x(gmv numeric);
  insert into public.vendas_envios (inicio, fim, arquivo, linhas, gmv, enviado_por)
  values (p_inicio, p_fim, left(p_arquivo, 200), v_n, v_gmv, (select auth.uid()));
  return v_n;
end;
$$;

revoke all on function public.gravar_vendas_canal(date, date, text, jsonb) from public, anon;
grant execute on function public.gravar_vendas_canal(date, date, text, jsonb) to authenticated;

-- ---------- 9. Gravar o ruído de um ciclo (admin): substitui o do ciclo ----------
-- p_linhas = [{ "bcps", "dow", "ruido", "dias_historico", "outliers" }]
create or replace function public.gravar_ruido(p_ciclo smallint, p_inicio_campanha date, p_linhas jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not public.is_admin() then
    raise exception 'Só o admin calcula o ruído.';
  end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) > 20000 then
    raise exception 'Ruído inválido.';
  end if;
  delete from public.ruido_lojas where ciclo = p_ciclo;
  insert into public.ruido_lojas (ciclo, bcps, dow, ruido, dias_historico, outliers, inicio_campanha)
  select p_ciclo, x.bcps, x.dow, greatest(x.ruido, 0), x.dias_historico, x.outliers, p_inicio_campanha
    from jsonb_to_recordset(p_linhas)
         as x(bcps text, dow smallint, ruido numeric, dias_historico integer, outliers integer);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.gravar_ruido(smallint, date, jsonb) from public, anon;
grant execute on function public.gravar_ruido(smallint, date, jsonb) to authenticated;

-- ---------- 10. RLS (antes dos GRANTs) ----------
alter table public.vendas_canal_dia   enable row level security;
alter table public.vendas_envios      enable row level security;
alter table public.ruido_lojas        enable row level security;
alter table public.declaracoes_vendas enable row level security;

do $$
declare
  t text;
begin
  -- admin tudo; acompanhamento lê tudo
  foreach t in array array['vendas_canal_dia', 'vendas_envios', 'ruido_lojas', 'declaracoes_vendas'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'admin_tudo') then
      execute format(
        'create policy admin_tudo on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
        t
      );
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'acompanhamento_ler') then
      execute format(
        'create policy acompanhamento_ler on public.%I for select to authenticated using ((select public.ve_dados_admin()))',
        t
      );
    end if;
  end loop;
  -- gerente: vendas, ruído e declarações das lojas do escopo
  foreach t in array array['vendas_canal_dia', 'ruido_lojas', 'declaracoes_vendas'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'gerente_ler_escopo') then
      execute format(
        'create policy gerente_ler_escopo on public.%I for select to authenticated using (bcps in (select public.lojas_do_usuario()))',
        t
      );
    end if;
  end loop;
  -- qualquer usuário ativo vê até que dia há vendas (só datas)
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vendas_envios' and policyname = 'ativos_ler') then
    create policy ativos_ler on public.vendas_envios
      for select to authenticated using ((select public.usuario_ativo()));
  end if;
  -- só o GVO da loja declara (e apaga a própria enquanto pendente)
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'declaracoes_vendas' and policyname = 'gvo_declarar') then
    create policy gvo_declarar on public.declaracoes_vendas
      for insert to authenticated
      with check (user_id = (select auth.uid()) and bcps in (select public.minhas_lojas_gvo()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'declaracoes_vendas' and policyname = 'gvo_apagar_pendente') then
    create policy gvo_apagar_pendente on public.declaracoes_vendas
      for delete to authenticated
      using (user_id = (select auth.uid()) and status = 'pendente');
  end if;
end;
$$;

-- ---------- 11. GRANTs ----------
revoke all on public.vendas_canal_dia, public.vendas_envios, public.ruido_lojas, public.declaracoes_vendas from anon;
grant select, insert, update, delete on
  public.vendas_canal_dia, public.vendas_envios, public.ruido_lojas, public.declaracoes_vendas
  to authenticated;
grant all on
  public.vendas_canal_dia, public.vendas_envios, public.ruido_lojas, public.declaracoes_vendas
  to service_role;
grant usage on all sequences in schema public to authenticated, service_role;

-- ======================================================================
-- CONFERÊNCIA: tem que voltar uma linha só, com todas as colunas = true.
-- ======================================================================
select
  (select count(*) = 7 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'gravar_skus_cobertura', 'gravar_lote_cobertura', 'gravar_parte_simulacao',
      'gravar_vendas_canal', 'gravar_ruido', 'decidir_declaracao', 'minhas_lojas_gvo'))  as funcoes_ok,
  (select count(*) = 2 from pg_trigger
    where tgname in ('simulacoes_trava_base', 'declaracoes_vendas_nova'))               as gatilhos_ok,
  (select count(*) = 4 from information_schema.tables
    where table_schema = 'public' and table_name in (
      'vendas_canal_dia', 'vendas_envios', 'ruido_lojas', 'declaracoes_vendas'))       as tabelas_ok,
  (select count(*) = 3 from information_schema.columns
    where table_schema = 'public'
      and ((table_name = 'lojas' and column_name = 'nome_completo')
        or (table_name = 'ciclos' and column_name = 'inicio_campanha')
        or (table_name = 'declaracoes_vendas' and column_name = 'preco_medio')))       as colunas_ok,
  (select count(*) = 4 from pg_tables
    where schemaname = 'public' and rowsecurity and tablename in (
      'vendas_canal_dia', 'vendas_envios', 'ruido_lojas', 'declaracoes_vendas'))       as rls_ok,
  (select count(*) = 14 from pg_policies
    where schemaname = 'public' and tablename in (
      'vendas_canal_dia', 'vendas_envios', 'ruido_lojas', 'declaracoes_vendas'))       as regras_ok;
