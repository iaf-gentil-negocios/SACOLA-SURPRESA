// Painel do gerente (F2a, refeito em 12/10/2026) — regra pura, mesma estrutura do dashboard do
// admin, só com as lojas do escopo e sem custo nem margem.
import type { DadosPainelGerente } from "@/lib/gerente/painel";
import type { VendaLoja } from "@/lib/vendas/ruido";
import { diasEntre } from "@/lib/motor/metas";

import { realizadoDaLoja, somarMeta, type NumerosMeta } from "./admin";

export interface LinhaPainelGerente extends NumerosMeta {
  bcps: string;
  nome: string;
  praca: string;
  metaMes: number;
}

export interface PainelGerente {
  lojas: LinhaPainelGerente[];
  totais: NumerosMeta & { metaMes: number };
  /** Semanas do ciclo (dias ÷ 7). */
  semanas: number;
}

export function montarPainelGerente(
  d: DadosPainelGerente,
  mes: string,
  praca = "",
  /** F2b: venda estimada por loja (null = sem vendas enviadas). */
  vendas: Map<string, VendaLoja> | null = null,
): PainelGerente {
  const lojas = d.lojas
    .filter((l) => !praca || l.praca === praca)
    .map((l): LinhaPainelGerente => ({
      bcps: l.bcps,
      nome: l.nome,
      praca: l.praca,
      metaMes: l.metasMes[mes] ?? 0,
      meta: l.meta,
      sacolasMeta: l.sacolasMeta,
      sacolasPlanejadas: l.sacolasPlanejadas,
      receitaPlanejada: l.receitaPlanejada,
      custoPlanejado: 0, // o gerente não vê custo
      vendedoras: l.vendedoras,
      podeMontar: l.podeMontar,
      realizado: realizadoDaLoja(vendas, l.bcps, l.receitaPlanejada, l.sacolasPlanejadas),
    }));
  return {
    lojas,
    totais: { ...somarMeta(lojas), metaMes: lojas.reduce((s, l) => s + l.metaMes, 0) },
    semanas: d.ciclo ? diasEntre(d.ciclo.inicio, d.ciclo.fim) / 7 : 0,
  };
}
