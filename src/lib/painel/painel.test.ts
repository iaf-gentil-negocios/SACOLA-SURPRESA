// Parte F2a: regras puras dos dashboards (resumo de estoque, painel do admin, painel do gerente).
import { describe, expect, it } from "vitest";

import type { DadosPainelGerente } from "@/lib/gerente/painel";

import { derivados, montarPainelAdmin, saudeDosAcessos, type CadastroLoja } from "./admin";
import { resumirEstoque, resumoMaisRecente, skusHeroiDoCiclo } from "./estoque";
import { montarPainelGerente } from "./gerente";

const P = { parado_cobertura_dias: 180, heroi_estoque_min: 10, heroi_preco_min: 99.9 };

describe("resumo de estoque por loja", () => {
  const linhas = [
    { bcps: "L1", sku: "A", estoque: 20, vmd: 1, preco: 120, custo: 40 }, // gira (20 dias), herói
    { bcps: "L1", sku: "B", estoque: 400, vmd: 2, preco: 50, custo: 10 }, // parado (200 dias)
    { bcps: "L1", sku: "C", estoque: 5, vmd: 0, preco: 150, custo: null }, // VMD 0 = parado; estoque < 10
    { bcps: "L1", sku: "Z", estoque: 0, vmd: 1, preco: 10, custo: 1 }, // sem estoque: fora
    { bcps: "L2", sku: "A", estoque: 9, vmd: 1, preco: 120, custo: 40 }, // estoque < mínimo do herói
  ];
  const produtos = new Map([
    ["A", { regular: true, fornecedor: "BOT" }],
    ["B", { regular: true, fornecedor: "BOT" }],
    ["C", { regular: false, fornecedor: "BOT" }],
  ]);

  it("herói do ciclo: em promoção, regular e BOT", () => {
    const skus = skusHeroiDoCiclo(
      [
        { sku: "A", desconto_pct: 30 },
        { sku: "C", desconto_pct: 30 },
        { sku: "B", desconto_pct: 0 },
      ],
      produtos,
    );
    expect([...skus]).toEqual(["A"]);
  });

  it("conta SKUs, unidades, valor a custo, parados e heróis por ciclo", () => {
    const r = resumirEstoque(linhas, "2026-10-11", new Map([[15, new Set(["A"])]]), P);
    expect(r).toEqual([
      {
        bcps: "L1",
        ref: "2026-10-11",
        skus: 3,
        unidades: 425,
        valorCusto: 800 + 4000,
        paradosSkus: 2,
        paradosCusto: 4000,
        herois: { "15": 1 },
      },
      {
        bcps: "L2",
        ref: "2026-10-11",
        skus: 1,
        unidades: 9,
        valorCusto: 360,
        paradosSkus: 0,
        paradosCusto: 0,
        herois: { "15": 0 },
      },
    ]);
  });

  it("ciclo sem promoção não aparece em heróis; vale só a Cobertura mais recente", () => {
    const r = resumirEstoque(linhas, "2026-10-11", new Map(), P);
    expect(r[0]!.herois).toEqual({});
    const velho = { ...r[1]!, bcps: "L9", ref: "2026-10-01" };
    expect(resumoMaisRecente([...r, velho]).map((x) => x.bcps)).toEqual(["L1", "L2"]);
  });
});

const CADASTRO: CadastroLoja[] = [
  { bcps: "L1", nome: "Loja 1", praca: "Natal", ativo: true, participa: true },
  { bcps: "L2", nome: "Loja 2", praca: "Mossoró", ativo: true, participa: true },
  { bcps: "L3", nome: "Loja 3", praca: "Natal", ativo: true, participa: false },
];

describe("painel do admin (refeito em 12/10/2026)", () => {
  const painel = montarPainelAdmin({
    lojasBase: [
      {
        bcps: "L1",
        meta: 3800,
        vendedoras: 4,
        metaSemana: 1565,
        sacolasMeta: 20,
        sacolasPlanejadas: 16, // falta estoque
        receita: 3040,
        custo: 1280,
        capacidade: 12,
        disponivelRef: "2026-10-11",
      },
      {
        bcps: "L2",
        meta: 1900,
        vendedoras: 2,
        metaSemana: 782,
        sacolasMeta: 10,
        sacolasPlanejadas: 10,
        receita: 1900,
        custo: 800,
        capacidade: null,
        disponivelRef: null,
      },
    ],
    cadastro: CADASTRO,
    resumo: [],
    diasCiclo: 14,
  });

  it("soma por praça e no total; pode montar só onde há disponibilidade", () => {
    expect(painel.pracas.map((p) => [p.praca, p.sacolasMeta, p.podeMontar])).toEqual([
      ["Mossoró", 10, null],
      ["Natal", 20, 12],
    ]);
    expect(painel.totais).toMatchObject({ meta: 5700, sacolasMeta: 30, sacolasPlanejadas: 26 });
    expect(painel.disponivelRef).toBe("2026-10-11");
  });

  it("cards: preço médio, margem por sacola e margem se a meta for batida", () => {
    const d = derivados(painel.totais, painel.semanas);
    expect(d.precoMedio).toBeCloseTo(4940 / 26); // receita ÷ sacolas planejadas
    expect(d.margemPorSacola).toBeCloseTo((4940 - 2080) / 26);
    expect(d.margemPct).toBeCloseTo((4940 - 2080) / 4940);
    expect(d.margemDaMeta).toBeCloseTo(((4940 - 2080) / 26) * 30); // × meta de sacolas
  });

  it("sacolas por semana e por vendedora (semana e ciclo)", () => {
    const d = derivados(painel.totais, painel.semanas); // 14 dias = 2 semanas, 6 vendedoras
    expect(d.sacolasPorSemana).toBe(15);
    expect(d.sacolasPorVendedora).toBe(5);
    expect(d.sacolasPorVendedoraSemana).toBe(3); // 2,5 → 3: não existe meia sacola (P2)
  });

  it("aviso: lojas que não alcançam a meta por falta de estoque", () => {
    expect(painel.faltaEstoque.map((l) => l.bcps)).toEqual(["L1"]);
  });

  it("sem sacolas planejadas ou sem vendedoras: '—' em vez de dividir por zero", () => {
    const d = derivados(
      { ...painel.totais, sacolasPlanejadas: 0, vendedoras: 0, receitaPlanejada: 0 },
      2,
    );
    expect(d.precoMedio).toBeNull();
    expect(d.margemDaMeta).toBeNull();
    expect(d.sacolasPorVendedora).toBeNull();
  });
});

describe("saúde dos acessos", () => {
  const p = (nome: string, perfil: string, matricula: string | null, extra = {}) => ({
    nome,
    usuario: nome.toLowerCase(),
    perfil,
    ativo: true,
    matricula,
    ...extra,
  });
  const s = saudeDosAcessos(CADASTRO, {
    vinculos: [
      { matricula: "900", bcps: "L1", nivel: "gvo" },
      { matricula: "902", bcps: "L3", nivel: "gvo" },
    ],
    nomes: new Map(),
    perfis: [
      p("Ana", "gerente", "900"), // tem loja
      p("Beto", "gerente", "777"), // matrícula fora da hierarquia
      p("Caio", "grvo", null), // sem matrícula
      p("Dora", "gerente", null, { ve_todas: true }), // diretoria: não entra
      p("Eva", "gerente", "555", { ativo: false }), // inativa: não entra
      p("Fabi", "acompanhamento", null), // não é gerente
      p("Gil", "admin", null),
    ],
  });

  it("lojas sem gerente: só as que participam e estão ativas", () => {
    expect(s.lojasSemGerente.map((l) => l.bcps)).toEqual(["L2"]);
  });

  it("gerentes sem loja: ativos, sem matrícula ou fora da hierarquia, sem 'vê todas'", () => {
    expect(s.gerentesSemLoja.map((g) => g.nome)).toEqual(["Beto", "Caio"]);
  });
});

describe("painel do gerente (refeito em 12/10/2026)", () => {
  const d: DadosPainelGerente = {
    base: {
      id: 1,
      ciclo: 15,
      nome: "B",
      inicio: "2026-10-16",
      fim: "2026-11-01",
      kitsVersao: null,
    },
    ciclo: { id: 15, nome: "Ciclo 15", inicio: "2026-10-16", fim: "2026-11-01" },
    lojas: [
      {
        bcps: "L1",
        nome: "Loja 1",
        praca: "Natal",
        meta: 3400,
        vendedoras: 4,
        metasMes: { "2026-10": 3200, "2026-11": 200 },
        sacolasMeta: 18,
        sacolasPlanejadas: 15,
        receitaPlanejada: 2848.5,
        podeMontar: 6,
      },
      {
        bcps: "L2",
        nome: "Loja 2",
        praca: "Mossoró",
        meta: 1700,
        vendedoras: 0,
        metasMes: { "2026-10": 1600, "2026-11": 100 },
        sacolasMeta: 9,
        sacolasPlanejadas: 8,
        receitaPlanejada: 1519.2,
        podeMontar: null,
      },
    ],
    pracas: ["Mossoró", "Natal"],
    disponivelRef: "2026-10-11",
  };

  it("meta do mês, meta de sacolas, pode montar e preço médio", () => {
    const p = montarPainelGerente(d, "2026-10");
    expect(p.totais).toMatchObject({
      metaMes: 4800,
      meta: 5100,
      sacolasMeta: 27,
      podeMontar: 6,
    });
    expect(derivados(p.totais, p.semanas).precoMedio).toBeCloseTo((2848.5 + 1519.2) / 23);
    expect(p.semanas).toBeCloseTo(17 / 7);
  });

  it("filtro por praça", () => {
    const p = montarPainelGerente(d, "2026-11", "Mossoró");
    expect(p.lojas.map((l) => l.bcps)).toEqual(["L2"]);
    expect(p.totais).toMatchObject({ metaMes: 100, podeMontar: null });
  });

  it("o gerente nunca recebe custo nem margem", () => {
    const p = montarPainelGerente(d, "2026-10");
    expect(p.totais.custoPlanejado).toBe(0);
    for (const l of p.lojas) expect(l.custoPlanejado).toBe(0);
  });
});

describe("realizado (F2b)", () => {
  it("sacolas = venda estimada ÷ preço médio da loja; sem vendas = null; loja sem linha = 0", async () => {
    const { realizadoDaLoja } = await import("./admin");
    const vendas = new Map([
      ["L1", { bcps: "L1", canal: 500, boletos: 3, ruido: 110, estimado: 390 }],
    ]);
    expect(realizadoDaLoja(vendas, "L1", 1950, 10)).toEqual({
      vendido: 390,
      sacolas: 2,
      canal: 500,
      ruido: 110,
      boletos: 3,
    });
    expect(realizadoDaLoja(vendas, "L2", 1000, 5)).toMatchObject({ vendido: 0, sacolas: 0 });
    expect(realizadoDaLoja(null, "L1", 1950, 10)).toBeNull();
  });

  it("% da meta, % de sacolas e margem realizada; soma por praça", () => {
    const vendas = new Map([
      ["L1", { bcps: "L1", canal: 1900, boletos: 10, ruido: 0, estimado: 1900 }],
    ]);
    const p = montarPainelAdmin({
      lojasBase: [
        {
          bcps: "L1",
          meta: 3800,
          vendedoras: 4,
          metaSemana: 1565,
          sacolasMeta: 20,
          sacolasPlanejadas: 20,
          receita: 3800,
          custo: 1800,
          capacidade: null,
          disponivelRef: null,
        },
      ],
      cadastro: CADASTRO,
      resumo: [],
      diasCiclo: 14,
      vendas,
    });
    const d = derivados(p.totais, p.semanas);
    expect(p.totais.realizado).toMatchObject({ vendido: 1900, sacolas: 10 });
    expect(d.pctMeta).toBe(0.5);
    expect(d.pctSacolas).toBe(0.5);
    expect(d.margemRealizada).toBe(1000); // (3800 − 1800) ÷ 20 × 10
  });
});

describe("declaração × sistema (F2b)", () => {
  it("estimativa = sacolas × preço médio; desvio sobre o sistema; sem vendas do período = —", async () => {
    const { comparar } = await import("@/lib/vendas/declaracoes");
    const dec = {
      id: 1,
      userId: "u",
      bcps: "L1",
      ciclo: 15,
      tipo: "dia" as const,
      inicio: "2026-10-16",
      fim: "2026-10-16",
      sacolas: 3,
      precoMedio: 190,
      status: "pendente" as const,
      motivo: null,
      criadoEm: "",
      decididoEm: null,
    };
    const vendas = {
      linhas: [{ bcps: "L1", dia: "2026-10-16", gmv: 500, boletos: 3, itens: 9 }],
      ruidos: [{ bcps: "L1", dow: 5, ruido: 100, dias_historico: 56, outliers: 0 }],
      ate: "2026-10-20",
    };
    expect(comparar(dec, vendas)).toEqual({ declarado: 570, sistema: 400, desvio: 0.425 });
    expect(comparar(dec, { ...vendas, ate: "2026-10-15" }).sistema).toBeNull();
    expect(comparar(dec, null).desvio).toBeNull();
  });
});
