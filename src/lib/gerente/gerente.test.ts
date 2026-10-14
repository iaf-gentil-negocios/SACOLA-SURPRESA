import { describe, expect, it } from "vitest";

import { baseAtual, type DadosBase } from "./base";
import { linhasExcel } from "./excel";

const b = (id: number, inicio: string, fim: string) => ({
  id,
  ciclo: 15,
  nome: `B${id}`,
  inicio,
  fim,
  kitsVersao: null,
});

describe("base atual do gerente", () => {
  it("é a que contém hoje; senão, a mais recente já iniciada", () => {
    const bases = [b(3, "2026-10-23", "2026-10-29"), b(2, "2026-10-16", "2026-10-22")];
    expect(baseAtual(bases, "2026-10-20")?.id).toBe(2);
    expect(baseAtual(bases, "2026-10-31")?.id).toBe(3);
    expect(baseAtual([], "2026-10-20")).toBeNull();
  });
});

describe("Excel do gerente", () => {
  it("uma linha por item e por loja, e aba de metas", () => {
    const d: DadosBase = {
      base: b(1, "2026-10-16", "2026-10-22"),
      ciclo: { id: 15, nome: "Ciclo 15", inicio: "2026-10-16", fim: "2026-11-01" },
      pracas: ["P1"],
      capacidadeLoja: { L1: 4 },
      disponivelRef: "2026-10-11",
      lojas: [
        {
          bcps: "L1",
          nome: "Loja 1",
          praca: "P1",
          meta: 1700,
          vendedoras: 2,
          metaSemana: 700,
          metaVendSemana: 350,
          metasMes: { "2026-10": 1600, "2026-11": 100 },
        },
      ],
      kits: [
        {
          codigo: "C15-0001",
          tema: "ela",
          preco: 189.9,
          valorCheio: 290,
          descontoPct: 34.5,
          itens: [
            { ordem: 1, papel: "heroi", sku: "S1", descricao: "Herói", precoItem: 120 },
            { ordem: 2, papel: "surpresa", sku: "S2", descricao: "Outro", precoItem: 90 },
          ],
          lojas: [{ bcps: "L1", qtd: 5, disponivel: 3 }],
        },
      ],
    };
    const { kits, metas } = linhasExcel(d);
    expect(kits).toHaveLength(2);
    expect(kits[0]).toMatchObject({
      Praça: "P1",
      Loja: "Loja 1",
      Kit: "C15-0001",
      Tema: "Presente para Ela",
      "Qtd na loja": 5,
      "Pode montar hoje": 3,
      Papel: "Herói",
      SKU: "S1",
    });
    expect(metas[0]).toMatchObject({ Loja: "Loja 1", "Meta 2026-10": 1600, "Meta 2026-11": 100 });
  });
});
