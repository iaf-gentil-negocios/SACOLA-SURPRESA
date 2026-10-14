-- Parte F1b (11/10/2026): disponibilidade diária dos kits, fotos do estoque por loja e troca de
-- kits por loja na base. APLICADO PELO SQL EDITOR do Lovable Cloud em 11/10/2026 (sem créditos do Lovable):
-- por isso não está em meta/_journal.json. Pode rodar mais de uma vez. Não apaga tabela nenhuma.
--
-- As contas (capacidade dos kits, divergências, kits novos) rodam no navegador do admin; o banco
-- só grava o resumo. O estoque de quando os kits foram gerados já está em
-- base_kit_lojas_admin.detalhes (estoque de cada item na geração).

-- ---------- 1. Disponibilidade por kit e loja (o gerente já lê base_kit_lojas) ----------
-- disponivel      = "pode montar N" do kit sozinho (menor estoque entre os itens; 0 = indisponível)
-- capacidade_loja = quantas sacolas os kits da loja montam juntos, dividindo os produtos
-- disponivel_ref  = data da Cobertura usada na conta
alter table public.base_kit_lojas
  add column if not exists disponivel      integer check (disponivel >= 0),
  add column if not exists capacidade_loja integer check (capacidade_loja >= 0),
  add column if not exists disponivel_ref  date;

-- ---------- 2. Versão dos kits da base (muda a cada troca; o gerente relê quando muda) ----------
alter table public.planos
  add column if not exists kits_versao timestamptz not null default now();

-- ---------- 3. Fotos do estoque por loja (só admin) ----------
-- Só os produtos usados nos kits da loja: { "<sku>": estoque }. "anterior" = Cobertura anterior.
create table if not exists public.base_lojas_estoque (
  plano_id      bigint not null references public.planos (id) on delete cascade,
  bcps          text not null,
  atual_ref     date,
  atual         jsonb not null default '{}'::jsonb,
  anterior_ref  date,
  anterior      jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (plano_id, bcps)
);

alter table public.base_lojas_estoque enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'base_lojas_estoque' and policyname = 'admin_tudo'
  ) then
    create policy admin_tudo on public.base_lojas_estoque
      for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
end;
$$;

revoke all on public.base_lojas_estoque from anon;
grant select, insert, update, delete on public.base_lojas_estoque to authenticated;

-- ---------- 4. Gravar a disponibilidade de uma base (depois de cada Cobertura) ----------
-- p_dados = { "lojas": [ { "bcps": "...", "estoque": { "<sku>": n }, "capacidade": n,
--                          "kits": [ { "codigo": "...", "disponivel": n } ] } ] }
-- Se a Cobertura (p_ref) é nova para a loja, a foto "atual" vira "anterior".
create or replace function public.gravar_disponibilidade(p_plano bigint, p_ref date, p_dados jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_loja  jsonb;
  v_lojas integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado: apenas admin.';
  end if;
  if not exists (select 1 from public.planos where id = p_plano) then
    raise exception 'Base % não encontrada.', p_plano;
  end if;

  for v_loja in select * from jsonb_array_elements(coalesce(p_dados -> 'lojas', '[]'::jsonb)) loop
    insert into public.base_lojas_estoque as e (plano_id, bcps, atual_ref, atual)
    values (p_plano, v_loja ->> 'bcps', p_ref, coalesce(v_loja -> 'estoque', '{}'::jsonb))
    on conflict (plano_id, bcps) do update
       set anterior     = case when e.atual_ref is distinct from excluded.atual_ref
                               then e.atual else e.anterior end,
           anterior_ref = case when e.atual_ref is distinct from excluded.atual_ref
                               then e.atual_ref else e.anterior_ref end,
           atual        = excluded.atual,
           atual_ref    = excluded.atual_ref,
           atualizado_em = now();

    update public.base_kit_lojas kl
       set disponivel      = (k ->> 'disponivel')::integer,
           capacidade_loja = (v_loja ->> 'capacidade')::integer,
           disponivel_ref  = p_ref
      from jsonb_array_elements(coalesce(v_loja -> 'kits', '[]'::jsonb)) as k
     where kl.plano_id = p_plano
       and kl.bcps = v_loja ->> 'bcps'
       and kl.codigo = k ->> 'codigo';

    v_lojas := v_lojas + 1;
  end loop;
  return v_lojas;
end;
$$;

revoke all on function public.gravar_disponibilidade(bigint, date, jsonb) from public, anon;
grant execute on function public.gravar_disponibilidade(bigint, date, jsonb) to authenticated;

-- ---------- 5. Trocar os kits de uma loja na base (tudo de uma vez) ----------
-- p_dados = {
--   "remover": ["<codigo>", ...],                       kits indisponíveis da loja (apagados)
--   "manter":  [ { "codigo", "qtd", "disponivel" } ],    kits que ficam (qtd ajustada)
--   "kits":    [ { "codigo", "tema", "nicho", "preco", "valor_cheio", "desconto_pct", "heroi_sku",
--                  "itens": [ { "ordem", "papel", "sku", "descricao", "preco_item", "promo_pct" } ] } ],
--              (composições novas na base; código que já existe na base é reaproveitado)
--   "novos":   [ { "codigo", "qtd", "disponivel", "custo", "margem", "valor_cheio",
--                  "desconto_pct", "detalhes" } ],        kits novos nesta loja
--   "loja":    { "sacolas_possiveis", "sacolas_planejadas", "receita", "custo", "capacidade" },
--   "ref":     "AAAA-MM-DD"                                Cobertura usada
-- }
create or replace function public.regerar_kits_loja(p_plano bigint, p_bcps text, p_dados jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_removidos integer := 0;
  v_novos     integer := 0;
  v_orfaos    integer := 0;
  v_ref       date := nullif(p_dados ->> 'ref', '')::date;
  v_cap       integer := (p_dados -> 'loja' ->> 'capacidade')::integer;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado: apenas admin.';
  end if;
  -- uma troca por base de cada vez
  perform 1 from public.planos where id = p_plano for update;
  if not found then
    raise exception 'Base % não encontrada.', p_plano;
  end if;

  -- 1) kits indisponíveis saem da loja (base_kit_lojas_admin sai junto, em cascata)
  delete from public.base_kit_lojas
   where plano_id = p_plano and bcps = p_bcps
     and codigo in (select jsonb_array_elements_text(coalesce(p_dados -> 'remover', '[]'::jsonb)));
  get diagnostics v_removidos = row_count;

  -- 2) kits que ficam: quantidade ajustada ao estoque
  update public.base_kit_lojas kl
     set qtd = (m ->> 'qtd')::integer,
         disponivel = (m ->> 'disponivel')::integer,
         disponivel_ref = v_ref
    from jsonb_array_elements(coalesce(p_dados -> 'manter', '[]'::jsonb)) as m
   where kl.plano_id = p_plano and kl.bcps = p_bcps and kl.codigo = m ->> 'codigo';

  -- 3) composições novas na base (código já existente = mesma composição, fica como está)
  insert into public.base_kits (plano_id, codigo, tema, nicho, preco, valor_cheio, desconto_pct, heroi_sku)
  select p_plano, k ->> 'codigo', k ->> 'tema', k ->> 'nicho', (k ->> 'preco')::numeric,
         (k ->> 'valor_cheio')::numeric, (k ->> 'desconto_pct')::numeric, k ->> 'heroi_sku'
    from jsonb_array_elements(coalesce(p_dados -> 'kits', '[]'::jsonb)) as k
  on conflict (plano_id, codigo) do nothing;

  insert into public.base_kit_itens (plano_id, codigo, ordem, papel, sku, descricao, preco_item, promo_pct)
  select p_plano, k ->> 'codigo', (i ->> 'ordem')::smallint, (i ->> 'papel')::public.kit_papel,
         i ->> 'sku', i ->> 'descricao', (i ->> 'preco_item')::numeric,
         nullif(i ->> 'promo_pct', '')::numeric
    from jsonb_array_elements(coalesce(p_dados -> 'kits', '[]'::jsonb)) as k,
         jsonb_array_elements(coalesce(k -> 'itens', '[]'::jsonb)) as i
  on conflict (plano_id, codigo, ordem) do nothing;

  -- 4) kits novos nesta loja
  insert into public.base_kit_lojas (plano_id, codigo, bcps, qtd, disponivel, disponivel_ref)
  select p_plano, n ->> 'codigo', p_bcps, (n ->> 'qtd')::integer, (n ->> 'disponivel')::integer, v_ref
    from jsonb_array_elements(coalesce(p_dados -> 'novos', '[]'::jsonb)) as n
  on conflict (plano_id, codigo, bcps) do update
     set qtd = excluded.qtd, disponivel = excluded.disponivel, disponivel_ref = excluded.disponivel_ref;
  get diagnostics v_novos = row_count;

  insert into public.base_kit_lojas_admin (plano_id, codigo, bcps, custo, margem, valor_cheio, desconto_pct, detalhes)
  select p_plano, n ->> 'codigo', p_bcps, (n ->> 'custo')::numeric, (n ->> 'margem')::numeric,
         (n ->> 'valor_cheio')::numeric, (n ->> 'desconto_pct')::numeric,
         coalesce(n -> 'detalhes', '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_dados -> 'novos', '[]'::jsonb)) as n
  on conflict (plano_id, codigo, bcps) do update
     set custo = excluded.custo, margem = excluded.margem, valor_cheio = excluded.valor_cheio,
         desconto_pct = excluded.desconto_pct, detalhes = excluded.detalhes;

  -- 5) capacidade total da loja em todos os kits dela
  if v_cap is not null then
    update public.base_kit_lojas set capacidade_loja = v_cap
     where plano_id = p_plano and bcps = p_bcps;
  end if;

  -- 6) kits que ficaram sem nenhuma loja saem da base (itens saem junto, em cascata)
  delete from public.base_kits k
   where k.plano_id = p_plano
     and not exists (select 1 from public.base_kit_lojas kl
                      where kl.plano_id = k.plano_id and kl.codigo = k.codigo);
  get diagnostics v_orfaos = row_count;

  -- 7) números da loja e versão dos kits da base
  update public.base_lojas
     set sacolas_possiveis  = coalesce((p_dados -> 'loja' ->> 'sacolas_possiveis')::integer, sacolas_possiveis),
         sacolas_planejadas = coalesce((p_dados -> 'loja' ->> 'sacolas_planejadas')::integer, sacolas_planejadas),
         receita            = coalesce((p_dados -> 'loja' ->> 'receita')::numeric, receita),
         custo              = coalesce((p_dados -> 'loja' ->> 'custo')::numeric, custo)
   where plano_id = p_plano and bcps = p_bcps;

  update public.planos set kits_versao = now() where id = p_plano;

  return jsonb_build_object('removidos', v_removidos, 'novos', v_novos, 'kits_apagados', v_orfaos);
end;
$$;

revoke all on function public.regerar_kits_loja(bigint, text, jsonb) from public, anon;
grant execute on function public.regerar_kits_loja(bigint, text, jsonb) to authenticated;
