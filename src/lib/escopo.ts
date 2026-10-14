import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { lojasDe, type VisaoGerente } from "@/lib/gerente/visao";
import { MODO_LOCAL } from "@/lib/modo-local";

/**
 * Lojas do escopo de quem a área do gerente mostra.
 * Gerente logado: a RLS devolve só as dele (pela hierarquia). "Ver como": o escopo do gerente
 * escolhido, pela função lojas_de do banco (a mesma regra).
 */
export function useEscopo(visao: VisaoGerente) {
  return useQuery({
    queryKey: ["escopo", visao.userId, visao.verComo],
    queryFn: async () => {
      if (MODO_LOCAL) return (await import("@/lib/gerente/local")).escopoLocal();
      const { data, error } = await supabase
        .from("lojas")
        .select("bcps, nome, praca")
        .order("praca")
        .order("nome");
      if (error) throw error;
      if (!visao.verComo) return data;
      const doGerente = new Set(await lojasDe(visao.userId));
      return data.filter((l) => doGerente.has(l.bcps));
    },
  });
}
