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