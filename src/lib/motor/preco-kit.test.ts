// P1 (13/10/2026): o desconto do kit vale só para as surpresas; o herói entra pelo preço promocional.
import { describe, expect, it } from "vitest";

import { heroiCabeNaFaixa, precoDoKit, simular } from "./gerar";
import { faixasDaPraca, PARAMETROS_PADRAO } from "./parametros";
import { CICLOS_PADRAO } from "@/lib/local/seed";

const faixa = { pMin: 180, pMax: 200, dMin: 0.2, dMax: 0.5, dAlvo: 0.35 };

describe("preço do kit (P1)", () => {
  it("1. o herói entra pelo preço promocional e não recebe desconto adicional", () => {
    // herói R$ 100 cheio, 30% de promoção → R$ 70; surpresas R$ 180 cheio
    const r = precoDoKit(70, 180, faixa, 5, 0.9)!;
    // o "por" menos o herói é o que sobra para as surpresas: o herói fica inteiro em R$ 70
    const surpresasPor = r.preco - 70;
    expect(surpresasPor).toBeCloseTo(180 * (1 - r.descontoSurpresas), 6);
    expect(r.preco).toBeGreaterThan(70 + 180 * (1 - faixa.dMax) - 1e-9);
  });

  it("2. a faixa de desconto do Motor vale só para as surpresas", () => {
    const r = precoDoKit(70, 180, faixa, 5, 0.9)!;
    expect(r.descontoSurpresas).toBeGreaterThanOrEqual(faixa.dMin - 0.002);
    expect(r.descontoSurpresas).toBeLessThanOrEqual(faixa.dMax + 0.002);
    // alvo 35%: 70 + 180 × 0,65 = 187 → degrau mais próximo = 184,90
    expect(r.preco).toBe(184.9);
    // surpresas sem desconto possível dentro da faixa → kit recusado
    expect(precoDoKit(70, 500, faixa, 5, 0.9)).toBeNull(); // precisaria de > 50%
    expect(precoDoKit(150, 40, faixa, 5, 0.9)).toBeNull(); // passaria do preço máximo sem desconto
  });

  it("3. preço riscado (de) = herói promocional + surpresas pelo preço cheio", () => {
    const r = precoDoKit(70, 180, faixa, 5, 0.9)!;
    expect(r.valorCheio).toBe(250);
  });

  it("4. preço final (por) = herói promocional + surpresas com desconto; % off é do kit todo", () => {
    const r = precoDoKit(70, 180, faixa, 5, 0.9)!;
    expect(r.preco).toBeCloseTo(70 + 180 * (1 - r.descontoSurpresas), 6);
    expect(r.desconto).toBeCloseTo(1 - r.preco / r.valorCheio, 9);
    // o desconto do kit todo é menor que o das surpresas (o herói não tem desconto do kit)
    expect(r.desconto).toBeLessThan(r.descontoSurpresas);
  });

  it("5. degrau e terminação no total do kit (não item a item)", () => {
    // 70 + 180 × 0,65 = 187,00 (não termina em ,90): o total é que vai para o degrau
    const r = precoDoKit(70, 180, faixa, 5, 0.9)!;
    expect(Math.round(r.preco * 100) % 500).toBe(490);
    // os itens em si não são arredondados: 184,90 − 70 = 114,90 para as surpresas (não um degrau)
    expect(r.preco - 70).toBeCloseTo(114.9, 6);
  });

  it("kit com várias surpresas: o desconto só incide sobre a soma delas", () => {
    const heroi = 119.9 * (1 - 0.4); // 71,94
    const surpresas = [39.9, 54.9, 29.9, 44.9]; // 169,60
    const s = surpresas.reduce((a, b) => a + b, 0);
    const r = precoDoKit(heroi, s, faixa, 5, 0.9)!;
    expect(r.valorCheio).toBeCloseTo(heroi + s, 6);
    expect(r.preco - heroi).toBeCloseTo(s * (1 - r.descontoSurpresas), 6);
    expect(r.descontoSurpresas).toBeGreaterThanOrEqual(faixa.dMin - 0.002);
    expect(r.descontoSurpresas).toBeLessThanOrEqual(faixa.dMax + 0.002);
    expect(Math.round(r.preco * 100) % 500).toBe(490);
  });

  it("preço fixo (kit reaproveitado): vale se o desconto das surpresas ficar na faixa", () => {
    expect(precoDoKit(70, 180, faixa, 5, 0.9, 189.9)?.preco).toBe(189.9);
    // surpresas de R$ 140 a 199,90: 1 − 129,90 ÷ 140 = 7% de desconto, abaixo do mínimo
    expect(precoDoKit(70, 140, faixa, 5, 0.9, 199.9)).toBeNull();
  });
});

describe("motor com o preço do P1", () => {
  it("o desconto nunca incide sobre o herói (kit gerado)", () => {
    // uma loja, um herói em promoção e surpresas suficientes para fechar o kit
    const p = { ...PARAMETROS_PADRAO, itens_min: 3, itens_max: 6 };
    const produtos = [
      {
        sku: "H",
        descricao: "Herói",
        marca: "M",
        categoria: "PERFUMARIA",
        nicho: "F" as const,
        regular: true,
        fornecedor: "BOT",
      },
      ...["A", "B", "C", "D", "E"].map((sku, i) => ({
        sku,
        descricao: `Item ${sku}`,
        marca: "M",
        categoria: ["CORPO", "BANHO", "CABELOS", "MAQUIAGEM", "ROSTO"][i]!,
        nicho: "F" as const,
        regular: true,
        fornecedor: "BOT",
      })),
    ];
    const precos: Record<string, number> = {
      H: 149.9,
      A: 49.9,
      B: 44.9,
      C: 39.9,
      D: 54.9,
      E: 34.9,
    };
    const estoque = Object.entries(precos).map(([sku, preco]) => ({
      bcps: "L1",
      sku,
      estoque: 50,
      preco,
      custo: preco * 0.3,
      vmd: 1,
    }));
    const r = simular({
      ciclo: CICLOS_PADRAO[0]!,
      ciclos: CICLOS_PADRAO,
      lojas: [
        {
          bcps: "L1",
          nome: "Loja",
          praca: "Natal",
          vendedoras: 1,
          tipo: "loja",
          ativo: true,
          participa: true,
        },
      ],
      faturamento: [{ bcps: "L1", mes: "2026-08-01", faturamento: 100 }],
      estoque,
      produtos,
      promocoes: [{ sku: "H", desconto_pct: 40 }],
      parametros: p,
      semente: 7,
    });
    expect(r.kits.length).toBeGreaterThan(0);
    const f = faixasDaPraca(p, "Natal");
    for (const k of r.kits) {
      const h = k.itens.find((i) => i.papel === "heroi")!;
      expect(h.precoItem).toBeCloseTo(149.9 * 0.6, 1); // promocional, sem o desconto do kit
      const s = k.itens.filter((i) => i.papel !== "heroi").reduce((a, i) => a + i.precoItem, 0);
      expect(k.valorCheio).toBeCloseTo(h.precoItem + s, 1);
      const ds = 1 - (k.preco - h.precoItem) / s;
      expect(ds).toBeGreaterThanOrEqual(f.dMin - 0.005);
      expect(ds).toBeLessThanOrEqual(f.dMax + 0.005);
      expect(k.descontoPct).toBeCloseTo(100 * (1 - k.preco / k.valorCheio), 0);
    }
  });
});

describe("herói que não cabe na faixa de preço (correção de 13/10/2026)", () => {
  it("herói com preço promocional no teto ou sem espaço para as surpresas mínimas não concorre", () => {
    const f = { pMax: 200, dMax: 0.5 };
    expect(heroiCabeNaFaixa(209, f, 40)).toBe(false); // acima do preço máximo
    expect(heroiCabeNaFaixa(200, f, 0)).toBe(false);
    expect(heroiCabeNaFaixa(192, f, 40)).toBe(false); // sobra (200 − 192) ÷ 0,5 = R$ 16 < R$ 40
    expect(heroiCabeNaFaixa(150, f, 40)).toBe(true); // sobra R$ 100
    expect(heroiCabeNaFaixa(180, f, 40)).toBe(true); // sobra exatamente R$ 40
  });

  it("o herói caro não trava a loja: o motor usa os que cabem e monta os kits", () => {
    const p = { ...PARAMETROS_PADRAO, itens_min: 3, itens_max: 6 };
    const produtos = [
      // o herói mais caro (1º na ordem padrão: preço cheio maior) não cabe: promoção R$ 240
      {
        sku: "CARO",
        descricao: "Herói caro",
        marca: "M",
        categoria: "PERFUMARIA",
        nicho: "F" as const,
        regular: true,
        fornecedor: "BOT",
      },
      {
        sku: "H",
        descricao: "Herói",
        marca: "M",
        categoria: "PERFUMARIA",
        nicho: "F" as const,
        regular: true,
        fornecedor: "BOT",
      },
      ...["A", "B", "C", "D", "E"].map((sku, i) => ({
        sku,
        descricao: `Item ${sku}`,
        marca: "M",
        categoria: ["CORPO", "BANHO", "CABELOS", "MAQUIAGEM", "ROSTO"][i]!,
        nicho: "F" as const,
        regular: true,
        fornecedor: "BOT",
      })),
    ];
    const precos: Record<string, number> = {
      CARO: 299.9,
      H: 149.9,
      A: 49.9,
      B: 44.9,
      C: 39.9,
      D: 54.9,
      E: 34.9,
    };
    const r = simular({
      ciclo: CICLOS_PADRAO[0]!,
      ciclos: CICLOS_PADRAO,
      lojas: [
        {
          bcps: "L1",
          nome: "Loja",
          praca: "Natal",
          vendedoras: 1,
          tipo: "loja",
          ativo: true,
          participa: true,
        },
      ],
      faturamento: [{ bcps: "L1", mes: "2026-08-01", faturamento: 100 }],
      estoque: Object.entries(precos).map(([sku, preco]) => ({
        bcps: "L1",
        sku,
        estoque: 50,
        preco,
        custo: preco * 0.3,
        vmd: 1,
      })),
      produtos,
      promocoes: [
        { sku: "CARO", desconto_pct: 20 },
        { sku: "H", desconto_pct: 40 },
      ],
      parametros: p,
      semente: 7,
    });
    expect(r.kits.length).toBeGreaterThan(0);
    expect(r.kits.every((k) => k.itens.find((i) => i.papel === "heroi")!.sku === "H")).toBe(true);
  });
});
