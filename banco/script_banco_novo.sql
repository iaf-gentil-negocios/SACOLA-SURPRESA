-- SCRIPT DO BANCO NOVO (gerado por scripts/gerar-script-banco-novo.ts — não editar à mão).
-- Cria o banco inteiro do zero, no SQL editor do Lovable Cloud de um projeto NOVO (vazio):
-- 13 migrações, de 0001_etapa1_banco_rls_grants.sql a 0002k_niveis_e_estoque_do_gerente.sql, na ordem.
-- Roda tudo numa transação: se der erro em qualquer ponto, nada fica gravado e dá para rodar de novo.
-- NÃO rodar no banco antigo (que já tem tudo isso).
-- Depois, confira com banco/conferencia_banco.sql (rodado no banco antigo e no novo).

begin;

-- ======================================================================
-- 0001_etapa1_banco_rls_grants.sql
-- ======================================================================
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

-- ======================================================================
-- 0002_etapa5_2_upload_simulacoes_bases.sql
-- ======================================================================
-- =====================================================================
-- Sacola Surpresa — SQL acumulado para aplicar na etapa 5.2
-- Parte 1 (etapa 3): upload das bases + trava de admin no banco
-- Só ALTER/CREATE: nada é apagado. Funções novas: só service_role executa
-- (são chamadas pelas funções de servidor), e o gatilho não precisa de grant.
-- =====================================================================

-- ---------- 1. Controle dos envios ----------
alter table public.bases_envios
  add column status       text not null default 'em_andamento'
                          check (status in ('em_andamento', 'concluido', 'abandonado')),
  add column arquivo      text,
  add column concluido_em timestamptz,
  add column detalhes     jsonb not null default '{}'::jsonb;

-- Cada linha gravada guarda o envio que a trouxe. Ao concluir, o que não
-- veio no envio novo sai (ou, em lojas, fica inativo).
alter table public.lojas              add column envio_id bigint;
alter table public.estoque            add column envio_id bigint;
alter table public.promocoes          add column envio_id bigint;
alter table public.faturamento_mensal add column envio_id bigint;
alter table public.gerentes_lojas     add column envio_id bigint;

-- ---------- 2. Produtos: de onde veio cada dado ----------
alter table public.produtos
  add column envio_id        bigint,
  add column origem_cadastro text not null default 'dsku'
                             check (origem_cadastro in ('dsku', 'cobertura')),
  add column origem_nicho    text check (origem_nicho in ('base', 'subcategoria', 'marca', 'descricao', 'padrao_u')),
  add column origem_regular  text check (origem_regular in ('base', 'descricao'));

alter table public.produtos
  add constraint produtos_origem_fornecedor_chk
  check (origem_fornecedor in ('dsku', 'primeira_palavra', 'nao_encontrado'));

-- ---------- 3. Funções usadas pelo upload (só service_role) ----------

-- Completa os produtos que vieram só da cobertura (sem cadastro no dsku):
-- fornecedor e marca pela PRIMEIRA PALAVRA da descrição, usando o que é mais
-- comum no dsku para essa palavra (provisório, ESPECIFICACAO §5.2).
-- "regular" pela descrição (sem PRM/AMOST/AMOSTRA/MINI) e nicho pela marca
-- (listas MARCA_F/MARCA_M da referência) ou pela descrição (BABY/KIDS/INFANTIL),
-- senão U — mesma regra de src/lib/bases/nicho.ts, sem a subcategoria (que esses
-- produtos não têm). O que veio informado na base (origem "base") não muda.
create or replace function public.completar_produtos()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inferidos integer := 0;
  v_sem_par   integer := 0;
begin
  with mapa as (
    select primeira, fornecedor, marca
    from (
      select split_part(upper(btrim(descricao)), ' ', 1) as primeira,
             fornecedor, marca,
             row_number() over (
               partition by split_part(upper(btrim(descricao)), ' ', 1)
               order by count(*) desc, fornecedor, marca
             ) as rn
      from public.produtos
      where origem_cadastro = 'dsku' and fornecedor is not null
      group by 1, 2, 3
    ) x
    where rn = 1
  ),
  alvo as (
    select c.sku,
           m.fornecedor,
           coalesce(m.marca, split_part(upper(btrim(c.descricao)), ' ', 1)) as marca,
           case when m.primeira is null then 'nao_encontrado' else 'primeira_palavra' end as origem
    from public.produtos c
    left join mapa m on m.primeira = split_part(upper(btrim(c.descricao)), ' ', 1)
    where c.origem_cadastro = 'cobertura'
  )
  update public.produtos p
     set fornecedor        = a.fornecedor,
         marca             = a.marca,
         origem_fornecedor = a.origem,
         regular           = case when p.origem_regular = 'base' then p.regular
                                  else not (p.descricao ~* '\m(PRM|AMOST|AMOSTRA|MINI)\M') end,
         origem_regular    = case when p.origem_regular = 'base' then 'base' else 'descricao' end,
         nicho             = case when p.origem_nicho = 'base' then p.nicho
                                  when a.marca in ('NATIVA SPA', 'LILY', 'ESSENCE', 'FLORATTA', 'ELYSEE', 'LIZ', 'GLAMOUR', 'INTENSE', 'MAKE B.', 'HER CODE', 'ACCORDES', 'CELEBRE', 'THE BLEND') then 'F'
                                  when a.marca in ('MALBEC', 'QUASAR', 'ZAAD', 'UOMINI', 'ARBO', 'BOTICARIO MEN', 'CLASH', 'BOTICA 214 MEN') then 'M'
                                  when p.descricao ~* '\m(BABY|KIDS|INFANTIL)\M' then 'I'
                                  else 'U' end,
         origem_nicho      = case when p.origem_nicho = 'base' then 'base'
                                  when a.marca in ('NATIVA SPA', 'LILY', 'ESSENCE', 'FLORATTA', 'ELYSEE', 'LIZ', 'GLAMOUR', 'INTENSE', 'MAKE B.', 'HER CODE', 'ACCORDES', 'CELEBRE', 'THE BLEND', 'MALBEC', 'QUASAR', 'ZAAD', 'UOMINI', 'ARBO', 'BOTICARIO MEN', 'CLASH', 'BOTICA 214 MEN') then 'marca'
                                  when p.descricao ~* '\m(BABY|KIDS|INFANTIL)\M' then 'descricao'
                                  else 'padrao_u' end,
         atualizado_em     = now()
    from alvo a
   where p.sku = a.sku;

  select count(*) filter (where origem_fornecedor = 'primeira_palavra'),
         count(*) filter (where origem_fornecedor = 'nao_encontrado')
    into v_inferidos, v_sem_par
    from public.produtos
   where origem_cadastro = 'cobertura';

  return jsonb_build_object('inferidos_primeira_palavra', v_inferidos, 'sem_par_no_dsku', v_sem_par);
end;
$$;

-- Vendedoras por loja: substitui tudo (loja fora do arquivo fica com 0).
-- p_dados = {"<bcps>": <quantidade>, ...}
create or replace function public.aplicar_vendedoras(p_dados jsonb)
returns integer
language sql
security invoker
set search_path = ''
as $$
  with u as (
    update public.lojas l
       set vendedoras    = coalesce((p_dados ->> l.bcps)::integer, 0),
           atualizado_em = now()
     where l.tipo = 'loja'
    returning l.vendedoras
  )
  select count(*)::integer from u where vendedoras > 0;
$$;

-- Divisão e canais das lojas, vindos da base de gerentes (só lojas que já existem).
-- p_dados = [{"bcps": "...", "divisao": "...", "canal_geral": "...", "canais": ["Varejo", ...]}, ...]
create or replace function public.aplicar_info_lojas(p_dados jsonb)
returns integer
language sql
security invoker
set search_path = ''
as $$
  with u as (
    update public.lojas l
       set divisao       = coalesce(x.divisao, l.divisao),
           canal_geral   = coalesce(x.canal_geral, l.canal_geral),
           canais        = coalesce(x.canais, l.canais),
           atualizado_em = now()
      from jsonb_to_recordset(p_dados) as x(bcps text, divisao text, canal_geral text, canais text[])
     where l.bcps = x.bcps
    returning 1
  )
  select count(*)::integer from u;
$$;

-- Conclui um envio: tira o que não veio no envio novo, conta e marca concluído.
create or replace function public.finalizar_envio(p_envio bigint)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_base      text;
  v_ciclo     smallint;
  v_linhas    integer := 0;
  v_removidas integer := 0;
  v_extra     jsonb := '{}'::jsonb;
begin
  select base, ciclo into v_base, v_ciclo
    from public.bases_envios
   where id = p_envio and status = 'em_andamento'
   for update;
  if v_base is null then
    raise exception 'Envio % não está em andamento.', p_envio;
  end if;

  if v_base = 'cobertura' then
    delete from public.estoque where envio_id is distinct from p_envio;
    get diagnostics v_removidas = row_count;
    select count(*) into v_linhas from public.estoque;
    v_extra := jsonb_build_object(
      'lojas',             (select count(distinct bcps) from public.estoque),
      'skus',              (select count(distinct sku) from public.estoque),
      'preco_zero',        (select count(*) from public.estoque where preco = 0),
      'skus_sem_cadastro', (select count(distinct e.sku) from public.estoque e
                             where not exists (select 1 from public.produtos p where p.sku = e.sku))
    ) || public.completar_produtos();

  elsif v_base = 'produtos' then
    -- cadastro é cumulativo: não apaga produto antigo
    select count(*) into v_linhas from public.produtos where envio_id = p_envio;
    v_extra := public.completar_produtos();

  elsif v_base = 'promocao' then
    delete from public.promocoes where ciclo = v_ciclo and envio_id is distinct from p_envio;
    get diagnostics v_removidas = row_count;
    select count(*) into v_linhas from public.promocoes where ciclo = v_ciclo;

  elsif v_base = 'faturamento' then
    delete from public.faturamento_mensal where envio_id is distinct from p_envio;
    get diagnostics v_removidas = row_count;
    select count(*) into v_linhas from public.faturamento_mensal;

  elsif v_base = 'lojas' then
    -- nunca apaga loja (escopos e gerentes apontam para ela): só inativa
    update public.lojas set ativo = false, atualizado_em = now()
     where envio_id is distinct from p_envio and ativo;
    get diagnostics v_removidas = row_count;
    select count(*) into v_linhas from public.lojas where envio_id = p_envio;

  elsif v_base = 'gerentes' then
    delete from public.gerentes_lojas where envio_id is distinct from p_envio;
    get diagnostics v_removidas = row_count;
    select count(*) into v_linhas from public.gerentes_lojas;

  elsif v_base = 'vendedoras' then
    select count(*) into v_linhas from public.lojas where tipo = 'loja' and vendedoras > 0;
    v_extra := jsonb_build_object('vendedoras', (select coalesce(sum(vendedoras), 0) from public.lojas where tipo = 'loja'));
  end if;

  update public.bases_envios
     set status       = 'concluido',
         concluido_em = now(),
         linhas       = v_linhas,
         detalhes     = detalhes || v_extra || jsonb_build_object('removidas', v_removidas)
   where id = p_envio;

  return v_extra || jsonb_build_object('linhas', v_linhas, 'removidas', v_removidas);
end;
$$;

revoke all on function public.completar_produtos()        from public, anon, authenticated;
revoke all on function public.aplicar_vendedoras(jsonb)   from public, anon, authenticated;
revoke all on function public.finalizar_envio(bigint)     from public, anon, authenticated;
revoke all on function public.aplicar_info_lojas(jsonb)   from public, anon, authenticated;
grant execute on function public.completar_produtos()      to service_role;
grant execute on function public.aplicar_vendedoras(jsonb) to service_role;
grant execute on function public.aplicar_info_lojas(jsonb) to service_role;
grant execute on function public.finalizar_envio(bigint)   to service_role;

-- ---------- 4. Trava no banco: nunca sem admin ativo (pendência 14) ----------
create or replace function public.trava_admin_ativo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.perfil = 'admin' and old.ativo
     and (tg_op = 'DELETE' or new.perfil <> 'admin' or not new.ativo) then
    -- serializa mudanças simultâneas em admins
    perform 1 from public.perfis where perfil = 'admin' and ativo for update;
    if not exists (
      select 1 from public.perfis
       where perfil = 'admin' and ativo and user_id <> old.user_id
    ) then
      raise exception 'O sistema precisa de pelo menos um admin ativo.';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.trava_admin_ativo() from public, anon, authenticated;

create trigger perfis_trava_admin
  before update of perfil, ativo or delete on public.perfis
  for each row execute function public.trava_admin_ativo();


-- =====================================================================
-- Parte 2 (etapas 4 e 5): motor por loja, simulações, bases por período
-- Tabelas e colunas NOVAS; nada é apagado. As tabelas antigas plano_kits,
-- plano_kit_itens, plano_kit_lojas e plano_kits_admin ficam sem uso
-- (substituídas pelas base_*).
-- =====================================================================

-- ---------- 2.1 Parâmetros do motor por loja ----------
insert into public.parametros (chave, valor) values
  ('sku_max_kits_loja',       '6'),
  ('geracao_kits_max_loja',   '20'),
  ('forca_vmd_zero_fraca',    'true'),
  ('reaproveitar_kits_praca', 'true')
on conflict (chave) do nothing;

-- HUB e ER não entram mais no mix (só o estoque da própria loja)
update public.parametros set valor = 'false', atualizado_em = now()
 where chave in ('usar_hub', 'usar_er');

-- ---------- 2.2 Simulações salvas (só admin) ----------
create table public.simulacoes (
  id         bigint generated always as identity primary key,
  nome       text not null check (length(btrim(nome)) between 1 and 120),
  ciclo      smallint not null references public.ciclos (id),
  semente    bigint not null,
  pracas     text[],
  parametros jsonb not null,
  resumo     jsonb not null default '{}'::jsonb,
  status     text not null default 'gravando' check (status in ('gravando', 'salva')),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em  timestamptz not null default now()
);
create index simulacoes_ciclo_idx on public.simulacoes (ciclo, criado_em desc);

create table public.simulacao_kits (
  simulacao_id bigint not null references public.simulacoes (id) on delete cascade,
  codigo       text not null,
  tema         text not null,
  nicho        text,
  preco        numeric(12,2) not null,
  valor_cheio  numeric(12,2) not null,
  desconto_pct numeric(5,2) not null,
  heroi_sku    text not null,
  composicao   text not null,
  lojas        integer not null default 0,
  primary key (simulacao_id, codigo)
);

create table public.simulacao_kit_itens (
  simulacao_id bigint not null,
  codigo       text not null,
  ordem        smallint not null,
  papel        public.kit_papel not null,
  sku          text not null,
  descricao    text not null,
  preco_item   numeric(12,2) not null,
  promo_pct    numeric(5,2),
  primary key (simulacao_id, codigo, ordem),
  foreign key (simulacao_id, codigo) references public.simulacao_kits (simulacao_id, codigo) on delete cascade
);

create table public.simulacao_kit_lojas (
  simulacao_id bigint not null,
  codigo       text not null,
  bcps         text not null,
  qtd          integer not null check (qtd >= 0),
  custo        numeric(12,2) not null,
  margem       numeric(12,2) not null,
  valor_cheio  numeric(12,2) not null,
  desconto_pct numeric(5,2) not null,
  reaproveitado boolean not null default false,
  detalhes     jsonb not null default '[]'::jsonb,
  primary key (simulacao_id, codigo, bcps),
  foreign key (simulacao_id, codigo) references public.simulacao_kits (simulacao_id, codigo) on delete cascade
);
create index simulacao_kit_lojas_bcps_idx on public.simulacao_kit_lojas (simulacao_id, bcps);

create table public.simulacao_lojas (
  simulacao_id       bigint not null references public.simulacoes (id) on delete cascade,
  bcps               text not null,
  praca              text not null,
  vendedoras         integer not null default 0,
  meta               numeric(14,2) not null,
  meta_semana        numeric(14,2),
  meta_vend_semana   numeric(14,2),
  metas_mes          jsonb not null default '{}'::jsonb,
  sacolas_meta       integer not null default 0,
  sacolas_possiveis  integer not null default 0,
  sacolas_planejadas integer not null default 0,
  receita            numeric(14,2) not null default 0,
  custo              numeric(14,2) not null default 0,
  pool_tamanho       integer not null default 0,
  avisos             jsonb not null default '[]'::jsonb,
  primary key (simulacao_id, bcps)
);

-- ---------- 2.3 Bases por período (o que o gerente vê) ----------
-- `planos` passa a ser a "base": nome, simulação de origem e período.
alter table public.planos
  add column nome         text,
  add column simulacao_id bigint references public.simulacoes (id) on delete set null,
  add column inicio       date,
  add column fim          date;

create table public.base_kits (
  plano_id     bigint not null references public.planos (id) on delete cascade,
  codigo       text not null,
  tema         text not null,
  nicho        text,
  preco        numeric(12,2) not null,
  valor_cheio  numeric(12,2) not null,
  desconto_pct numeric(5,2) not null,
  heroi_sku    text not null,
  primary key (plano_id, codigo)
);

create table public.base_kit_itens (
  plano_id   bigint not null,
  codigo     text not null,
  ordem      smallint not null,
  papel      public.kit_papel not null,
  sku        text not null,
  descricao  text not null,
  preco_item numeric(12,2) not null,
  promo_pct  numeric(5,2),
  primary key (plano_id, codigo, ordem),
  foreign key (plano_id, codigo) references public.base_kits (plano_id, codigo) on delete cascade
);

create table public.base_kit_lojas (
  plano_id bigint not null,
  codigo   text not null,
  bcps     text not null,
  qtd      integer not null check (qtd >= 0),
  primary key (plano_id, codigo, bcps),
  foreign key (plano_id, codigo) references public.base_kits (plano_id, codigo) on delete cascade
);
create index base_kit_lojas_bcps_idx on public.base_kit_lojas (plano_id, bcps);

-- custo, margem e detalhes (força/cobertura/estoque) por loja — só admin
create table public.base_kit_lojas_admin (
  plano_id     bigint not null,
  codigo       text not null,
  bcps         text not null,
  custo        numeric(12,2) not null,
  margem       numeric(12,2) not null,
  valor_cheio  numeric(12,2) not null,
  desconto_pct numeric(5,2) not null,
  detalhes     jsonb not null default '[]'::jsonb,
  primary key (plano_id, codigo, bcps),
  foreign key (plano_id, codigo, bcps) references public.base_kit_lojas (plano_id, codigo, bcps) on delete cascade
);

-- cobertura da meta por loja — só admin
create table public.base_lojas (
  plano_id           bigint not null references public.planos (id) on delete cascade,
  bcps               text not null,
  sacolas_meta       integer not null default 0,
  sacolas_possiveis  integer not null default 0,
  sacolas_planejadas integer not null default 0,
  receita            numeric(14,2) not null default 0,
  custo              numeric(14,2) not null default 0,
  primary key (plano_id, bcps)
);

-- meta mensal por loja (meta do ciclo dividida pelos dias de cada mês)
create table public.base_metas_mensais (
  plano_id bigint not null references public.planos (id) on delete cascade,
  bcps     text not null,
  mes      date not null check (extract(day from mes) = 1),
  meta     numeric(14,2) not null,
  primary key (plano_id, bcps, mes)
);

-- ---------- 2.4 Período da base: dentro do ciclo e sem sobrepor ----------
create or replace function public.validar_periodo_base()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inicio date;
  v_fim    date;
begin
  if new.inicio is null and new.fim is null then
    return new;
  end if;
  if new.inicio is null or new.fim is null or new.fim < new.inicio then
    raise exception 'Período da base inválido: informe início e fim (fim depois do início).';
  end if;
  -- uma definição de base por ciclo de cada vez
  perform pg_advisory_xact_lock(new.ciclo);
  select inicio, fim into v_inicio, v_fim from public.ciclos where id = new.ciclo;
  if new.inicio < v_inicio or new.fim > v_fim then
    raise exception 'O período da base precisa ficar dentro do ciclo (% a %).',
      to_char(v_inicio, 'DD/MM/YYYY'), to_char(v_fim, 'DD/MM/YYYY');
  end if;
  if exists (
    select 1 from public.planos o
     where o.ciclo = new.ciclo and o.id <> new.id and o.inicio is not null
       and o.inicio <= new.fim and o.fim >= new.inicio
  ) then
    raise exception 'Já existe uma base deste ciclo com período que se sobrepõe a este.';
  end if;
  return new;
end;
$$;

revoke all on function public.validar_periodo_base() from public, anon, authenticated;

create trigger planos_periodo_base
  before insert or update of inicio, fim, ciclo on public.planos
  for each row execute function public.validar_periodo_base();

-- ---------- 2.5 Visibilidade: o gerente vê só bases já iniciadas ----------
-- (data de São Paulo; bases futuras só o admin vê)
create or replace function public.base_iniciada(p_plano bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.planos p
     where p.id = p_plano
       and p.inicio is not null
       and p.inicio <= (now() at time zone 'America/Sao_Paulo')::date
  );
$$;

revoke all on function public.base_iniciada(bigint) from public, anon;
grant execute on function public.base_iniciada(bigint) to authenticated, service_role;

alter policy planos_ler_vigente on public.planos
  using (
    inicio is not null
    and inicio <= (now() at time zone 'America/Sao_Paulo')::date
    and public.usuario_ativo()
  );

alter policy plano_metas_ler_escopo on public.plano_metas
  using (bcps in (select public.lojas_do_usuario()) and public.base_iniciada(plano_id));

-- ---------- 2.6 RLS das tabelas novas (antes dos GRANTs) ----------
alter table public.simulacoes           enable row level security;
alter table public.simulacao_kits       enable row level security;
alter table public.simulacao_kit_itens  enable row level security;
alter table public.simulacao_kit_lojas  enable row level security;
alter table public.simulacao_lojas      enable row level security;
alter table public.base_kits            enable row level security;
alter table public.base_kit_itens       enable row level security;
alter table public.base_kit_lojas       enable row level security;
alter table public.base_kit_lojas_admin enable row level security;
alter table public.base_lojas           enable row level security;
alter table public.base_metas_mensais   enable row level security;

create policy admin_tudo on public.simulacoes           for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.simulacao_kits       for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.simulacao_kit_itens  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.simulacao_kit_lojas  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.simulacao_lojas      for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.base_kits            for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.base_kit_itens       for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.base_kit_lojas       for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.base_kit_lojas_admin for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.base_lojas           for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_tudo on public.base_metas_mensais   for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- gerente: só lojas do escopo, só bases já iniciadas
create policy base_kit_lojas_ler_escopo on public.base_kit_lojas
  for select to authenticated
  using (bcps in (select public.lojas_do_usuario()) and public.base_iniciada(plano_id));

create policy base_kits_ler_escopo on public.base_kits
  for select to authenticated
  using (
    public.base_iniciada(plano_id)
    and exists (
      select 1 from public.base_kit_lojas kl
       where kl.plano_id = base_kits.plano_id
         and kl.codigo = base_kits.codigo
         and kl.bcps in (select public.lojas_do_usuario())
    )
  );

create policy base_kit_itens_ler_escopo on public.base_kit_itens
  for select to authenticated
  using (
    public.base_iniciada(plano_id)
    and exists (
      select 1 from public.base_kit_lojas kl
       where kl.plano_id = base_kit_itens.plano_id
         and kl.codigo = base_kit_itens.codigo
         and kl.bcps in (select public.lojas_do_usuario())
    )
  );

create policy base_metas_mensais_ler_escopo on public.base_metas_mensais
  for select to authenticated
  using (bcps in (select public.lojas_do_usuario()) and public.base_iniciada(plano_id));

-- simulacoes, simulacao_*, base_kit_lojas_admin, base_lojas: só admin (admin_tudo)

-- ---------- 2.7 GRANTs das tabelas novas (depois da RLS) ----------
revoke all on
  public.simulacoes, public.simulacao_kits, public.simulacao_kit_itens, public.simulacao_kit_lojas,
  public.simulacao_lojas, public.base_kits, public.base_kit_itens, public.base_kit_lojas,
  public.base_kit_lojas_admin, public.base_lojas, public.base_metas_mensais
  from anon;

grant select, insert, update, delete on
  public.simulacoes, public.simulacao_kits, public.simulacao_kit_itens, public.simulacao_kit_lojas,
  public.simulacao_lojas, public.base_kits, public.base_kit_itens, public.base_kit_lojas,
  public.base_kit_lojas_admin, public.base_lojas, public.base_metas_mensais
  to authenticated;

grant all on
  public.simulacoes, public.simulacao_kits, public.simulacao_kit_itens, public.simulacao_kit_lojas,
  public.simulacao_lojas, public.base_kits, public.base_kit_itens, public.base_kit_lojas,
  public.base_kit_lojas_admin, public.base_lojas, public.base_metas_mensais
  to service_role;

grant usage on all sequences in schema public to authenticated, service_role;

-- ---------- 2.8 Definir uma simulação salva como base (só servidor) ----------
create or replace function public.definir_base(
  p_simulacao bigint,
  p_nome      text,
  p_inicio    date,
  p_fim       date,
  p_usuario   uuid
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ciclo smallint;
  v_param jsonb;
  v_plano bigint;
begin
  select ciclo, parametros into v_ciclo, v_param
    from public.simulacoes
   where id = p_simulacao and status = 'salva';
  if v_ciclo is null then
    raise exception 'Simulação % não encontrada ou ainda não salva.', p_simulacao;
  end if;

  -- o gatilho valida o período (dentro do ciclo, sem sobrepor)
  insert into public.planos (ciclo, vigente, criado_por, publicado_em, nome, simulacao_id, inicio, fim)
  values (v_ciclo, false, p_usuario, now(), btrim(p_nome), p_simulacao, p_inicio, p_fim)
  returning id into v_plano;

  insert into public.plano_parametros (plano_id, parametros) values (v_plano, v_param);

  insert into public.plano_metas (plano_id, bcps, meta, vendedoras, meta_semana, meta_vend_semana)
  select v_plano, bcps, meta, vendedoras, meta_semana, meta_vend_semana
    from public.simulacao_lojas where simulacao_id = p_simulacao;

  insert into public.base_metas_mensais (plano_id, bcps, mes, meta)
  select v_plano, l.bcps, (m.key || '-01')::date, round(m.value::numeric, 2)
    from public.simulacao_lojas l, jsonb_each_text(l.metas_mes) m
   where l.simulacao_id = p_simulacao;

  insert into public.base_lojas (plano_id, bcps, sacolas_meta, sacolas_possiveis, sacolas_planejadas, receita, custo)
  select v_plano, bcps, sacolas_meta, sacolas_possiveis, sacolas_planejadas, receita, custo
    from public.simulacao_lojas where simulacao_id = p_simulacao;

  -- só os kits com sacolas planejadas
  insert into public.base_kits (plano_id, codigo, tema, nicho, preco, valor_cheio, desconto_pct, heroi_sku)
  select v_plano, k.codigo, k.tema, k.nicho, k.preco, k.valor_cheio, k.desconto_pct, k.heroi_sku
    from public.simulacao_kits k
   where k.simulacao_id = p_simulacao
     and exists (select 1 from public.simulacao_kit_lojas kl
                  where kl.simulacao_id = k.simulacao_id and kl.codigo = k.codigo and kl.qtd > 0);

  insert into public.base_kit_itens (plano_id, codigo, ordem, papel, sku, descricao, preco_item, promo_pct)
  select v_plano, i.codigo, i.ordem, i.papel, i.sku, i.descricao, i.preco_item, i.promo_pct
    from public.simulacao_kit_itens i
   where i.simulacao_id = p_simulacao
     and exists (select 1 from public.base_kits b where b.plano_id = v_plano and b.codigo = i.codigo);

  insert into public.base_kit_lojas (plano_id, codigo, bcps, qtd)
  select v_plano, codigo, bcps, qtd
    from public.simulacao_kit_lojas where simulacao_id = p_simulacao and qtd > 0;

  insert into public.base_kit_lojas_admin (plano_id, codigo, bcps, custo, margem, valor_cheio, desconto_pct, detalhes)
  select v_plano, codigo, bcps, custo, margem, valor_cheio, desconto_pct, detalhes
    from public.simulacao_kit_lojas where simulacao_id = p_simulacao and qtd > 0;

  return v_plano;
end;
$$;

revoke all on function public.definir_base(bigint, text, date, date, uuid) from public, anon, authenticated;
grant execute on function public.definir_base(bigint, text, date, date, uuid) to service_role;

-- ======================================================================
-- 0002a_lojas_participacao.sql
-- ======================================================================
-- Parte B (10/10/2026): todas as lojas da dCentros + "participa" (sim/não).
-- APLICADO PELO SQL EDITOR do Lovable Cloud em 10/10/2026 (sem créditos do Lovable), NÃO pela ferramenta de
-- migração: por isso este arquivo não está em meta/_journal.json. Ele fica aqui para o histórico
-- do banco não divergir do repositório e para os testes locais (PGlite) aplicarem a mudança.
-- Pode rodar mais de uma vez sem efeito: tudo é "if not exists", e a marcação inicial de
-- "participa" só acontece quando a coluna é criada (não desfaz escolhas feitas depois).

-- Venda Direta (fora ER) e Escritório: centros que não são loja, HUB nem ER.
alter type public.loja_tipo add value if not exists 'outro';

alter table public.lojas
  add column if not exists tipo_dcentros text,
  add column if not exists sap           text,
  add column if not exists centro_custo  text,
  add column if not exists marca         text;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'lojas' and column_name = 'participa'
  ) then
    alter table public.lojas add column participa boolean not null default false;
    -- primeira vez: as lojas (Varejo/Híbrida) ativas participam, menos as QDB
    update public.lojas
       set participa = true
     where tipo = 'loja' and ativo and nome not ilike 'QDB%';
  end if;
end;
$$;

-- ======================================================================
-- 0002b_hierarquia_gerentes.sql
-- ======================================================================
-- Parte C (10/10/2026): acesso pela hierarquia de gerentes (dGerentes) + diretoria que vê todas as lojas.
-- APLICADO PELO SQL EDITOR do Lovable Cloud em 10/10/2026 (sem créditos do Lovable): por isso
-- não está em meta/_journal.json. Pode rodar mais de uma vez sem efeito.
-- A hierarquia é a tabela gerentes_lojas (BCPS, nível GVO/GCVO-GPVO/GRVO, matrícula), loja por loja,
-- vinda das colunas da dGerentes. A matrícula só identifica a pessoa: nunca define quem está acima.

-- perfil dos usuários criados pela hierarquia (o papel vem da matrícula)
alter type public.perfil_tipo add value if not exists 'gerente';

-- diretoria: perfil de gerente que vê todas as lojas
alter table public.perfis add column if not exists ve_todas boolean not null default false;
create index if not exists perfis_matricula_idx on public.perfis (matricula);

-- lojas de um usuário: o próprio ou, para o admin, qualquer um ("ver como gerente")
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
   where exists (select 1 from alvo where alvo.perfil = 'admin' or alvo.ve_todas)
  union
  select gl.bcps from public.gerentes_lojas gl
    join alvo on alvo.matricula is not null and gl.matricula = alvo.matricula;
$$;

revoke all on function public.lojas_de(uuid) from public, anon;
grant execute on function public.lojas_de(uuid) to authenticated, service_role;

-- as regras de leitura (RLS) já usam esta função: passam a seguir a hierarquia
create or replace function public.lojas_do_usuario()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select public.lojas_de((select auth.uid()));
$$;

-- ======================================================================
-- 0002c_periodo_base_livre.sql
-- ======================================================================
-- Data da base livre (11/10/2026). APLICADO PELO SQL EDITOR do Lovable Cloud em 11/10/2026
-- (sem créditos do Lovable): por isso não está em meta/_journal.json. Pode rodar mais de uma vez.
-- Período da base: datas livres (fora do ciclo só gera aviso na tela);
-- continua exigindo fim >= início e sem sobrepor outra base do mesmo ciclo.
create or replace function public.validar_periodo_base()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.inicio is null and new.fim is null then
    return new;
  end if;
  if new.inicio is null or new.fim is null or new.fim < new.inicio then
    raise exception 'Período da base inválido: informe início e fim (fim depois do início).';
  end if;
  perform pg_advisory_xact_lock(new.ciclo);
  if exists (
    select 1 from public.planos o
     where o.ciclo = new.ciclo and o.id <> new.id and o.inicio is not null
       and o.inicio <= new.fim and o.fim >= new.inicio
  ) then
    raise exception 'Já existe uma base deste ciclo com período que se sobrepõe a este.';
  end if;
  return new;
end;
$$;

revoke all on function public.validar_periodo_base() from public, anon, authenticated;

-- ======================================================================
-- 0002d_divergencias_disponibilidade.sql
-- ======================================================================
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

-- ======================================================================
-- 0002e_acompanhamento_dashboard.sql
-- ======================================================================
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

-- ======================================================================
-- 0002f_cidade_uf_resumo_lojas.sql
-- ======================================================================
-- Parte F2a, ajuste do dashboard (12/10/2026): cidade e UF das lojas (dCentros) e resumo da base por loja.
-- APLICADO PELO SQL EDITOR do Lovable Cloud em 12/10/2026 (sem créditos do Lovable): por isso não está
-- em meta/_journal.json. Pode rodar mais de uma vez sem efeito. Não apaga tabela nem dado nenhum.

-- ---------- 1. Cidade e UF da dCentros (o upload passa a gravar; o mapa vem na F2b) ----------
alter table public.lojas add column if not exists cidade text, add column if not exists uf text;

-- ---------- 2. Resumo da base por loja (dashboard do admin e Painel do gerente) ----------
-- Uma linha por loja: sacolas, receita e "pode montar hoje" já somados, no lugar de ler todos os
-- kits e itens. Custo só para admin/acompanhamento (gerente recebe nulo). Gerente: só lojas do
-- escopo e só base já iniciada (mesma regra da RLS).
create or replace function public.resumo_lojas_da_base(p_plano bigint)
returns table (bcps text, sacolas_meta integer, sacolas_planejadas integer, receita numeric,
               custo numeric, capacidade integer, disponivel_ref date)
language sql stable security definer set search_path = '' as $$
  select bl.bcps, bl.sacolas_meta, bl.sacolas_planejadas, bl.receita,
         case when public.ve_dados_admin() then bl.custo end,   -- gerente recebe custo nulo
         (select max(kl.capacidade_loja) from public.base_kit_lojas kl
           where kl.plano_id = bl.plano_id and kl.bcps = bl.bcps),
         (select max(kl.disponivel_ref) from public.base_kit_lojas kl
           where kl.plano_id = bl.plano_id and kl.bcps = bl.bcps)
    from public.base_lojas bl
   where bl.plano_id = p_plano
     and (public.ve_dados_admin()
          or (bl.bcps in (select public.lojas_do_usuario()) and public.base_iniciada(p_plano)));
$$;
revoke all on function public.resumo_lojas_da_base(bigint) from public, anon;
grant execute on function public.resumo_lojas_da_base(bigint) to authenticated;

-- ======================================================================
-- 0002g_rls_uma_vez_por_consulta.sql
-- ======================================================================
-- Revisão de consumo, item 1 (12/10/2026): as regras de acesso (RLS) chamavam is_admin(),
-- ve_dados_admin() e usuario_ativo() UMA VEZ POR LINHA lida (ex.: ~200 mil vezes numa leitura do
-- estoque, cada uma consultando perfis). Com "(select …)" o Postgres calcula uma vez por consulta
-- (recomendação do Supabase: "auth_rls_initplan"). A regra de quem vê o quê NÃO muda.
-- APLICADO PELO SQL EDITOR do Lovable Cloud em 12/10/2026 (conferência vazia): por isso não está em
-- meta/_journal.json. Pode rodar mais de uma vez sem efeito. Não apaga tabela nem dado nenhum.
-- (base_iniciada(plano_id) depende da linha e continua por linha: pendência 20.8 da especificação.)

do $$
declare
  t text;
begin
  -- admin_tudo: admin lê e grava tudo
  for t in
    select tablename from pg_policies where schemaname = 'public' and policyname = 'admin_tudo'
  loop
    execute format(
      'alter policy admin_tudo on public.%I using ((select public.is_admin())) with check ((select public.is_admin()))',
      t
    );
  end loop;

  -- acompanhamento_ler (0002e): admin ou acompanhamento ativo leem
  for t in
    select tablename from pg_policies where schemaname = 'public' and policyname = 'acompanhamento_ler'
  loop
    execute format(
      'alter policy acompanhamento_ler on public.%I using ((select public.ve_dados_admin()))',
      t
    );
  end loop;
end;
$$;

-- ciclos: qualquer usuário ativo lê
alter policy ciclos_ler on public.ciclos
  using ((select public.usuario_ativo()));

-- histórico de acessos: só admin lê
alter policy acessos_admin_ler on public.acessos_log
  using ((select public.is_admin()));

-- bases (planos): gerente ativo vê as já iniciadas (mesma regra da 0002)
alter policy planos_ler_vigente on public.planos
  using (
    inicio is not null
    and inicio <= (now() at time zone 'America/Sao_Paulo')::date
    and (select public.usuario_ativo())
  );

-- ======================================================================
-- 0002h_gravacao_direta.sql
-- ======================================================================
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

-- ======================================================================
-- 0002i_nome_completo_lojas.sql
-- ======================================================================
-- Busca de lojas pelo nome completo (12/10/2026): o banco guardava só o "Nome Abreviado" da dCentros
-- (ex.: "Hiper M" para Carrefour Mossoró). A coluna nova guarda o "Nome" completo; a tela continua
-- mostrando o abreviado, e a busca procura nos dois. O upload da dCentros passa a gravar a coluna.
-- APLICADO PELO SQL EDITOR do Lovable Cloud em 12/10/2026 (script único; conferência ok): por isso não está em
-- meta/_journal.json. Pode rodar mais de uma vez sem efeito. Não apaga tabela nem dado nenhum.
alter table public.lojas add column if not exists nome_completo text;

-- ======================================================================
-- 0002j_f2b_vendas.sql
-- ======================================================================
-- Parte F2b (12/10/2026): acompanhamento de vendas do canal App Delivery.
-- O arquivo (export "Quebrar Por Data") é lido no navegador do admin; o banco guarda só o resumo por
-- loja e dia (GMV, boletos, itens) e o ruído calculado por loja e dia da semana. Declarações dos GVOs
-- com aprovação do admin. Nada de cupom ou item cru.
-- APLICADO PELO SQL EDITOR do Lovable Cloud em 12/10/2026 (script único; conferência ok): por isso não está em
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
-- 0002k_niveis_e_estoque_do_gerente.sql
-- ======================================================================
-- Lote de melhorias de 13/10/2026 — APLICADO PELO SQL EDITOR do Lovable Cloud em 13/10/2026
-- (conferência com tudo true): por isso não está em meta/_journal.json. Pode rodar mais de uma vez sem efeito.
-- Não apaga tabela nem dado nenhum. Nada de custo ou margem é liberado ao gerente.
--
-- P3 (mapa): o app precisa saber os níveis do usuário logado na hierarquia (GVO, GCVO/GPVO, GRVO)
--            para esconder o mapa do GVO. A hierarquia (gerentes_lojas) continua só do admin;
--            a função devolve só os níveis do próprio usuário.
-- P4 (simulador por kits limitado pelo estoque): o gerente passa a ler a foto do estoque dos
--            produtos dos kits (base_lojas_estoque, gravada a cada Cobertura: { sku: estoque },
--            sem custo) das lojas do escopo, só de bases já iniciadas — a mesma regra de
--            base_kit_lojas. A tabela estoque (com custo) continua só do admin.

-- ---------- 1. Níveis do usuário logado na hierarquia (P3) ----------
create or replace function public.meus_niveis()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct gl.nivel::text
    from public.gerentes_lojas gl
    join public.perfis p on p.matricula = gl.matricula
   where p.user_id = (select auth.uid())
     and p.ativo;
$$;

revoke all on function public.meus_niveis() from public, anon;
grant execute on function public.meus_niveis() to authenticated;

-- ---------- 2. Gerente lê a foto do estoque dos kits das lojas do escopo (P4) ----------
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'base_lojas_estoque'
       and policyname = 'base_lojas_estoque_ler_escopo'
  ) then
    create policy base_lojas_estoque_ler_escopo on public.base_lojas_estoque
      for select to authenticated
      using (bcps in (select public.lojas_do_usuario()) and public.base_iniciada(plano_id));
  end if;
end;
$$;

-- (o grant de select para authenticated já existe desde o 0002d; a RLS filtra as linhas)
grant select on public.base_lojas_estoque to authenticated;

commit;
