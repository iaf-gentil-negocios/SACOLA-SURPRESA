-- CONFERÊNCIA DA ESTRUTURA DO BANCO (só lê, não muda nada).
-- Rode no SQL editor do banco antigo e do banco novo: as duas respostas têm de ser iguais, linha a
-- linha (quantidade e "assinatura" de cada item). Se alguma linha diferir, a estrutura diverge.
-- Compara só a estrutura do schema public (sem dados). A tabela teste_migracao fica de fora.
select item, quantidade, md5(lista) as assinatura
from (
  select 'colunas' as item, count(*) as quantidade,
         string_agg(concat_ws(',', table_name, column_name, data_type, udt_name, is_nullable,
                              column_default), '|' order by table_name, column_name) as lista
    from information_schema.columns
   where table_schema = 'public' and table_name <> 'teste_migracao'
  union all
  select 'tipos (enum)', count(*),
         string_agg(t.typname || '.' || e.enumlabel, '|' order by t.typname, e.enumsortorder)
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public'
  union all
  select 'tabelas com RLS', count(*),
         string_agg(c.relname || ':' || c.relrowsecurity, '|' order by c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'teste_migracao'
  union all
  select 'restrições', count(*),
         string_agg(c.relname || '.' || k.conname || ':' || pg_get_constraintdef(k.oid), '|'
                    order by c.relname, k.conname)
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname <> 'teste_migracao'
  union all
  select 'índices', count(*),
         string_agg(tablename || '.' || indexname || ':' || indexdef, '|' order by tablename, indexname)
    from pg_indexes
   where schemaname = 'public' and tablename <> 'teste_migracao'
  union all
  select 'funções', count(*),
         string_agg(concat_ws(',', p.proname, pg_get_function_identity_arguments(p.oid),
                              p.prosecdef, p.provolatile, array_to_string(p.proconfig, ';'),
                              md5(p.prosrc)), '|'
                    order by p.proname, pg_get_function_identity_arguments(p.oid))
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
  union all
  select 'permissões de funções', count(*),
         string_agg(proname || '(' || args || '):' || quem || ':' || privilege_type, '|'
                    order by proname, args, quem, privilege_type)
    from (
      select p.proname, pg_get_function_identity_arguments(p.oid) as args, a.privilege_type,
             case when a.grantee = 0 then 'public' else a.grantee::regrole::text end as quem
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where n.nspname = 'public'
    ) f
   where quem in ('public', 'anon', 'authenticated', 'service_role')
  union all
  select 'permissões de tabelas', count(*),
         string_agg(table_name || ':' || grantee || ':' || privilege_type, '|'
                    order by table_name, grantee, privilege_type)
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name <> 'teste_migracao'
     and grantee in ('anon', 'authenticated', 'service_role')
  union all
  select 'regras (policies)', count(*),
         string_agg(concat_ws(',', tablename, policyname, cmd, roles::text, qual, with_check), '|'
                    order by tablename, policyname)
    from pg_policies
   where schemaname = 'public'
  union all
  select 'gatilhos', count(*),
         string_agg(c.relname || '.' || t.tgname || ':' || pg_get_triggerdef(t.oid), '|'
                    order by c.relname, t.tgname)
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal
) x
order by item;
