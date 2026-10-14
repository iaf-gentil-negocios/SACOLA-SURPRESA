// Leituras leves da tela Motor do Mix: produtos (para os temas) e promoção do ciclo.
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Nicho } from "@/lib/bases/nicho";
import { MODO_LOCAL } from "@/lib/modo-local";

import type { ProdutoCatalogo } from "./herois-possiveis";

/** Produtos da base (só as colunas dos temas), uma vez por sessão. */
export function useProdutosCatalogo() {
  return useQuery({
    queryKey: ["motor-produtos-catalogo"],
    enabled: !MODO_LOCAL,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<ProdutoCatalogo[]> => {
      const r: ProdutoCatalogo[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase
          .from("produtos")
          .select("sku, categoria, marca, nicho, regular, fornecedor, preco_dsku")
          .order("sku")
          .range(de, de + 999);
        if (error) throw error;
        for (const x of data)
          r.push({
            ...x,
            nicho: x.nicho as Nicho | null,
            preco_dsku: x.preco_dsku === null ? null : Number(x.preco_dsku),
          });
        if (data.length < 1000) return r;
      }
    },
  });
}

/** SKUs em promoção no ciclo (desconto > 0). Vazio = ciclo sem base de promoção. */
export function usePromocaoDoCiclo(ciclo: number | null) {
  return useQuery({
    queryKey: ["motor-promocao-ciclo", ciclo],
    enabled: !MODO_LOCAL && ciclo !== null,
    queryFn: async () => {
      const skus = new Set<string>();
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase
          .from("promocoes")
          .select("sku, desconto_pct")
          .eq("ciclo", ciclo!)
          .gt("desconto_pct", 0)
          .order("sku")
          .range(de, de + 999);
        if (error) throw error;
        for (const x of data) skus.add(x.sku);
        if (data.length < 1000) return skus;
      }
    },
  });
}
