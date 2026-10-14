// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { CICLOS_PADRAO, dadosDaSeed, type DadosSeed } from "@/lib/local/seed";

import { precoNaFaixa, simular, type ResultadoSimulacao } from "./gerar";
import { diasPorMes, metaDoCiclo, metaPorMes, metasDoCiclo } from "./metas";
import { faixasDaPraca, PARAMETROS_PADRAO, parametrosDasLinhas } from "./parametros";

describe("preço e metas", () => {
  it("preço final nos degraus ,90 de R$ 5", () => {
    expect(precoNaFaixa(186, 180, 200, 5, 0.9)).toBe(184.9);
    expect(precoNaFaixa(188, 180, 200, 5, 0.9)).toBe(189.9);
    expect(precoNaFaixa(300, 180, 200, 5, 0.9)).toBe(199.9);
    expect(precoNaFaixa(10, 180, 200, 5, 0.9)).toBe(184.9);
  });

  it("dias por mês e meta mensal dos ciclos de 2026", () => {
    expect(diasPorMes("2026-10-16", "2026-11-01")).toEqual({ "2026-10": 16, "2026-11": 1 });
    expect(diasPorMes("2026-11-30", "2026-12-25")).toEqual({ "2026-11": 1, "2026-12": 25 });
    const p = PARAMETROS_PADRAO;
    const total = { "2026-10": 0, "2026-11": 0, "2026-12": 0 } as Record<string, number>;
    for (const c of CICLOS_PADRAO) {
      const meta = p.meta_total * p.meta_pesos_ciclos[String(c.id)]!;
      for (const [m, v] of Object.entries(metaPorMes(meta, c))) total[m] = (total[m] ?? 0) + v;
    }
    expect(Math.round(total["2026-10"]!)).toBe(870_212);
    expect(Math.round(total["2026-11"]!)).toBe(2_575_173);
    expect(Math.round(total["2026-12"]!)).toBe(2_554_615);
  });

  it("só lojas que participam e estão ativas entram; a meta se redistribui entre elas", () => {
    const base = { nome: "x", vendedoras: 1, tipo: "loja", ativo: true, participa: true };
    const lojas = [
      { ...base, bcps: "1", praca: "A" },
      { ...base, bcps: "2", praca: "A", participa: false },
      { ...base, bcps: "3", praca: "B", tipo: "hub" },
      { ...base, bcps: "4", praca: "B", ativo: false },
    ];
    const fat = ["1", "2", "3", "4"].map((bcps) => ({
      bcps,
      mes: "2026-08-01",
      faturamento: 100,
    }));
    const r = simular({
      ciclo: CICLOS_PADRAO[0]!,
      ciclos: CICLOS_PADRAO,
      lojas,
      faturamento: fat,
      estoque: [],
      produtos: [],
      promocoes: [],
      parametros: PARAMETROS_PADRAO,
      semente: 1,
    });
    expect(r.lojas.map((l) => l.bcps).sort()).toEqual(["1", "3"]);
    const metaCiclo = metaDoCiclo(PARAMETROS_PADRAO, CICLOS_PADRAO, 15);
    for (const l of r.lojas) expect(l.meta).toBeCloseTo(metaCiclo / 2, 0);
  });

  it("praça com meta digitada: lojas seguem proporcionais", () => {
    const p = parametrosDasLinhas([
      { chave: "meta_pracas_digitada", valor: { "15": { A: 1000 } } },
    ]);
    const lojas = [
      { bcps: "1", nome: "1", praca: "A", vendedoras: 1 },
      { bcps: "2", nome: "2", praca: "A", vendedoras: 3 },
      { bcps: "3", nome: "3", praca: "B", vendedoras: 1 },
    ];
    const fat = [
      { bcps: "1", mes: "2026-07-01", faturamento: 100 },
      { bcps: "2", mes: "2026-08-01", faturamento: 300 },
      { bcps: "3", mes: "2026-09-01", faturamento: 400 },
    ];
    const m = metasDoCiclo(p, CICLOS_PADRAO, 15, lojas, fat);
    expect(m.lojas.find((l) => l.bcps === "1")!.meta).toBe(250);
    expect(m.lojas.find((l) => l.bcps === "2")!.meta).toBe(750);
    expect(m.pracas.find((x) => x.praca === "B")!.digitada).toBe(false);
  });

  it("parâmetros: ignora chave desconhecida e tipo errado", () => {
    const p = parametrosDasLinhas([
      { chave: "preco_min", valor: "abc" },
      { chave: "xyz", valor: 1 },
      { chave: "itens_max", valor: 5 },
    ]);
    expect(p.preco_min).toBe(180);
    expect(p.itens_max).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Com os dados reais da seed/ (local; pulado se a pasta não existir)

const SEED = join(__dirname, "..", "..", "..", "seed");
const temSeed = existsSync(join(SEED, "lojas.csv"));

describe.skipIf(!temSeed)("motor com a seed/ (ciclo 15)", () => {
  let dados: DadosSeed;
  let r: ResultadoSimulacao;
  let ms = 0;

  beforeAll(async () => {
    const arquivos = readdirSync(SEED)
      .filter((f) => f.endsWith(".csv"))
      .map((f) => new File([readFileSync(join(SEED, f))], f));
    dados = await dadosDaSeed(arquivos);
    const t0 = performance.now();
    r = simular({
      ciclo: CICLOS_PADRAO[0]!,
      ciclos: CICLOS_PADRAO,
      lojas: dados.lojas,
      faturamento: dados.faturamento,
      estoque: dados.estoque,
      produtos: dados.produtos,
      promocoes: dados.promocoes.filter((x) => x.ciclo === 15),
      parametros: PARAMETROS_PADRAO,
      semente: 12345,
    });
    ms = performance.now() - t0;
    console.log(
      `[motor] ${r.resumo.lojas} lojas · ${r.resumo.kits} kits · ${r.resumo.sacolasPlanejadas}/${r.resumo.sacolasMeta} sacolas ` +
        `(possíveis ${r.resumo.sacolasPossiveis}) · reaproveitados ${r.resumo.kitsReaproveitados} · ${Math.round(ms)} ms`,
    );
  }, 120_000);

  it("simula só as lojas que participam (na seed: as 107 lojas, sem HUB/ER)", () => {
    expect(r.lojas).toHaveLength(dados.lojas.filter((l) => l.participa).length);
    expect(r.lojas.every((l) => dados.lojas.find((x) => x.bcps === l.bcps)!.tipo === "loja")).toBe(
      true,
    );
  });

  it("todo kit respeita preço, desconto, itens, herói e custo", () => {
    const p = PARAMETROS_PADRAO;
    const promo = new Map(
      dados.promocoes.filter((x) => x.ciclo === 15).map((x) => [x.sku, x.desconto_pct]),
    );
    for (const k of r.kits) {
      const praca = r.lojas.find((l) => l.kits.some((x) => x.codigo === k.codigo))!.praca;
      const f = faixasDaPraca(p, praca);
      expect(k.preco).toBeGreaterThanOrEqual(f.pMin);
      expect(k.preco).toBeLessThanOrEqual(f.pMax);
      expect(Math.round(k.preco * 100) % 500).toBe(490); // termina em ,90 em degraus de R$ 5
      expect(k.itens.length).toBeGreaterThanOrEqual(p.itens_min);
      expect(k.itens.length).toBeLessThanOrEqual(p.itens_max);
      const herois = k.itens.filter((i) => i.papel === "heroi");
      expect(herois).toHaveLength(1);
      // P1: a faixa de desconto vale só para as surpresas; o % off do kit é o total (de → por)
      const h = herois[0]!.precoItem;
      const s = k.itens.filter((i) => i.papel !== "heroi").reduce((a, i) => a + i.precoItem, 0);
      const ds = 100 * (1 - (k.preco - h) / s);
      expect(ds).toBeGreaterThanOrEqual(f.dMin * 100 - 0.5);
      expect(ds).toBeLessThanOrEqual(f.dMax * 100 + 0.5);
      expect(k.descontoPct).toBeLessThan(ds + 0.1);
      expect(promo.get(herois[0]!.sku) ?? 0).toBeGreaterThan(0); // herói só da promoção
      expect(k.itens.filter((i) => i.papel === "mimo").length).toBeLessThanOrEqual(p.mimo_max);
      expect(herois[0]!.precoItem / k.valorCheio).toBeGreaterThanOrEqual(
        p.heroi_pct_min / 100 - 1e-9,
      );
      // surpresas fora da promoção
      expect(
        k.itens.filter((i) => i.papel !== "heroi" && (promo.get(i.sku) ?? 0) > 0),
      ).toHaveLength(0);
    }
    for (const l of r.lojas)
      for (const k of l.kits)
        if (p.trava_custo)
          expect(r.kits.find((x) => x.codigo === k.codigo)!.preco).toBeGreaterThanOrEqual(k.custo);
  });

  it("estoque da loja é respeitado e cada SKU entra em no máximo 6 kits da loja", () => {
    const est = new Map(dados.estoque.map((x) => [`${x.bcps}|${x.sku}`, x.estoque]));
    for (const l of r.lojas) {
      const usado = new Map<string, number>();
      const kitsPorSku = new Map<string, number>();
      for (const kl of l.kits) {
        const k = r.kits.find((x) => x.codigo === kl.codigo)!;
        for (const i of k.itens) {
          usado.set(i.sku, (usado.get(i.sku) ?? 0) + kl.qtd);
          kitsPorSku.set(i.sku, (kitsPorSku.get(i.sku) ?? 0) + 1);
        }
      }
      for (const [sku, u] of usado) expect(u).toBeLessThanOrEqual(est.get(`${l.bcps}|${sku}`) ?? 0);
      for (const n of kitsPorSku.values())
        expect(n).toBeLessThanOrEqual(PARAMETROS_PADRAO.sku_max_kits_loja);
      expect(l.kits.length).toBeLessThanOrEqual(PARAMETROS_PADRAO.geracao_kits_max_loja);
      expect(l.sacolasPlanejadas).toBeLessThanOrEqual(l.sacolasMeta);
      expect(l.sacolasPlanejadas).toBeLessThanOrEqual(l.sacolasPossiveis);
    }
  });

  it("mesma composição = mesmo código; padrão Unidade não reaproveita kits", () => {
    const porComposicao = new Map<string, Set<string>>();
    for (const k of r.kits)
      porComposicao.set(
        k.composicao,
        new Set([...(porComposicao.get(k.composicao) ?? []), k.codigo]),
      );
    for (const s of porComposicao.values()) expect(s.size).toBe(1);
    expect(r.kits.every((k) => /^C15-\d{4}$/.test(k.codigo))).toBe(true);
    // divisão padrão = Unidade (11/10/2026): cada loja monta o próprio catálogo
    expect(r.resumo.kitsReaproveitados).toBe(0);
  });

  it("mesma semente = mesmo resultado", () => {
    const r2 = simular({
      ciclo: CICLOS_PADRAO[0]!,
      ciclos: CICLOS_PADRAO,
      lojas: dados.lojas,
      faturamento: dados.faturamento,
      estoque: dados.estoque,
      produtos: dados.produtos,
      promocoes: dados.promocoes.filter((x) => x.ciclo === 15),
      parametros: PARAMETROS_PADRAO,
      semente: 12345,
    });
    expect(r2.kits.map((k) => k.composicao)).toEqual(r.kits.map((k) => k.composicao));
  }, 120_000);

  it("roda em tempo razoável", () => {
    expect(ms).toBeLessThan(30_000);
  });
});
