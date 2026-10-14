-- Parte F2a (11/10/2026): perfil "Acompanhamento", evento "abriu dashboard" e resumo de estoque por loja.
-- APLICADO PELO SQL EDITOR do Lovable Cloud em 11/10/2026 (sem créditos do Lovable): por isso não está em
-- meta/_journal.json. Pode rodar mais de uma vez sem efeito. Não apaga tabela nem dado nenhum.
--
-- Acompanhamento = time do Matheus: lê tudo o que o admin lê (inclusive custo e margem), vê todas as
-- lojas e não altera nada (só ganha policies de SELECT; as funções de servidor continuam exigindo admin).
-- Fica de fora: estoque (não simula) e acessos_log (não vê a tela Acessos).

-- ---------- 1. Valores novos dos enums ----------
alter type public.perfil_tipo   add value if not exists 'acompanhamento';
alter type public.acesso_evento add value if not exists 'abriu_dashboard';

-- ---------- 2. Quem lê os dados do admin: admin ou acompanhamento ativo ----------
-- (perfil::text porque o valor novo do enum não pode ser usado na mesma transação em que foi criado)
create or replace function public.ve_dados_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.perfis p
     where p.user_id = (select auth.uid())
       and p.ativo
       and p.perfil::text in ('admin', 'acompanhamento')
  );
$$;

revoke all on function public.ve_dados_admin() from public, anon;
grant execute on function public.ve_dados_admin() to authenticated, service_role;

-- ---------- 3. Escopo: acompanhamento vê todas as lojas ----------
-- Igual à 0002b; só a primeira condição passa a incluir 'acompanhamento'.
create or replace function public.lojas_de(p_user uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  with alvo as (
    select p.perfil, p.ve_todas, p.matricula
      from public.perfis p
     where p.user_id = p_user
       and p.ativo
       and (p_user = (select auth.uid()) or public.is_admin())
  )
  select l.bcps from public.lojas l
   where exists (
     select 1 from alvo
      where alvo.perfil::text in ('admin', 'acompanhamento') or alvo.ve_todas
   )
  union
  select gl.bcps from public.gerentes_lojas gl
    join alvo on alvo.matricula is not null and gl.matricula = alvo.matricula;
$$;

revoke all on function public.lojas_de(uuid) from public, anon;
grant execute on function public.lojas_de(uuid) to authenticated, service_role;

-- ---------- 4. Resumo de estoque por loja (só admin grava) ----------
-- Calculado no navegador do admin a cada Cobertura concluída (o arquivo já está na memória);
-- o banco guarda só uma linha por loja. ref = data da Cobertura usada.
-- herois = { "<ciclo>": nº de heróis disponíveis na loja naquele ciclo }
create table if not exists public.resumo_estoque_lojas (
  bcps          text primary key,
  ref           date not null,
  skus          integer not null default 0 check (skus >= 0),
  unidades      bigint not null default 0 check (unidades >= 0),
  valor_custo   numeric(14,2) not null default 0,
  parados_skus  integer not null default 0 check (parados_skus >= 0),
  parados_custo numeric(14,2) not null default 0,
  herois        jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

alter table public.resumo_estoque_lojas enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'resumo_estoque_lojas' and policyname = 'admin_tudo'
  ) then
    create policy admin_tudo on public.resumo_estoque_lojas
      for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
end;
$$;

revoke all on public.resumo_estoque_lojas from anon;
grant select, insert, update, delete on public.resumo_estoque_lojas to authenticated;
grant all on public.resumo_estoque_lojas to service_role;

-- ---------- 5. Leitura para o acompanhamento (só SELECT) ----------
do $$
declare
  t text;
begin
  foreach t in array array[
    'gerentes', 'gerentes_lojas', 'produtos', 'promocoes', 'faturamento_mensal', 'parametros',
    'bases_envios', 'perfis', 'planos', 'plano_metas', 'simulacoes', 'simulacao_kits',
    'simulacao_kit_itens', 'simulacao_kit_lojas', 'simulacao_lojas', 'base_kits', 'base_kit_itens',
    'base_kit_lojas', 'base_kit_lojas_admin', 'base_lojas', 'base_metas_mensais',
    'base_lojas_estoque', 'resumo_estoque_lojas'
  ] loop
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = t and policyname = 'acompanhamento_ler'
    ) then
      execute format(
        'create policy acompanhamento_ler on public.%I for select to authenticated using (public.ve_dados_admin())',
        t
      );
    end if;
  end loop;
end;
$$;
