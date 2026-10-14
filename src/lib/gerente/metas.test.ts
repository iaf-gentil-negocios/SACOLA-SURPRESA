// P2 (13/10/2026): Metas em duas tabelas (mês e ciclo), cada uma com o seu realizado.
import { describe, expect, it } from "vitest";

import { derivados } from "@/lib/painel/admin";

import { sacolasPorVendedora, tabelasDeMetas } from "./metas";
import type { LojaPainelGerente } from "./painel";

const loja = (x: Partial<LojaPainelGerente> & { bcps: string }): LojaPainelGerente => ({
  nome: x.bcps,
  praca: "Natal",
  meta: 17_000,
  vendedoras: 3,
  metasMes: { "2026-10": 16_000, "2026-11": 1_000 },
  sacolasMeta: 85,
  sacolasPlanejadas: 80,
  receitaPlanejada: 16_000, // preço médio R$ 200
  podeMontar: null,
  ...x,
});

// C15: 16/10 a 01/11; campanha a partir de 19/10
const ciclo = { inicio: "2026-10-16", fim: "2026-11-01", inicioCampanha: "2026-10-19" };

describe("Metas: duas tabelas (P2)", () => {
  it("sacolas por vendedora sempre para cima; sem vendedoras = —", () => {
    expect(sacolasPorVendedora(85, 3)).toBe(29); // 28,3 → 29
    expect(sacolasPorVendedora(90, 3)).toBe(30); // exato não sobe
    expect(sacolasPorVendedora(10, 0)).toBeNull();
  });

  it("colunas: receita, sacolas, vendedoras (da base), receita e sacolas por vendedora", () => {
    const t = tabelasDeMetas([loja({ bcps: "A" })], ciclo, "2026-10", null);
    expect(t.ciclo.linhas[0]).toMatchObject({
      receita: 17_000,
      sacolas: 85,
      vendedoras: 3,
      sacolasPorVendedora: 29,
    });
    expect(t.ciclo.linhas[0]!.receitaPorVendedora).toBeCloseTo(17_000 / 3, 6);
    // mês: a parte do ciclo no mês; sacolas proporcionais, para cima (85 × 16/17 = 80)
    expect(t.mes.linhas[0]).toMatchObject({
      receita: 16_000,
      sacolas: 80,
      sacolasPorVendedora: 27,
    });
    // sem vendas: realizado "aguardando"
    expect(t.mes.total.realizado).toBeNull();
    expect(t.ciclo.total.realizado).toBeNull();
  });

  it("cada tabela tem o seu realizado: mês contra mês, ciclo contra ciclo", () => {
    const vendas = {
      linhas: [
        { bcps: "A", dia: "2026-10-18", gmv: 999, boletos: 1, itens: 1 }, // antes da campanha: fora
        { bcps: "A", dia: "2026-10-20", gmv: 400, boletos: 2, itens: 4 },
        { bcps: "A", dia: "2026-10-31", gmv: 200, boletos: 1, itens: 2 },
        { bcps: "A", dia: "2026-11-01", gmv: 600, boletos: 3, itens: 6 },
      ],
      ruidos: [],
    };
    const out = tabelasDeMetas([loja({ bcps: "A" })], ciclo, "2026-10", vendas);
    expect(out.mes.inicio).toBe("2026-10-19");
    expect(out.mes.fim).toBe("2026-10-31");
    expect(out.mes.linhas[0]!.realizado).toMatchObject({ receita: 600, sacolas: 3 });
    expect(out.ciclo.linhas[0]!.realizado).toMatchObject({ receita: 1200, sacolas: 6 });
    expect(out.ciclo.linhas[0]!.realizado!.pct).toBeCloseTo(1200 / 17_000, 9);
    const nov = tabelasDeMetas([loja({ bcps: "A" })], ciclo, "2026-11", vendas);
    expect(nov.mes.inicio).toBe("2026-11-01");
    expect(nov.mes.linhas[0]!.realizado!.receita).toBe(600);
    expect(nov.mes.linhas[0]!.realizado!.pct).toBeCloseTo(600 / 1_000, 9);
  });

  it("total: soma das lojas; sacolas por vendedora do total também para cima", () => {
    const t = tabelasDeMetas(
      [loja({ bcps: "A" }), loja({ bcps: "B", vendedoras: 2, sacolasMeta: 41, meta: 9_000 })],
      ciclo,
      "2026-10",
      null,
    );
    expect(t.ciclo.total).toMatchObject({ receita: 26_000, sacolas: 126, vendedoras: 5 });
    expect(t.ciclo.total.sacolasPorVendedora).toBe(26); // 25,2 → 26
  });

  it("dashboard: sacolas por vendedora (ciclo e semana) também para cima", () => {
    const d = derivados(
      {
        meta: 17_000,
        sacolasMeta: 85,
        sacolasPlanejadas: 80,
        receitaPlanejada: 16_000,
        custoPlanejado: 0,
        vendedoras: 3,
        podeMontar: null,
      },
      17 / 7,
    );
    expect(d.sacolasPorVendedora).toBe(29);
    expect(d.sacolasPorVendedoraSemana).toBe(12); // 85 ÷ 2,43 ÷ 3 = 11,7 → 12
  });
});
