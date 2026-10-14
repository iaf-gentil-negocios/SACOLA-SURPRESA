// Tela Temas: quantos produtos cada categoria tem e quantos podem ser herói (teto, sem estoque).
// Leitura leve: só a base de Produtos (preço do dsku) e a promoção do ciclo — o estoque ≥ N de
// cada loja só é conferido na simulação, então lá pode sair menos.
import type { Nicho } from "@/lib/bases/nicho";

import type { Parametros } from "./parametros";
import { nichoCorrigido, TEMAS, temaPersonalizado, type ItemTema, type Tema } from "./temas";

export interface ProdutoCatalogo {
  sku: string;
  categoria: string | null;
  marca: string | null;
  nicho: Nicho | null;
  regular: boolean;
  fornecedor: string | null;
  preco_dsku: number | null;
}

export interface ContagemCategoria {
  categoria: string;
  produtos: number;
  herois: number;
}

type Item = ItemTema & { sku: string; regular: boolean; preco: number | null };

function itensDoPool(produtos: ProdutoCatalogo[], p: Parametros): Item[] {
  const fornecedores = new Set(p.pool_fornecedores);
  return produtos
    .filter((x) => x.fornecedor && fornecedores.has(x.fornecedor))
    .map((x) => {
      const marca = (x.marca ?? "").toUpperCase().trim();
      return {
        sku: x.sku,
        marca,
        categoria: (x.categoria ?? "SEM CATEGORIA").toUpperCase().trim(),
        nicho: nichoCorrigido(x.nicho, marca),
        regular: x.regular,
        preco: x.preco_dsku,
      };
    });
}

/**
 * Pode ser herói (sem olhar estoque): regular, preço cheio ≥ mínimo e, com a promoção
 * "obrigatória" e base de promoção no ciclo, estar na promoção.
 */
function podeSerHeroi(x: Item, p: Parametros, promo: Set<string>): boolean {
  if (!x.regular || x.preco === null || x.preco < p.heroi_preco_min) return false;
  if (p.promo_heroi === "obrigatoria" && promo.size > 0) return promo.has(x.sku);
  return true;
}

/** Categorias da base de Produtos (fornecedores do pool), com produtos e heróis possíveis (fora Infantil). */
export function contagemPorCategoria(
  produtos: ProdutoCatalogo[],
  promo: Set<string>,
  p: Parametros,
): ContagemCategoria[] {
  const por = new Map<string, ContagemCategoria>();
  for (const x of itensDoPool(produtos, p)) {
    const c = por.get(x.categoria) ?? { categoria: x.categoria, produtos: 0, herois: 0 };
    c.produtos++;
    if (x.nicho !== "I" && podeSerHeroi(x, p, promo)) c.herois++;
    por.set(x.categoria, c);
  }
  return [...por.values()].sort((a, b) => a.categoria.localeCompare(b.categoria, "pt-BR"));
}

/** Heróis possíveis de cada tema (fixos e personalizados), pela regra de herói do tema. */
export function heroisPorTema(
  produtos: ProdutoCatalogo[],
  promo: Set<string>,
  p: Parametros,
): Map<string, number> {
  const itens = itensDoPool(produtos, p).filter((x) => podeSerHeroi(x, p, promo));
  const temas: Tema[] = [...TEMAS, ...p.temas_personalizados.map(temaPersonalizado)];
  return new Map(temas.map((t) => [t.chave, itens.filter((x) => t.heroi(x)).length]));
}
