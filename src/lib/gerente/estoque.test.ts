// P4 (13/10/2026): simulador por kits limitado pelo estoque da loja, compartilhado entre os kits.
import { describe, expect, it } from "vitest";

import { simularComEstoque } from "./estoque";

const item = (sku: string) => ({
  ordem: 1,
  papel: "surpresa" as const,
  sku,
  descricao: `Produto ${sku}`,
  precoItem: 10,
});
const kits = [
  { codigo: "K1", itens: [item("H1"), item("A"), item("B")] },
  { codigo: "K2", itens: [item("H2"), item("A"), item("C")] },
];
const estoque = new Map([
  ["H1", 10],
  ["H2", 10],
  ["A", 6],
  ["B", 3],
  ["C", 10],
]);

describe("simulador por kits com estoque (P4)", () => {
  it("o que dá para montar fica limitado pelo estoque e mostra o item que limita", () => {
    const [r] = simularComEstoque(kits, [{ codigo: "K1", qtd: 5 }], estoque);
    expect(r).toMatchObject({ montaveis: 3, limitante: { sku: "B", descricao: "Produto B" } });
  });

  it("dentro do estoque: monta tudo, sem item limitante", () => {
    const [r] = simularComEstoque(kits, [{ codigo: "K1", qtd: 2 }], estoque);
    expect(r).toMatchObject({ montaveis: 2, limitante: null, maisPossiveis: 1 });
  });

  it("estoque compartilhado: o item usado num kit sai do saldo dos outros", () => {
    // K1 usa 3 de A (sobram 3); K2 pede 5 mas só tem A para 3
    const r = simularComEstoque(
      kits,
      [
        { codigo: "K1", qtd: 3 },
        { codigo: "K2", qtd: 5 },
      ],
      estoque,
    );
    expect(r[0]).toMatchObject({ montaveis: 3, limitante: null });
    expect(r[1]).toMatchObject({ montaveis: 3, limitante: { sku: "A" } });
    // nada sobrou de A: nenhum dos dois dá mais
    expect(r.map((x) => x.maisPossiveis)).toEqual([0, 0]);
  });

  it("mesmo kit em duas linhas também divide o estoque; linha vazia não conta", () => {
    const r = simularComEstoque(
      kits,
      [
        { codigo: "K1", qtd: 2 },
        { codigo: "", qtd: 9 },
        { codigo: "K1", qtd: 2 },
      ],
      estoque,
    );
    expect(r.map((x) => x.montaveis)).toEqual([2, 0, 1]);
    expect(r[2]!.limitante?.sku).toBe("B");
  });

  it("item sem estoque na foto = 0; não altera o estoque recebido", () => {
    const copia = new Map(estoque);
    const [r] = simularComEstoque(
      [{ codigo: "K3", itens: [item("X"), item("A")] }],
      [{ codigo: "K3", qtd: 1 }],
      estoque,
    );
    expect(r).toMatchObject({ montaveis: 0, limitante: { sku: "X" } });
    expect(estoque).toEqual(copia);
  });
});
