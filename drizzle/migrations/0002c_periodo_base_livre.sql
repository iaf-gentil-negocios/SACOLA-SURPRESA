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
