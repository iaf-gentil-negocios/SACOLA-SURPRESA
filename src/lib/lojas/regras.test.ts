import { describe, expect, it } from "vitest";

import {
  casaBusca,
  cidadeDoEndereco,
  entraNoPlano,
  formasDoCodigo,
  indiceDeCodigos,
  tipoDCentros,
  tipoExibido,
} from "./regras";

describe("tipo das unidades", () => {
  it("é exatamente a coluna Tipo da dCentros", () => {
    for (const t of ["Varejo", "Híbrida", "Venda Direta", "HUB", "Escritório", "Estoque"])
      expect(tipoDCentros(` ${t} `)).toBe(t);
  });

  it("lojas gravadas antes como ER ou QDB aparecem como vieram na dCentros", () => {
    expect(tipoExibido({ tipo: "er", tipo_dcentros: "ER" })).toBe("Venda Direta");
    expect(tipoExibido({ tipo: "loja", tipo_dcentros: "QDB" })).toBe("Varejo");
    expect(tipoExibido({ tipo: "er", tipo_dcentros: null })).toBe("Venda Direta");
  });

  it("o motor usa só participa e ativa, nunca o tipo", () => {
    expect(entraNoPlano({ participa: true, ativo: true })).toBe(true);
    expect(entraNoPlano({ participa: false, ativo: true })).toBe(false);
    expect(entraNoPlano({ participa: true, ativo: false })).toBe(false);
  });
});

describe("cidade pelo Endereço da dCentros (0002f)", () => {
  it("formatos 'Cidade - UF' e '… - Cidade, UF'", () => {
    expect(
      cidadeDoEndereco("R. Expedito Farias, 275 - Centro, Acaraú - CE, 62580-000, Brazil", "CE"),
    ).toBe("Acaraú");
    expect(
      cidadeDoEndereco("Av. Gen. Alípio dos Santos, 829 - Amontada, CE, 62540-000, Brazil", "CE"),
    ).toBe("Amontada");
    expect(
      cidadeDoEndereco(
        "Av. Moçambique, 9 - Anjo da Guarda, São Luís - MA, 65085-790, Brazil",
        "MA",
      ),
    ).toBe("São Luís");
  });

  it("não reconhece: null (vai para a lista de correção)", () => {
    expect(cidadeDoEndereco(null, "RN")).toBeNull();
    expect(cidadeDoEndereco("Rua X, 720A, CENTRO, 59.570-000", "RN")).toBeNull();
  });
});

describe("busca de loja pelo nome abreviado ou completo", () => {
  const sLuzia = ["S Luzia Tide", "Santa Luzia do Tide", "20925", "Santa Luzia do Paruá"];
  it("nome completo, sem acento, abreviado e BCPS", () => {
    expect(casaBusca("santa luzia do tide", ...sLuzia)).toBe(true);
    expect(casaBusca("Santa Luzia", ...sLuzia)).toBe(true);
    expect(casaBusca("s luzia tide", ...sLuzia)).toBe(true);
    expect(casaBusca("20925", ...sLuzia)).toBe(true);
    expect(casaBusca("carrefour mossoro", "Hiper M", "Carrefour Mossoró", "19600")).toBe(true);
    expect(casaBusca("c mi", "C Mirim", "Ceará-Mirim", "21270")).toBe(true);
    expect(casaBusca("ceara mirim", "C Mirim", null, "21270")).toBe(true);
  });
  it("não casa o que não tem", () => {
    expect(casaBusca("natal", ...sLuzia)).toBe(false);
    expect(casaBusca("santa rita", ...sLuzia)).toBe(false);
  });
});

describe("código da loja: BCPS, DIVISÃO ou SAP (4118 = A118)", () => {
  it("formas do SAP", () => {
    expect(formasDoCodigo("4065")).toEqual(["4065"]);
    expect(formasDoCodigo("4118")).toEqual(["4118", "A118"]);
    expect(formasDoCodigo("a118")).toEqual(["A118", "4118"]);
    expect(formasDoCodigo(" ")).toEqual([]);
  });
  it("acha a loja por qualquer código", () => {
    const m = indiceDeCodigos([
      { bcps: "24598", divisao: "D1", sap: "A118" },
      { bcps: "21423", divisao: null, sap: "4065" },
    ]);
    for (const c of ["24598", "D1", "A118", "4118"])
      expect(m.get(formasDoCodigo(c)[0]!)).toBe("24598");
    expect(m.get("4065")).toBe("21423");
    expect(m.get("A065")).toBeUndefined();
  });
});
