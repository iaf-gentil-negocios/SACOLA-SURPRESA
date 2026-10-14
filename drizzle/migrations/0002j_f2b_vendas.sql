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
