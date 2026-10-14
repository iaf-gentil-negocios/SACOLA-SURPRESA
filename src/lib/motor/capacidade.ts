// Capacidade dos kits de uma loja (F1b): a mesma regra de alocação do motor — uma sacola de cada
// kit por vez, enquanto houver estoque de todos os itens (cada item entra 1 vez no kit).

/** "Pode montar N" do kit sozinho: o menor estoque entre os itens (0 = indisponível). */
export function podeMontar(skus: string[], estoque: Map<string, number>): number {
  if (!skus.length) return 0;
  return Math.max(0, Math.min(...skus.map((s) => Math.floor(estoque.get(s) ?? 0))));
}

/**
 * Distribui sacolas entre os kits dividindo os produtos (um de cada vez).
 * `limite` = máximo total (Infinity = capacidade); `tetos` = máximo por kit (opcional).
 * Devolve a quantidade de cada kit, o total e o estoque que sobrou.
 */
export function alocarSkus(
  kits: string[][],
  estoque: Map<string, number>,
  limite = Infinity,
  tetos?: number[],
): { qtd: number[]; total: number; resto: Map<string, number> } {
  const resto = new Map(estoque);
  const qtd = kits.map(() => 0);
  let total = 0;
  let andou = true;
  while (total < limite && andou) {
    andou = false;
    kits.forEach((skus, i) => {
      if (total >= limite) return;
      if (tetos && qtd[i]! >= tetos[i]!) return;
      if (skus.length && skus.every((s) => (resto.get(s) ?? 0) >= 1)) {
        for (const s of skus) resto.set(s, resto.get(s)! - 1);
        qtd[i]!++;
        total++;
        andou = true;
      }
    });
  }
  return { qtd, total, resto };
}

/** Capacidade total da loja: quantas sacolas os kits montam juntos. */
export const capacidadeConjunta = (kits: string[][], estoque: Map<string, number>) =>
  alocarSkus(kits, estoque).total;
