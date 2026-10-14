-- =====================================================================
-- Sacola Surpresa — Etapa 1: banco, funções, RLS, GRANTs e parâmetros
-- Ordem: tipos → tabelas/índices → funções → RLS ligada → policies
-- =====================================================================
-- Sacola Surpresa — Etapa 1: banco, funções, RLS, GRANTs e parâmetros
-- Ordem: tipos → tabelas/índices → funções → RLS ligada → policies
--        → GRANTs → dados iniciais (ciclos, parâmetros) → drop do teste
-- =====================================================================

-- ---------- 0. Tabela do teste de migração ----------

-- ---------- 1. Tipos ----------
create type public.perfil_tipo   as enum ('admin', 'grvo', 'gcvo_gpvo');
create type public.loja_tipo     as enum ('loja', 'hub', 'er');
create type public.gerente_nivel as enum ('grvo', 'gcvo_gpvo', 'gvo');
create type public.canal_tipo    as enum ('varejo', 'venda_direta');
create type public.kit_papel     as enum ('heroi', 'surpresa', 'mimo');
create type public.acesso_evento as enum ('login', 'logout', 'exportou_excel', 'abriu_kits');

-- ---------- 2. Tabelas ----------

-- Ciclos da estratégia
create table public.ciclos (
  id     smallint primary key,
  nome   text not null,
  inicio date not null,
  fim    date not null,
  check (fim >= inicio)
);

-- Lojas, HUBs, galpão e ERs (dCentros)
create table public.lojas (
  bcps          text primary key,
  divisao       text,
  nome          text not null,
  praca         text not null,
  tipo          public.loja_tipo not null default 'loja',
  canal_geral   text,
  canais        text[] not null default '{}',
  vendedoras    integer not null default 0 check (vendedoras >= 0),
  ativo         boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index lojas_praca_idx on public.lojas (praca);

-- Gerentes (dGerentes) e escopo sugerido por loja
create table public.gerentes (
  matricula text primary key,
  nome      text not null
);
create table public.gerentes_lojas (
  matricula text not null references public.gerentes (matricula) on delete cascade,
  bcps      text not null references public.lojas (bcps) on delete restrict,
  nivel     public.gerente_nivel not null,
  primary key (matricula, bcps, nivel)
);
create index gerentes_lojas_bcps_idx on public.gerentes_lojas (bcps);

-- Cadastro de produtos (dsku) — sem custo
create table public.produtos (
  sku               text primary key,
  descricao         text not null,
  marca             text,
  categoria         text,
  subcategoria      text,
  nicho             text check (nicho in ('F', 'M', 'I', 'U')),
  regular           boolean not null default true,
  fornecedor        text,
  origem_fornecedor text,
  preco_dsku        numeric(12,2),
  atualizado_em     timestamptz not null default now()
);

-- Cobertura: estoque, VMD, preço e custo por loja/HUB (só admin)
-- A PK (bcps, sku) é o índice estoque(bcps, sku).
create table public.estoque (
  bcps        text not null,
  sku         text not null,
  estoque     numeric(14,3) not null default 0,
  vmd         numeric(14,4) not null default 0,
  preco       numeric(12,2) not null default 0,
  custo       numeric(12,4),
  situacao    text,
  base_versao date not null,
  primary key (bcps, sku)
);
create index estoque_sku_idx on public.estoque (sku);

-- Promoção por ciclo
create table public.promocoes (
  ciclo             smallint not null references public.ciclos (id),
  sku               text not null,
  desconto_pct      numeric(5,2) not null check (desconto_pct between 0 and 100),
  ressarcimento_bso boolean not null default false,
  texto             text,
  primary key (ciclo, sku)
);

-- Faturamento mensal por loja (mes = 1º dia do mês)
create table public.faturamento_mensal (
  bcps        text not null,
  mes         date not null check (extract(day from mes) = 1),
  faturamento numeric(14,2) not null default 0,
  boletos     integer not null default 0,
  primary key (bcps, mes)
);

-- Parâmetros do admin
create table public.parametros (
  chave          text primary key,
  valor          jsonb not null,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);

-- Histórico de envios das bases (tela Bases)
create table public.bases_envios (
  id          bigint generated always as identity primary key,
  base        text not null check (base in ('cobertura', 'produtos', 'promocao', 'faturamento', 'lojas', 'gerentes', 'vendedoras')),
  ciclo       smallint references public.ciclos (id),
  versao_ref  date,
  linhas      integer not null default 0,
  enviado_por uuid references auth.users (id) on delete set null,
  enviado_em  timestamptz not null default now()
);
create index bases_envios_base_idx on public.bases_envios (base, enviado_em desc);

-- Perfis de usuário
create table public.perfis (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  usuario       text not null unique check (usuario = lower(usuario) and usuario ~ '^[a-z0-9._-]{3,40}$'),
  nome          text not null,
  perfil        public.perfil_tipo not null,
  ativo         boolean not null default true,
  troca_senha   boolean not null default true,
  matricula     text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Escopo do usuário (canal opcional; a regra atual é só por loja)
-- O índice único começa por user_id e atende ao índice perfis_lojas(user_id).
create table public.perfis_lojas (
  id      bigint generated always as identity primary key,
  user_id uuid not null references public.perfis (user_id) on delete cascade,
  bcps    text not null references public.lojas (bcps) on delete restrict,
  canal   public.canal_tipo,
  constraint perfis_lojas_unico unique nulls not distinct (user_id, bcps, canal)
);

-- Registro de acessos (imutável: sem update/delete)
create table public.acessos_log (
  id        bigint generated always as identity primary key,
  user_id   uuid references auth.users (id) on delete set null default auth.uid(),
  evento    public.acesso_evento not null,
  detalhe   jsonb,
  criado_em timestamptz not null default now()
);
create index acessos_log_user_idx on public.acessos_log (user_id, criado_em);

-- Planos publicados (versões congeladas). Um vigente por ciclo.
create table public.planos (
  id           bigint generated always as identity primary key,
  ciclo        smallint not null references public.ciclos (id),
  vigente      boolean not null default false,
  criado_por   uuid references auth.users (id) on delete set null,
  publicado_em timestamptz not null default now()
);
create unique index planos_um_vigente_por_ciclo on public.planos (ciclo) where vigente;

-- Parâmetros usados na geração (só admin)
create table public.plano_parametros (
  plano_id   bigint primary key references public.planos (id) on delete cascade,
  parametros jsonb not null
);

-- Metas por loja. A PK é o índice plano_metas(plano_id, bcps).
create table public.plano_metas (
  plano_id         bigint not null references public.planos (id) on delete cascade,
  bcps             text not null,
  meta             numeric(14,2) not null,
  vendedoras       integer not null default 0,
  meta_semana      numeric(14,2),
  meta_mes         numeric(14,2),
  meta_vend_semana numeric(14,2),
  meta_vend_mes    numeric(14,2),
  primary key (plano_id, bcps)
);

-- Kits do plano (sem custo)
create table public.plano_kits (
  plano_id     bigint not null references public.planos (id) on delete cascade,
  kit_id       text not null,
  praca        text not null,
  tema         text not null,
  nicho        text,
  preco        numeric(12,2) not null,
  valor_cheio  numeric(12,2) not null,
  desconto_pct numeric(5,2) not null,
  qtd_praca    integer not null default 0,
  primary key (plano_id, kit_id)
);

-- Itens do kit. A PK começa por (plano_id, kit_id) e atende a esse índice.
create table public.plano_kit_itens (
  plano_id   bigint not null,
  kit_id     text not null,
  ordem      smallint not null,
  papel      public.kit_papel not null,
  sku        text not null,
  descricao  text not null,
  preco_item numeric(12,2) not null,
  promo_pct  numeric(5,2),
  primary key (plano_id, kit_id, ordem),
  foreign key (plano_id, kit_id) references public.plano_kits (plano_id, kit_id) on delete cascade
);

-- Quantidade de cada kit por loja.
-- A PK começa por (plano_id, kit_id); índice extra para (plano_id, bcps).
create table public.plano_kit_lojas (
  plano_id bigint not null,
  kit_id   text not null,
  bcps     text not null,
  qtd      integer not null check (qtd >= 0),
  primary key (plano_id, kit_id, bcps),
  foreign key (plano_id, kit_id) references public.plano_kits (plano_id, kit_id) on delete cascade
);
create index plano_kit_lojas_bcps_idx on public.plano_kit_lojas (plano_id, bcps);

-- Custo, margem e detalhes do kit (só admin)
create table public.plano_kits_admin (
  plano_id bigint not null,
  kit_id   text not null,
  custo    numeric(12,2),
  margem   numeric(12,2),
  detalhes jsonb,
  primary key (plano_id, kit_id),
  foreign key (plano_id, kit_id) references public.plano_kits (plano_id, kit_id) on delete cascade
);

-- ---------- 3. Funções de acesso ----------
-- security definer: leem perfis/lojas sem passar pela RLS, por isso as
-- policies de perfis podem chamá-las sem recursão.
create or replace function public.is_admin()
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
      and p.perfil = 'admin'
      and p.ativo
  );
$$;

create or replace function public.lojas_do_usuario()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select l.bcps
  from public.lojas l
  where public.is_admin()
  union
  select pl.bcps
  from public.perfis_lojas pl
  join public.perfis p on p.user_id = pl.user_id
  where pl.user_id = (select auth.uid())
    and p.ativo;
$$;

-- Usuário logado tem perfil e está ativo
create or replace function public.usuario_ativo()
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
  );
$$;

revoke all on function public.usuario_ativo() from public, anon;
grant execute on function public.usuario_ativo() to authenticated;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.lojas_do_usuario() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.lojas_do_usuario() to authenticated, service_role;

-- ---------- 4. RLS ligada em todas as tabelas (antes dos GRANTs) ----------
alter table public.ciclos             enable row level security;
alter table public.lojas              enable row level security;
alter table public.gerentes           enable row level security;
alter table public.gerentes_lojas     enable row level security;
alter table public.produtos           enable row level security;
alter table public.estoque            enable row level security;
alter table public.promocoes          enable row level security;
alter table public.faturamento_mensal enable row level security;
alter table public.parametros         enable row level security;
alter table public.bases_envios       enable row level security;
alter table public.perfis             enable row level security;
alter table public.perfis_lojas       enable row level security;
alter table public.acessos_log        enable row level security;
alter table public.planos             enable row level security;
alter table public.plano_parametros   enable row level security;
alter table public.plano_metas        enable row level security;
alter table public.plano_kits         enable row level security;
alter table public.plano_kit_itens    enable row level security;
alter table public.plano_kit_lojas    enable row level security;
alter table public.plano_kits_admin   enable row level security;

-- ---------- 5. Policies ----------

-- 5.1 Admin pode tudo (exceto acessos_log, tratado abaixo)
create policy admin_tudo on public.ciclos             for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.lojas              for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.gerentes           for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.gerentes_lojas     for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.produtos           for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.estoque            for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.promocoes          for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.faturamento_mensal for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.parametros         for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.bases_envios       for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.perfis             for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.perfis_lojas       for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.planos             for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.plano_parametros   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.plano_metas        for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.plano_kits         for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.plano_kit_itens    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.plano_kit_lojas    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.plano_kits_admin   for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 5.2 Leitura de qualquer usuário logado
create policy ciclos_ler on public.ciclos
  for select to authenticated using (public.usuario_ativo());

-- 5.3 Leitura restrita ao escopo / ao próprio usuário
create policy lojas_ler_escopo on public.lojas
  for select to authenticated
  using (bcps in (select public.lojas_do_usuario()));

create policy perfis_ler_proprio on public.perfis
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy perfis_lojas_ler_proprio on public.perfis_lojas
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 5.4 Registro de acessos: cada um insere só o próprio; só admin lê
create policy acessos_inserir_proprio on public.acessos_log
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy acessos_admin_ler on public.acessos_log
  for select to authenticated
  using (public.is_admin());

-- 5.5 Plano publicado: gerente lê só o vigente e só o seu escopo
create policy planos_ler_vigente on public.planos
  for select to authenticated
  using (vigente and public.usuario_ativo());

create policy plano_metas_ler_escopo on public.plano_metas
  for select to authenticated
  using (
    bcps in (select public.lojas_do_usuario())
    and exists (select 1 from public.planos p where p.id = plano_metas.plano_id and p.vigente)
  );

create policy plano_kit_lojas_ler_escopo on public.plano_kit_lojas
  for select to authenticated
  using (
    bcps in (select public.lojas_do_usuario())
    and exists (select 1 from public.planos p where p.id = plano_kit_lojas.plano_id and p.vigente)
  );

create policy plano_kits_ler_escopo on public.plano_kits
  for select to authenticated
  using (
    exists (
      select 1
      from public.plano_kit_lojas kl
      join public.planos p on p.id = kl.plano_id
      where kl.plano_id = plano_kits.plano_id
        and kl.kit_id = plano_kits.kit_id
        and p.vigente
        and kl.bcps in (select public.lojas_do_usuario())
    )
  );

create policy plano_kit_itens_ler_escopo on public.plano_kit_itens
  for select to authenticated
  using (
    exists (
      select 1
      from public.plano_kit_lojas kl
      join public.planos p on p.id = kl.plano_id
      where kl.plano_id = plano_kit_itens.plano_id
        and kl.kit_id = plano_kit_itens.kit_id
        and p.vigente
        and kl.bcps in (select public.lojas_do_usuario())
    )
  );
-- plano_parametros, plano_kits_admin, estoque, produtos, promocoes,
-- faturamento_mensal, parametros, bases_envios, gerentes, gerentes_lojas:
-- sem policy de leitura para gerente (só admin_tudo).

-- ---------- 6. GRANTs (depois da RLS) ----------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant select, insert, update, delete on
  public.ciclos, public.lojas, public.gerentes, public.gerentes_lojas,
  public.produtos, public.estoque, public.promocoes, public.faturamento_mensal,
  public.parametros, public.bases_envios, public.perfis, public.perfis_lojas,
  public.planos, public.plano_parametros, public.plano_metas, public.plano_kits,
  public.plano_kit_itens, public.plano_kit_lojas, public.plano_kits_admin
  to authenticated;

-- acessos_log: só inserir e ler (sem update/delete para ninguém logado)
revoke all on public.acessos_log from authenticated;
grant select, insert on public.acessos_log to authenticated;

grant usage on all sequences in schema public to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Objetos FUTUROS criados pelo mesmo papel que roda esta migração não
-- nascem liberados para anon.
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
-- O Postgres libera EXECUTE de funções novas para PUBLIC (que inclui anon)
-- num padrão GLOBAL, que a forma "in schema" não consegue retirar. Por isso
-- estas linhas vão sem "in schema". Funções futuras precisarão de
-- "grant execute ... to authenticated" explícito.
alter default privileges revoke execute on functions from public;
alter default privileges revoke all on tables    from anon;
alter default privileges revoke all on sequences from anon;
alter default privileges revoke all on functions from anon;

-- ---------- 7. Dados iniciais ----------
insert into public.ciclos (id, nome, inicio, fim) values
  (15, 'Ciclo 15', '2026-10-16', '2026-11-01'),
  (16, 'Ciclo 16', '2026-11-02', '2026-11-29'),
  (17, 'Ciclo 17', '2026-11-30', '2026-12-25');

-- Valores PROVISÓRIOS (ESPECIFICACAO.md §7); o admin ajusta na tela.
insert into public.parametros (chave, valor) values
  -- meta e divisão
  ('meta_total',                    '6000000'),
  ('meta_divisao_ciclos',           '"peso_2025"'),           -- peso_2025 | dias | digitada
  ('meta_pesos_ciclos',             '{"15": 0.1541, "16": 0.4031, "17": 0.4428}'),
  ('meta_ciclos_digitada',          '{}'),
  ('meta_divisao_lojas',            '"faturamento"'),         -- faturamento | vendedoras
  ('meta_faturamento_meses',        '["2026-07", "2026-08", "2026-09"]'),
  ('meta_pracas_digitada',          '{}'),
  ('simulador_vendas_vendedora_semana', '4'),
  -- preço e desconto
  ('preco_min',                     '180'),
  ('preco_max',                     '200'),
  ('preco_degrau',                  '5'),
  ('preco_terminacao',              '0.90'),
  ('desconto_min',                  '20'),
  ('desconto_max',                  '50'),
  ('desconto_alvo',                 '35'),
  ('limites_pracas',                '{}'),                    -- faixa de preço / desconto máx. por praça
  ('trava_custo',                   'true'),
  -- herói
  ('heroi_preco_min',               '99.9'),
  ('heroi_pct_min',                 '30'),
  ('heroi_estoque_min',             '10'),
  ('heroi_valor_promo',             'true'),
  ('heroi_sem_promo_usa_forte',     'true'),
  -- força e parado
  ('forca_pct_forte',               '27'),
  ('forca_pct_media',               '45'),
  ('parado_cobertura_dias',         '180'),
  -- pool da praça
  ('usar_hub',                      'true'),
  ('usar_er',                       'false'),
  ('pool_fornecedores',             '["BOT"]'),
  ('pool_estoque_min',              '3'),
  ('preco_zero',                    '"excluir"'),             -- excluir | usar_dsku (PENDENTE)
  ('fornecedor_pela_descricao',     'true'),                  -- PENDENTE
  -- surpresas e montagem
  ('surpresa_excluir_promo',        'true'),
  ('mimo_max',                      '1'),
  ('itens_min',                     '3'),
  ('itens_max',                     '6'),
  ('categoria_max',                 '2'),
  ('sku_max_kits_praca',            '6'),
  ('geracao_rodadas_max',           '15'),
  ('geracao_kits_max_praca',        '100'),
  ('temas',                         '["ela", "ele", "inf", "linha", "banho", "rosto", "cabelo"]');