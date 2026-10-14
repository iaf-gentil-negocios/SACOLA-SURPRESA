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
