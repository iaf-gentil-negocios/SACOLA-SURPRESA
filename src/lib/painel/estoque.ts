// Resumo de estoque por loja (F2a) — regra pura. Calculado no navegador do admin logo depois de cada
// Cobertura concluída (o arquivo já está na memória) e gravado em resumo_estoque_lojas: uma linha
// por loja. O dashboard lê só esse resumo, nunca a Cobertura inteira.
import type { Parametros } from "@/lib/motor/parametros";

export interface ResumoEstoqueLoja {
  bcps: string;
  /** Data da Cobertura usada (AAAA-MM-DD). */
  ref: string;
  skus: number;
  unidades: number;
  /** Estoque × custo da loja (SKU sem custo conta 0). */
  valorCusto: number;
  /** Cobertura (estoque ÷ VMD) ≥ parado_cobertura_dias; VMD 0 = parado. */
  paradosSkus: number;
  paradosCusto: number;
  /** Por ciclo ("15", "16"…): heróis disponíveis na loja. Ciclo sem promoção fica de fora. */
  herois: Record<string, number>;
}

export interface LinhaEstoqueResumo {
  bcps: string;
  sku: string;
  estoque: number;
  vmd: number;
  preco: number;
  custo: number | null;
}

/**
 * SKUs que podem ser herói no ciclo (antes do estoque e do preço da loja): em promoção (desconto > 0),
 * regulares e do fornecedor BOT — as travas fixas do herói no motor.
 */
export function skusHeroiDoCiclo(
  promocoes: { sku: string; desconto_pct: number }[],
  produtos: Map<string, { regular: boolean; fornecedor: string | null }>,
): Set<string> {
  const r = new Set<string>();
  for (const x of promocoes) {
    const p = produtos.get(x.sku);
    if (x.desconto_pct > 0 && p?.regular && p.fornecedor === "BOT") r.add(x.sku);
  }
  return r;
}

const parado = (x: LinhaEstoqueResumo, dias: number) => x.vmd <= 0 || x.estoque / x.vmd >= dias;

export function resumirEstoque(
  linhas: LinhaEstoqueResumo[],
  ref: string,
  /** Por ciclo: SKUs que podem ser herói (ver skusHeroiDoCiclo). */
  heroisPorCiclo: Map<number, Set<string>>,
  p: Pick<Parametros, "parado_cobertura_dias" | "heroi_estoque_min" | "heroi_preco_min">,
): ResumoEstoqueLoja[] {
  const por = new Map<string, ResumoEstoqueLoja>();
  for (const x of linhas) {
    if (!(x.estoque > 0)) continue;
    let r = por.get(x.bcps);
    if (!r) {
      r = {
        bcps: x.bcps,
        ref,
        skus: 0,
        unidades: 0,
        valorCusto: 0,
        paradosSkus: 0,
        paradosCusto: 0,
        herois: Object.fromEntries([...heroisPorCiclo.keys()].map((c) => [String(c), 0])),
      };
      por.set(x.bcps, r);
    }
    const valor = x.estoque * (x.custo ?? 0);
    r.skus++;
    r.unidades += x.estoque;
    r.valorCusto += valor;
    if (parado(x, p.parado_cobertura_dias)) {
      r.paradosSkus++;
      r.paradosCusto += valor;
    }
    if (x.estoque >= p.heroi_estoque_min && x.preco >= p.heroi_preco_min) {
      for (const [ciclo, skus] of heroisPorCiclo) if (skus.has(x.sku)) r.herois[String(ciclo)]!++;
    }
  }
  return [...por.values()]
    .map((r) => ({
      ...r,
      valorCusto: Math.round(r.valorCusto * 100) / 100,
      paradosCusto: Math.round(r.paradosCusto * 100) / 100,
    }))
    .sort((a, b) => a.bcps.localeCompare(b.bcps));
}

/** Só as linhas da Cobertura mais recente (loja que saiu da Cobertura fica com a data antiga). */
export function resumoMaisRecente(linhas: ResumoEstoqueLoja[]): ResumoEstoqueLoja[] {
  const ref = linhas.reduce((m, l) => (l.ref > m ? l.ref : m), "");
  return linhas.filter((l) => l.ref === ref);
}
