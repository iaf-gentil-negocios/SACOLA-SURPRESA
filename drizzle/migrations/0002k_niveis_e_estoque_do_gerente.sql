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
