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
