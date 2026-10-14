// Simulador por kits limitado pelo estoque (P4, 13/10/2026).
// Fonte: a foto do estoque dos produtos dos kits gravada a cada Cobertura (base_lojas_estoque,
// { sku: estoque }, sem custo; o gerente lê só as lojas do escopo, SQL 0002k). Lida UMA vez por
// base; as contas rodam no navegador, sem consultar o banco a cada alteração. A tela não mostra
// a quantidade em estoque: só quantos kits dá para montar e qual item limita.
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { MODO_LOCAL } from "@/lib/modo-local";

import type { BaseGerente, KitGerente } from "./base";
import { lojasDe, type VisaoGerente } from "./visao";

export interface EstoqueLoja {
  /** Data da Cobertura da foto. */
  ref: string | null;
  estoque: Map<string, number>;
}

export interface LinhaPedida {
  codigo: string;
  qtd: number;
}

export interface ResultadoLinha {
  /** Quantos kits desta linha dá para montar (≤ pedido). */
  montaveis: number;
  /** Item que impediu montar mais (null = deu para montar tudo o que foi pedido). */
  limitante: { sku: string; descricao: string } | null;
  /** Quantos kits desta linha ainda daria para montar além do pedido, com o que sobrou. */
  maisPossiveis: number;
}

/**
 * As linhas são atendidas na ordem da tela; cada kit montado desconta 1 unidade de cada item do
 * saldo da loja, e o saldo é compartilhado entre todas as linhas (um item usado num kit não está
 * mais disponível para os outros).
 */
export function simularComEstoque(
  kits: Pick<KitGerente, "codigo" | "itens">[],
  linhas: LinhaPedida[],
  estoque: Map<string, number>,
): ResultadoLinha[] {
  const porCodigo = new Map(kits.map((k) => [k.codigo, k]));
  const saldo = new Map(estoque);
  const cabe = (skus: string[]) =>
    skus.length ? Math.max(0, Math.min(...skus.map((s) => Math.floor(saldo.get(s) ?? 0)))) : 0;
  const parciais = linhas.map((l) => {
    const k = porCodigo.get(l.codigo);
    if (!k || l.qtd <= 0) return { montaveis: 0, limitante: null, k };
    const skus = k.itens.map((i) => i.sku);
    const montaveis = Math.min(l.qtd, cabe(skus));
    for (const s of skus) saldo.set(s, (saldo.get(s) ?? 0) - montaveis);
    let limitante: ResultadoLinha["limitante"] = null;
    if (montaveis < l.qtd) {
      // o item que acabou primeiro (menor saldo); empate: a ordem do kit
      const i = k.itens.reduce((a, b) =>
        (saldo.get(b.sku) ?? 0) < (saldo.get(a.sku) ?? 0) ? b : a,
      );
      limitante = { sku: i.sku, descricao: i.descricao };
    }
    return { montaveis, limitante, k };
  });
  // "daria para montar mais": com o saldo final, depois de todas as linhas
  return parciais.map((p) => ({
    montaveis: p.montaveis,
    limitante: p.limitante,
    maisPossiveis: p.k ? cabe(p.k.itens.map((i) => i.sku)) : 0,
  }));
}

/** Foto do estoque dos kits por loja, na base escolhida (uma leitura; 5 min de cache). */
export function useEstoqueDosKits(base: BaseGerente | null, visao: VisaoGerente) {
  return useQuery({
    queryKey: ["gerente", visao.userId, "estoque-kits", base?.id, base?.kitsVersao],
    enabled: !!base,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, EstoqueLoja>> => {
      const r = new Map<string, EstoqueLoja>();
      if (MODO_LOCAL) {
        const { repositorioLocal } = await import("@/lib/dados/local");
        const kb = await repositorioLocal.kitsDaBase(base!.id, base!.ciclo);
        for (const [bcps, f] of Object.entries(kb.fotos))
          r.set(bcps, { ref: f.atualRef, estoque: new Map(Object.entries(f.atual)) });
        return r;
      }
      // tabela do 0002d (fora do types.ts); RLS do 0002k: só as lojas do escopo
      const { data, error } = await supabase
        .from("base_lojas_estoque" as never)
        .select("bcps, atual_ref, atual")
        .eq("plano_id" as never, base!.id as never)
        .limit(5000);
      if (error) throw new Error(error.message);
      const escopo = visao.verComo ? new Set(await lojasDe(visao.userId)) : null;
      for (const f of (data ?? []) as unknown as {
        bcps: string;
        atual_ref: string | null;
        atual: Record<string, number> | null;
      }[]) {
        if (escopo && !escopo.has(f.bcps)) continue;
        r.set(f.bcps, {
          ref: f.atual_ref,
          estoque: new Map(Object.entries(f.atual ?? {}).map(([s, n]) => [s, Number(n)])),
        });
      }
      return r;
    },
  });
}
