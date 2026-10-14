import { describe, expect, it } from "vitest";

import { analisar, ErroDeLayout, type Contexto } from "./analise";
import type { Estoque, Loja, Produto, Vinculo } from "./esquemas";
import type { Planilha } from "./leitor";
import {
  booleano,
  codigo,
  data,
  dataDoNomeDoArquivo,
  mes,
  normalizarCabecalho,
  numero,
} from "./valores";

// Dados fictícios (nada real no Git).
function planilha(cabecalho: string[], linhas: unknown[][], nome = "teste"): Planilha {
  return { nome, cabecalho, chaves: cabecalho.map(normalizarCabecalho), linhas, linhaCabecalho: 1 };
}

const ctx = (extra: Partial<Contexto> = {}): Contexto => ({
  nomeArquivo: "arquivo.csv",
  lojas: [
    { bcps: "100", tipo: "loja", divisao: "4001" },
    { bcps: "200", tipo: "loja", divisao: "4002" },
    { bcps: "900", tipo: "hub", divisao: null },
  ],
  versaoRef: null,
  ciclo: null,
  mes: null,
  ...extra,
});

describe("valores", () => {
  it("normaliza cabeçalhos", () => {
    expect(normalizarCabecalho("\uFEFFPreço de Venda")).toBe("preco de venda");
    expect(normalizarCabecalho("MÊS/ANO")).toBe("mes ano");
    expect(normalizarCabecalho("canal_geral")).toBe("canal geral");
  });

  it("lê números no formato brasileiro e internacional", () => {
    expect(numero("58,06")).toBe(58.06);
    expect(numero("1.234,56")).toBe(1234.56);
    expect(numero("174.9")).toBe(174.9);
    expect(numero("R$ 10,00")).toBe(10);
    expect(numero("∞")).toBe(Infinity);
    expect(numero("")).toBeNull();
    expect(numero("abc")).toBeNaN();
    expect(numero(3)).toBe(3);
  });

  it("lê códigos sem casas decimais", () => {
    expect(codigo(59466)).toBe("59466");
    expect(codigo("59466.0")).toBe("59466");
    expect(codigo(" 0123 ")).toBe("0123");
    expect(codigo("")).toBeNull();
  });

  it("lê datas e meses", () => {
    expect(data("01/08/2026")).toBe("2026-08-01");
    expect(data("2026-10-07")).toBe("2026-10-07");
    expect(data(46000)).toBe("2025-12-09"); // serial do Excel
    expect(mes("2026-07")).toBe("2026-07");
    expect(dataDoNomeDoArquivo("cobertura_2026-10-07.csv")).toBe("2026-10-07");
    expect(dataDoNomeDoArquivo("base.csv")).toBeNull();
  });

  it("lê sim/não", () => {
    expect(booleano("True")).toBe(true);
    expect(booleano("não")).toBe(false);
    expect(booleano("")).toBeNull();
  });
});

describe("lojas", () => {
  const cab = ["bcps", "divisao", "loja", "praca", "tipo", "canal_geral", "canais", "vendedoras"];

  it("converte o layout tratado", () => {
    const a = analisar(
      "lojas",
      [
        planilha(cab, [
          ["100", "4001", "Loja A", "Praça 1", "loja", "Híbrida", "Varejo|Venda Direta", "3"],
        ]),
      ],
      ctx(),
    );
    const l = a.partes[0]!.linhas[0] as Loja;
    expect(l).toMatchObject({
      bcps: "100",
      tipo: "loja",
      canais: ["Varejo", "Venda Direta"],
      vendedoras: 3,
    });
    expect(a.erros).toHaveLength(0);
  });

  it("recusa tipo inválido; dCentros pela coluna Tipo", () => {
    const a = analisar(
      "lojas",
      [planilha(cab, [["100", "", "A", "P", "Varejo", "", "", ""]])],
      ctx(),
    );
    expect(a.erros[0]?.mensagem).toMatch(/Tipo/);
    const dc = analisar(
      "lojas",
      [
        planilha(
          [
            "Loja",
            "Nome",
            "Nome Abreviado",
            "BCPS",
            "SAP_campo_antigo",
            "SAP",
            "Centro de custo",
            "Tipo",
            "Marca",
            "Praça",
            "Descrição centro de custo",
          ],
          [
            [
              "1",
              "Loja Um completa",
              "Loja Um",
              100,
              1,
              "A1",
              "401A1",
              "Varejo",
              "O Boticário",
              "P1",
              "x",
            ],
            [
              "2",
              "Loja Dois",
              "Loja Dois",
              200,
              0,
              4065,
              "402124065",
              "Híbrida",
              "O Boticário",
              "P1",
              "x",
            ],
            ["3", "Hub", "Hub", 900, 0, "A3", "c3", "HUB", "O Boticário", "P1", "x"],
            ["4", "VD", "VD", 300, 0, "A4", "c4", "Venda Direta", "O Boticário", "P1", "x"],
            [
              "5",
              "ER - Areinha",
              "Areinha",
              400,
              0,
              "A5",
              "c5",
              "Venda Direta",
              "O Boticário",
              "P1",
              "x",
            ],
            [
              "6",
              "QDB Midway",
              "QDB Midway",
              500,
              0,
              "A6",
              "c6",
              "Varejo",
              '""Quem Disse, Berenice?""',
              "P1",
              "x",
            ],
            ["7", "Estoque", "Estoque", 600, 0, "A7", "c7", "Estoque", "O Boticário", "P1", "x"],
            [
              "8",
              "Escritório",
              "Escritório",
              700,
              0,
              "A8",
              "c8",
              "Escritório",
              "O Boticário",
              "Brasil",
              "x",
            ],
            [null, null, null, null, null, null, null, 129, null, null, null],
          ],
        ),
      ],
      ctx(),
    );
    expect(dc.layout).toMatch(/dCentros/);
    expect(dc.erros).toHaveLength(0);
    const linhas = dc.partes[0]!.linhas as Loja[];
    expect(linhas[0]).toEqual({
      bcps: "100",
      nome: "Loja Um completa",
      nome_completo: "Loja Um completa",
      praca: "P1",
      tipo: "loja",
      canal_geral: "Varejo",
      canais: ["Varejo"],
      tipo_dcentros: "Varejo",
      sap: "A1",
      centro_custo: "401A1",
      marca: "O Boticário",
    });
    expect(linhas[1]).toMatchObject({
      tipo: "loja",
      canal_geral: "Híbrida",
      canais: ["Varejo", "Venda Direta"],
      sap: "4065",
    });
    expect(linhas.map((l) => [l.bcps, l.tipo, l.tipo_dcentros])).toEqual([
      ["100", "loja", "Varejo"],
      ["200", "loja", "Híbrida"],
      ["900", "hub", "HUB"],
      ["300", "outro", "Venda Direta"],
      ["400", "outro", "Venda Direta"], // ER vem como Venda Direta
      ["500", "loja", "Varejo"], // QDB vem como Varejo (acha-se pela Marca)
      ["600", "hub", "Estoque"],
      ["700", "outro", "Escritório"],
    ]);
    // "participa" nunca vem do arquivo; 300, 400, 500, 600 e 700 são novas
    expect(linhas.every((l) => !("participa" in l))).toBe(true);
    expect(dc.avisos.join(" ")).toMatch(/5 loja\(s\) nova\(s\)/);
  });

  it("cobertura e gerentes: grava lojas (Varejo/Híbrida) e qualquer loja que participe", () => {
    const c = ctx({
      versaoRef: "2026-10-07",
      lojas: [
        { bcps: "100", tipo: "loja", divisao: null, participa: false },
        { bcps: "900", tipo: "hub", divisao: null, participa: true },
        { bcps: "901", tipo: "hub", divisao: null, participa: false },
      ],
    });
    const cob = analisar(
      "cobertura",
      [
        planilha(
          ["SKU", "Descrição", "BCPS", "Estoque", "Custo", "Preço de Venda", "VMD", "Situação"],
          [
            ["1", "A", "100", "5", "1", "10", "1", "x"],
            ["1", "A", "900", "5", "1", "10", "1", "x"],
            ["1", "A", "901", "5", "1", "10", "1", "x"],
          ],
        ),
      ],
      c,
    );
    const registros = cob.partes.find((p) => p.parte === "registros")!.linhas as Estoque[];
    const lojas = registros.map((e) => e.bcps).sort();
    expect(lojas).toEqual(["100", "900"]);
  });
});

describe("gerentes (dGerentes)", () => {
  const cab = [
    "MÊS/ANO",
    "BCPS",
    "DIVISÃO",
    "LOJA",
    "Nome Completo GVO",
    "Matrícula GVO",
    "Nome completo GCVO/GPVO",
    "Matrícula GCVO/GPVO",
    "Nome completo GRVO",
    "Matrícula GRVO",
    "Canal Geral",
    "Canal",
  ];
  const linhas = [
    [
      "01/07/2026",
      100,
      "4001",
      "A",
      "Gvo Um",
      "1",
      "Gc Um",
      "10",
      "Gr Um",
      "20",
      "Híbrida",
      "Varejo",
    ],
    [
      "01/08/2026",
      100,
      "4001",
      "A",
      "Gvo Um",
      "1",
      "Gc Um",
      "10",
      "Gr Um",
      "20",
      "Híbrida",
      "Varejo",
    ],
    [
      "01/08/2026",
      100,
      "4001",
      "A",
      "Gvo Um",
      "1",
      "Gc Um",
      "10",
      "Gr Um",
      "20",
      "Híbrida",
      "Venda Direta",
    ],
    [
      "01/08/2026",
      200,
      "4002",
      "B",
      "Gvo Dois",
      "2",
      "Gc Um",
      "10",
      "Gr Um",
      "20",
      "Varejo",
      "Varejo",
    ],
    ["01/08/2026", 900, "", "HUB", "", "", "", "", "", "", "", ""],
    ["01/08/2026", 999, "", "Fora", "Gvo Nove", "9", "", "", "", "", "", ""],
    [
      "01/09/2026",
      200,
      "4002",
      "B",
      "Gvo Dois",
      "2",
      "Gc Dois",
      "11",
      "Gr Um",
      "20",
      "Varejo",
      "Varejo",
    ],
  ];

  it("usa o mês mais recente completo e ignora BCPS fora da base de lojas", () => {
    const a = analisar("gerentes", [planilha(cab, linhas)], ctx());
    expect(a.mes).toBe("2026-08");
    const v = a.partes.find((p) => p.parte === "registros")!.linhas as Vinculo[];
    // loja 100: gvo 1, gc 10, gr 20 (híbrida não duplica) · loja 200: gvo 2, gc 10, gr 20
    expect(v).toHaveLength(6);
    expect(
      v
        .filter((x) => x.nivel === "gcvo_gpvo")
        .map((x) => x.bcps)
        .sort(),
    ).toEqual(["100", "200"]);
    const info = a.partes.find((p) => p.parte === "lojas")!.linhas as {
      bcps: string;
      canais: string[];
    }[];
    expect(info.find((i) => i.bcps === "100")!.canais).toEqual(["Varejo", "Venda Direta"]);
    // HUB 900 está cadastrado (sem gerentes no arquivo); 999 não está na base de lojas
    expect(a.avisos.join(" ")).toMatch(/999/);
    expect(a.avisos.join(" ")).not.toMatch(/900/);
  });

  it("hierarquia loja por loja: híbrida com gerentes diferentes vale a 1ª linha; matrícula não ordena", () => {
    const conflito = [
      [
        "01/08/2026",
        100,
        "4001",
        "A",
        "Gvo Um",
        "1",
        "Gc Um",
        "10",
        "Gr Um",
        "20",
        "Híbrida",
        "Varejo",
      ],
      // segunda linha da híbrida com outro GVO (matrícula menor) e o mesmo GCVO/GRVO
      [
        "01/08/2026",
        100,
        "4001",
        "A",
        "Gvo Zero",
        "0005",
        "Gc Um",
        "10",
        "Gr Um",
        "20",
        "Híbrida",
        "Venda Direta",
      ],
      // loja 200: o GRVO tem matrícula menor que a do GVO — a posição vem da coluna, não do número
      [
        "01/08/2026",
        200,
        "4002",
        "B",
        "Gvo Grande",
        "9999",
        "Gc Um",
        "10",
        "Gr Pequeno",
        "3",
        "Varejo",
        "Varejo",
      ],
    ];
    const a = analisar("gerentes", [planilha(cab, conflito)], ctx());
    const v = a.partes.find((p) => p.parte === "registros")!.linhas as Vinculo[];
    const de = (bcps: string, nivel: string) =>
      v.filter((x) => x.bcps === bcps && x.nivel === nivel).map((x) => x.matricula);
    expect(de("100", "gvo")).toEqual(["1"]);
    expect(a.avisos.join(" ")).toMatch(/gerentes diferentes/);
    expect(de("200", "gvo")).toEqual(["9999"]);
    expect(de("200", "grvo")).toEqual(["3"]);
  });

  it("permite escolher outro mês", () => {
    const a = analisar("gerentes", [planilha(cab, linhas)], ctx({ mes: "2026-09" }));
    expect(a.mes).toBe("2026-09");
    expect((a.partes[0]!.linhas as Vinculo[]).some((x) => x.matricula === "11")).toBe(true);
  });

  it("exige a base de lojas antes", () => {
    expect(() => analisar("gerentes", [planilha(cab, linhas)], ctx({ lojas: [] }))).toThrow(
      ErroDeLayout,
    );
  });
});

describe("vendedoras", () => {
  it("conta uma linha por vendedora pelo código da filial", () => {
    const a = analisar(
      "vendedoras",
      [
        planilha(
          ["Nome", "Divisão", "Cargo"],
          [
            ["x", "4001", "v"],
            ["y", "4001", "v"],
            ["z", "9999", "v"],
          ],
        ),
      ],
      ctx(),
    );
    expect(a.partes[0]!.linhas).toEqual([{ bcps: "100", vendedoras: 2 }]);
    expect(a.avisos.join(" ")).toMatch(/9999/);
    expect(a.avisos.join(" ")).toMatch(/ficarão com 0/);
  });
});

describe("produtos", () => {
  it("dsku original: descrição sem título, regular pela descrição, sem nicho", () => {
    const cab = [
      "codigo",
      "94673",
      "familia codigo",
      "familia descricao",
      "marca",
      "categoria",
      "subcategoria",
      "mercado",
      "custo",
      "venda",
      "ean",
      "fornecedor",
    ];
    const a = analisar(
      "produtos",
      [
        planilha(cab, [
          [
            1,
            "FLORATTA DES COL 75ml",
            "",
            "",
            "FLORATTA",
            "PERFUMARIA",
            "",
            "",
            10,
            99.9,
            "",
            "BOT",
          ],
          [2, "FLORATTA PRM 10ml", "", "", "FLORATTA", "PERFUMARIA", "", "", 1, 9.9, "", "BOT"],
          [null, null],
        ]),
      ],
      ctx(),
    );
    const p = a.partes[0]!.linhas as Produto[];
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({
      sku: "1",
      fornecedor: "BOT",
      regular: true,
      origem_regular: "descricao",
      origem_cadastro: "dsku",
    });
    expect(p[1]!.regular).toBe(false);
    expect(p[0]).toMatchObject({ nicho: "F", origem_nicho: "marca" });
    expect(a.erros).toHaveLength(0);
    expect(a.avisos.join(" ")).toMatch(/sem código foram puladas/);
  });

  it("layout tratado: marca origem e nicho", () => {
    const cab = [
      "sku",
      "descricao",
      "fornecedor",
      "marca",
      "categoria",
      "subcategoria",
      "preco_dsku",
      "origem_fornecedor",
      "nicho",
      "regular",
    ];
    const a = analisar(
      "produtos",
      [
        planilha(cab, [
          [
            "5",
            "BOTI BABY",
            "BOT",
            "BOTI",
            "INFANTIL",
            "",
            "0",
            "primeira palavra da descricao",
            "U",
            "True",
          ],
        ]),
      ],
      ctx(),
    );
    expect(a.partes[0]!.linhas[0]).toMatchObject({
      origem_fornecedor: "primeira_palavra",
      origem_cadastro: "cobertura",
      nicho: "U",
      origem_nicho: "base",
      preco_dsku: null,
    });
  });
});

describe("cobertura", () => {
  const cab = [
    "SKU",
    "Descrição",
    "BCPS",
    "Loja",
    "Praça",
    "Estado",
    "Estoque",
    "Custo",
    "Preço de Venda",
    "VMD",
    "Cob. Dias",
    "Cob. Meses",
    "Situação",
  ];

  it("lê o original com vírgula decimal e ignora BCPS fora das lojas", () => {
    const a = analisar(
      "cobertura",
      [
        planilha(cab, [
          [
            "59466",
            "LIZ DES COL 100ml",
            "100",
            "",
            "",
            "",
            "8357",
            "58,06",
            "174,9",
            "1,901",
            "4396",
            "199.8m",
            "EXCESSO",
          ],
          ["1", "ITEM ZERO", "200", "", "", "", "3", "1", "0", "0", "∞", "", "PARADO"],
          ["2", "OUTRO", "555", "", "", "", "3", "1", "5", "0", "∞", "", "PARADO"],
        ]),
      ],
      ctx({ nomeArquivo: "cobertura_2026-10-07.csv" }),
    );
    expect(a.versaoRef).toBe("2026-10-07");
    const e = a.partes.find((p) => p.parte === "registros")!.linhas as Estoque[];
    expect(e).toHaveLength(2);
    expect(e[0]).toMatchObject({
      bcps: "100",
      sku: "59466",
      estoque: 8357,
      custo: 58.06,
      preco: 174.9,
      vmd: 1.901,
    });
    expect(a.partes.find((p) => p.parte === "skus")!.linhas).toHaveLength(2);
    expect(a.avisos.join(" ")).toMatch(/R\$ 0,00/);
    expect(a.avisos.join(" ")).toMatch(/555/);
  });

  it("exige data de referência", () => {
    expect(() => analisar("cobertura", [planilha(cab, [])], ctx())).toThrow(/data de referência/);
  });
});

describe("promoção e faturamento", () => {
  it("promoção: exige ciclo; no original vale o maior desconto", () => {
    const cab = ["sku", "desconto_pct", "ressarcimento_bso", "texto"];
    expect(() => analisar("promocao", [planilha(cab, [])], ctx())).toThrow(/ciclo/);
    const a = analisar(
      "promocao",
      [planilha(cab, [["1", "20.0", "True", "x"]])],
      ctx({ ciclo: 15 }),
    );
    expect(a.partes[0]!.linhas[0]).toEqual({
      sku: "1",
      desconto_pct: 20,
      ressarcimento_bso: true,
      texto: "x",
    });
    const orig = analisar(
      "promocao",
      [
        planilha(
          [
            "Marca",
            "SKU",
            "Descrição",
            "Categoria",
            "Desconto Promoção Próximo Ciclo",
            "Promoção Próximo Ciclo",
          ],
          [
            ["X", "7", "A", "C", "35.0\r | 25.0", "Franqueado: Ressarcimento via BSO."],
            ["X", "7", "A", "C", "20.0", "outra"],
            ["X", "8", "B", "C", "0.0", "sem bso"],
            ["X", "9", "B", "C", "10.0", "sem nada"],
            ["X", "9", "B", "C", "5.0", "Ressarcimento via BSO"],
          ],
        ),
      ],
      ctx({ ciclo: 15 }),
    );
    expect(orig.partes[0]!.linhas).toEqual([
      {
        sku: "7",
        desconto_pct: 35,
        ressarcimento_bso: true,
        texto: "Franqueado: Ressarcimento via BSO.",
      },
      { sku: "8", desconto_pct: 0, ressarcimento_bso: false, texto: "sem bso" },
      { sku: "9", desconto_pct: 10, ressarcimento_bso: true, texto: "sem nada" },
    ]);
  });

  it("faturamento diário é somado por loja e mês", () => {
    const cab = ["Praça", "BPCS", "Loja", "Faturamento", "Itens", "Boletos", "Data"];
    const a = analisar(
      "faturamento",
      [
        planilha(cab, [
          ["P", "100", "A", 10.5, 1, 2, "2026-07-01"],
          ["P", "100", "A", 4.5, 1, 1, "2026-07-31"],
          ["P", "100", "A", 1, 1, 1, "2026-08-01"],
          [null, null, null, 999, 0, 0, null],
        ]),
      ],
      ctx(),
    );
    expect(a.partes[0]!.linhas).toEqual([
      { bcps: "100", mes: "2026-07-01", faturamento: 15, boletos: 3 },
      { bcps: "100", mes: "2026-08-01", faturamento: 1, boletos: 1 },
    ]);
    expect(a.erros).toHaveLength(0);
  });
});

describe("vendedoras pelo código SAP (4118 = A118) ou DIVISÃO", () => {
  it("lista com uma linha por vendedora, código SAP nas duas formas", () => {
    const a = analisar(
      "vendedoras",
      [
        planilha(
          ["sap", "nome"],
          [
            ["4118", "Ana"],
            ["A118", "Bia"],
            ["4065", "Carla"],
            ["9999", "Duda"],
          ],
        ),
      ],
      {
        lojas: [
          { bcps: "24598", tipo: "loja", divisao: null, sap: "A118" },
          { bcps: "21423", tipo: "loja", divisao: null, sap: "4065" },
        ],
      } as never,
    );
    expect(a.partes[0]!.linhas).toEqual([
      { bcps: "24598", vendedoras: 2 },
      { bcps: "21423", vendedoras: 1 },
    ]);
    expect(a.avisos.join(" ")).toMatch(/9999/);
  });

  it("quantidade por loja com a coluna SAP no lugar do BCPS", () => {
    const a = analisar(
      "vendedoras",
      [
        planilha(
          ["sap", "vendedoras"],
          [
            ["4118", 3],
            ["4065", 2],
          ],
        ),
      ],
      {
        lojas: [
          { bcps: "24598", tipo: "loja", divisao: null, sap: "A118" },
          { bcps: "21423", tipo: "loja", divisao: null, sap: "4065" },
        ],
      } as never,
    );
    expect(a.partes[0]!.linhas).toEqual([
      { bcps: "24598", vendedoras: 3 },
      { bcps: "21423", vendedoras: 2 },
    ]);
  });
});
