// Área do gerente: o usuário mostrado vê o mapa? (P3) A regra está em ./acesso.ts.
// - gerente logado: os níveis dele vêm da função meus_niveis() (0002k), pela matrícula;
// - "Ver como": o admin lê o perfil e a hierarquia do gerente escolhido (só o admin lê essas tabelas);
// - modo local: o perfil de teste.
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { VisaoGerente } from "@/lib/gerente/visao";
import { MODO_LOCAL, perfilLocal } from "@/lib/modo-local";

import { papeisDoUsuario, veOMapa } from "./acesso";

type PerfilMapa = { perfil: string; ve_todas?: boolean | null };

async function niveisDoVerComo(userId: string): Promise<{ perfil: PerfilMapa; niveis: string[] }> {
  const p = await supabase
    .from("perfis")
    .select("perfil, ve_todas, matricula" as "*")
    .eq("user_id", userId)
    .maybeSingle();
  if (p.error) throw new Error(p.error.message);
  const perfil = (p.data ?? { perfil: "" }) as unknown as PerfilMapa & {
    matricula?: string | null;
  };
  if (!perfil.matricula) return { perfil, niveis: [] };
  const n = await supabase
    .from("gerentes_lojas" as never)
    .select("nivel")
    .eq("matricula" as never, perfil.matricula as never);
  if (n.error) throw new Error(n.error.message);
  return { perfil, niveis: ((n.data ?? []) as { nivel: string }[]).map((x) => x.nivel) };
}

export function useVeMapaGerente(visao: VisaoGerente, eu: PerfilMapa) {
  return useQuery({
    queryKey: ["gerente", visao.userId, "ve-mapa"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<boolean> => {
      if (MODO_LOCAL) return veOMapa(papeisDoUsuario(perfilLocal(), []));
      if (visao.verComo) {
        const { perfil, niveis } = await niveisDoVerComo(visao.userId);
        return veOMapa(papeisDoUsuario(perfil, niveis));
      }
      // função do 0002k (SQL editor), ainda fora do types.ts
      const { data, error } = await supabase.rpc("meus_niveis" as never);
      if (error) throw new Error(error.message);
      const niveis = ((data ?? []) as unknown as (string | { meus_niveis: string })[]).map((x) =>
        typeof x === "string" ? x : x.meus_niveis,
      );
      return veOMapa(papeisDoUsuario(eu, niveis));
    },
  });
}
