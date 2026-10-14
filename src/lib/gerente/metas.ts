// Metas do gerente (P2, 13/10/2026) — regra pura: duas tabelas, "Meta do mês" e "Meta do ciclo",
// cada uma com o seu realizado (mês contra mês, ciclo contra ciclo). Uma linha por loja do escopo,
// a partir do resumo do Painel (sem kits, sem custo). Vendedoras = as da base definida.
import type { VendaDia } from "@/lib/vendas/leitor";
import { vendasPorLoja, type RuidoLoja } from "@/lib/vendas/ruido";

import type { LojaPainelGerente } from "./painel";

export interface NumerosMetas {
  receita: number;
  sacolas: number;
  vendedoras: number;
  /** null = loja sem vendedoras. */
  receitaPorVendedora: number | null;
  /** Arredondado para cima (não existe meia sacola). */
  sacolasPorVendedora: number | null;
  /** null = sem vendas enviadas ainda. */
  realizado: { receita: number; sacolas: number; pct: number | null } | null;
}

export interface LinhaMetas extends NumerosMetas {
  bcps: string;
  nome: string;
  praca: string;
}

export interface TabelaMetas {
  /** Período do realizado (vendas do canal − ruído). */
  inicio: string;
  fim: string;
  linhas: LinhaMetas[];
  total: NumerosMetas;
}

export interface VendasMetas {
  linhas: VendaDia[];
  ruidos: RuidoLoja[];
}

/** Sacolas por vendedora: sempre para cima. */
export const sacolasPorVendedora = (sacolas: number, vendedoras: number) =>
  vendedoras > 0 ? Math.ceil(sacolas / vendedoras - 1e-9) : null;

const fimDoMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};

function numeros(
  receita: number,
  sacolas: number,
  vendedoras: number,
  realizado: NumerosMetas["realizado"],
): NumerosMetas {
  return {
    receita,
    sacolas,
    vendedoras,
    receitaPorVendedora: vendedoras > 0 ? receita / vendedoras : null,
    sacolasPorVendedora: sacolasPorVendedora(sacolas, vendedoras),
    realizado,
  };
}

function tabela(
  lojas: LojaPainelGerente[],
  inicio: string,
  fim: string,
  metaDe: (l: LojaPainelGerente) => { receita: number; sacolas: number },
  vendas: VendasMetas | null,
): TabelaMetas {
  const porLoja = vendas ? vendasPorLoja(vendas.linhas, vendas.ruidos, inicio, fim) : null;
  const linhas = lojas.map((l): LinhaMetas => {
    const m = metaDe(l);
    let realizado: NumerosMetas["realizado"] = null;
    if (porLoja) {
      const preco = l.sacolasPlanejadas > 0 ? l.receitaPlanejada / l.sacolasPlanejadas : 0;
      const receita = porLoja.get(l.bcps)?.estimado ?? 0;
      realizado = {
        receita,
        sacolas: preco > 0 ? receita / preco : 0,
        pct: m.receita > 0 ? receita / m.receita : null,
      };
    }
    return {
      bcps: l.bcps,
      nome: l.nome,
      praca: l.praca,
      ...numeros(m.receita, m.sacolas, l.vendedoras, realizado),
    };
  });
  const soma = (f: (x: LinhaMetas) => number) => linhas.reduce((s, x) => s + f(x), 0);
  const receita = soma((x) => x.receita);
  const realizado = porLoja
    ? (() => {
        const r = soma((x) => x.realizado?.receita ?? 0);
        return {
          receita: r,
          sacolas: soma((x) => x.realizado?.sacolas ?? 0),
          pct: receita > 0 ? r / receita : null,
        };
      })()
    : null;
  return {
    inicio,
    fim,
    linhas,
    total: numeros(
      receita,
      soma((x) => x.sacolas),
      soma((x) => x.vendedoras),
      realizado,
    ),
  };
}

/**
 * As duas tabelas. Mês: meta do mês (a parte do ciclo no mês) e sacolas proporcionais, contra as
 * vendas do mês dentro da campanha. Ciclo: meta e sacolas do ciclo, contra as vendas da campanha.
 */
export function tabelasDeMetas(
  lojas: LojaPainelGerente[],
  ciclo: { inicio: string; fim: string; inicioCampanha?: string | null | undefined },
  mes: string,
  vendas: VendasMetas | null,
): { mes: TabelaMetas; ciclo: TabelaMetas } {
  const inicio = ciclo.inicioCampanha || ciclo.inicio;
  const mesIni = `${mes}-01`;
  const mesFim = fimDoMes(mes);
  return {
    mes: tabela(
      lojas,
      mesIni > inicio ? mesIni : inicio,
      mesFim < ciclo.fim ? mesFim : ciclo.fim,
      (l) => {
        const receita = l.metasMes[mes] ?? 0;
        return {
          receita,
          sacolas: l.meta > 0 ? Math.ceil((l.sacolasMeta * receita) / l.meta - 1e-9) : 0,
        };
      },
      vendas,
    ),
    ciclo: tabela(
      lojas,
      inicio,
      ciclo.fim,
      (l) => ({ receita: l.meta, sacolas: l.sacolasMeta }),
      vendas,
    ),
  };
}
