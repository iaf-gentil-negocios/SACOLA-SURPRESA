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
