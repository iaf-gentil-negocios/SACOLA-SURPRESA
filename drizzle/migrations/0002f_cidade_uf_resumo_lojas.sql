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
