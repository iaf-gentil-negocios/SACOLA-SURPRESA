// Parte F2b: leitor do relatório, ruído (com outliers), venda estimada e aviso de arquivo suspeito.
import { describe, expect, it } from "vitest";

import type { Planilha } from "@/lib/bases/leitor";
import { normalizarCabecalho } from "@/lib/bases/valores";

import { ArquivoSemData, lerVendas, type VendaDia } from "./leitor";
import {
  avisarArquivo,
  calcularRuido,
  diasCobertos,
  janelaDoHistorico,
  quantil,
  somarDias,
  vendasPorLoja,
} from "./ruido";

const planilha = (cabecalho: string[], linhas: unknown[][]): Planilha => ({
  nome: "GerencialVendas.csv",
  cabecalho,
  chaves: cabecalho.map(normalizarCabecalho),
  linhas,
  linhaCabecalho: 1,
});
const CAB = [
  "Listar Por Lojas",
  "Quebrar Por Data",
  "GMV-GMV",
  "GMV-Boleto médio",
  "GMV-Qtd de boletos",
  "GMV-Itens por boleto",
  "Valores de vendas-Receita líquida",
];

describe("leitor do Gerencial de Vendas", () => {
  it("lê por loja e dia (GMV, boletos, itens), ignora loja fora do cadastro e soma repetidas", () => {
    const r = lerVendas(
      planilha(CAB, [
        [
          "21432 - ESSENCIA COMERCIAL LTDA",
          "15/04/2026",
          "99,90",
          "99,90",
          "1,00",
          "1,00",
          "99,91",
        ],
        [
          "21432 - ESSENCIA COMERCIAL LTDA",
          "04/05/2026",
          "976,89",
          "244,22",
          "4,00",
          "2,25",
          "976,94",
        ],
        [
          "21432 - ESSENCIA COMERCIAL LTDA",
          "04/05/2026",
          "1.000,00",
          "1.000,00",
          "1,00",
          "3,00",
          "1",
        ],
        ["99999 - OUTRA", "04/05/2026", "10,00", "10,00", "1,00", "1,00", "10"],
        ["20934 - ESSENCIA", "11/09/2026", "0,00", "0,00", "1,00", "1,00", "137,90"],
      ]),
      new Set(["21432", "20934"]),
    );
    expect(r.linhas).toEqual([
      { bcps: "21432", dia: "2026-04-15", gmv: 99.9, boletos: 1, itens: 1 },
      { bcps: "21432", dia: "2026-05-04", gmv: 1976.89, boletos: 5, itens: 12 },
      { bcps: "20934", dia: "2026-09-11", gmv: 0, boletos: 1, itens: 1 },
    ]);
    expect(r).toMatchObject({ inicio: "2026-04-15", fim: "2026-09-11", ignoradas: ["99999"] });
    expect(r.total).toEqual({ gmv: 2076.79, boletos: 7, lojas: 2, dias: 3 });
  });

  it("recusa o export sem 'Quebrar Por Data' (é o total do período, não do dia)", () => {
    const semData = CAB.filter((c) => c !== "Quebrar Por Data");
    expect(() =>
      lerVendas(
        planilha(semData, [["7423 - X", "214,80", "214,80", "1", "2", "214,81"]]),
        new Set(),
      ),
    ).toThrow(ArquivoSemData);
  });
});

describe("ruído", () => {
  const inicio = "2026-10-16"; // sexta
  const { inicio: h0 } = janelaDoHistorico(inicio);
  const todos = new Set(Array.from({ length: 56 }, (_, i) => somarDias(h0, i)));
  const v = (bcps: string, dia: string, gmv: number): VendaDia => ({
    bcps,
    dia,
    gmv,
    boletos: 1,
    itens: 1,
  });

  it("janela = 56 dias antes do início da campanha", () => {
    expect(janelaDoHistorico(inicio)).toEqual({ inicio: "2026-08-21", fim: "2026-10-15" });
  });

  it("quartis com interpolação (como o Excel)", () => {
    expect(quantil([1, 2, 3, 4], 0.25)).toBe(1.75);
    expect(quantil([1, 2, 3, 4], 0.75)).toBe(3.25);
  });

  it("mediana por dia da semana, sem os outliers (Q3 + 1,5 × IQR)", () => {
    // loja vende 100 todo dia; um dia de 4.000 (outlier) numa sexta
    const vendas = [...todos].map((d) => v("L1", d, 100));
    vendas.push(v("L1", "2026-09-04", 3900)); // sexta: 100 + 3.900 = 4.000
    const r = calcularRuido(vendas, inicio, todos);
    expect(r).toHaveLength(7);
    expect(r.every((x) => x.ruido === 100 && x.dias_historico === 56)).toBe(true);
    expect(r.find((x) => x.dow === 5)!.outliers).toBe(1);
  });

  it("canal fraco (quase tudo zero): ruído 0; loja sem histórico não entra (= 0)", () => {
    const r = calcularRuido([v("L2", "2026-09-04", 350)], inicio, todos);
    expect(r.every((x) => x.ruido === 0)).toBe(true);
    expect(r.find((x) => x.dow === 5)!.outliers).toBe(1);
    expect(r.some((x) => x.bcps === "L3")).toBe(false);
  });

  it("só conta os dias cobertos por envio; sem cobertura, nenhum ruído", () => {
    expect(calcularRuido([v("L1", "2026-09-04", 100)], inicio, new Set())).toEqual([]);
    const cobertos = diasCobertos([{ inicio: "2026-09-01", fim: "2026-09-03" }]);
    expect([...cobertos]).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });
});

describe("venda da Sacola estimada", () => {
  it("venda do canal − ruído do dia da semana, nunca abaixo de 0; fora do período não conta", () => {
    const ruidos = [
      { bcps: "L1", dow: 5, ruido: 50, dias_historico: 56, outliers: 0 },
      { bcps: "L1", dow: 6, ruido: 500, dias_historico: 56, outliers: 0 },
    ];
    const vendas: VendaDia[] = [
      { bcps: "L1", dia: "2026-10-16", gmv: 400, boletos: 2, itens: 6 }, // sexta: 400 − 50
      { bcps: "L1", dia: "2026-10-17", gmv: 200, boletos: 1, itens: 3 }, // sábado: 200 − 500 → 0
      { bcps: "L1", dia: "2026-10-15", gmv: 999, boletos: 1, itens: 3 }, // antes do início
      { bcps: "L2", dia: "2026-10-16", gmv: 300, boletos: 1, itens: 3 }, // sem ruído: tudo
    ];
    const r = vendasPorLoja(vendas, ruidos, "2026-10-16", "2026-11-01");
    expect(r.get("L1")).toEqual({ bcps: "L1", canal: 600, boletos: 3, ruido: 250, estimado: 350 });
    expect(r.get("L2")!.estimado).toBe(300);
  });
});

describe("aviso de arquivo suspeito", () => {
  const h = (n: number, gmv: number): VendaDia[] =>
    Array.from({ length: n }, (_, i) => ({
      bcps: `H${i % 3}`,
      dia: somarDias("2026-09-01", i),
      gmv,
      boletos: 1,
      itens: 1,
    }));

  it("média diária > 5× o histórico ou muitas lojas que nunca venderam no canal", () => {
    const arquivo = {
      inicio: "2026-10-12",
      fim: "2026-10-12",
      linhas: Array.from({ length: 10 }, (_, i) => ({
        bcps: `N${i}`,
        dia: "2026-10-12",
        gmv: 900,
        boletos: 3,
        itens: 6,
      })),
    };
    const a = avisarArquivo(arquivo, { linhas: h(30, 100), diasCobertos: 30 });
    expect(a.suspeito).toBe(true);
    expect(a.motivos).toHaveLength(2);
  });

  it("arquivo normal ou primeiro envio: sem aviso", () => {
    const normal = { inicio: "2026-10-12", fim: "2026-10-12", linhas: h(1, 150) };
    expect(avisarArquivo(normal, { linhas: h(30, 100), diasCobertos: 30 }).suspeito).toBe(false);
    expect(avisarArquivo(normal, { linhas: [], diasCobertos: 0 }).suspeito).toBe(false);
  });
});
