// @vitest-environment node
// Tela do Motor do Mix (11/10/2026): liga/desliga, promoção configurável e heróis possíveis por tema.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { CICLOS_PADRAO, dadosDaSeed, type DadosSeed } from "@/lib/local/seed";

import { chaveDoHeroi, ligados, niveisDoAgregado, simular } from "./gerar";
import { contagemPorCategoria, heroisPorTema, type ProdutoCatalogo } from "./herois-possiveis";
import { PARAMETROS_PADRAO, parametrosDasLinhas, type Parametros } from "./parametros";

describe("parâmetros da tela", () => {
  it("padrão: promoção obrigatória no herói e excluída nas surpresas; nada desligado", () => {
    const p = parametrosDasLinhas([]);
    expect(p.promo_heroi).toBe("obrigatoria");
    expect(p.promo_surpresa).toBe("excluir");
    expect(p.criterios_heroi_desligados).toEqual([]);
    expect(p.criterios_agregado_desligados).toEqual([]);
  });

  it("quem salvou antes: promoção nas surpresas desligada vira ignorar; ligada vira excluir", () => {
    expect(
      parametrosDasLinhas([{ chave: "surpresa_excluir_promo", valor: false }]).promo_surpresa,
    ).toBe("ignorar");
    expect(
      parametrosDasLinhas([{ chave: "surpresa_excluir_promo", valor: true }]).promo_surpresa,
    ).toBe("excluir");
    // o valor novo, se salvo, vale
    expect(
      parametrosDasLinhas([
        { chave: "surpresa_excluir_promo", valor: false },
        { chave: "promo_surpresa", valor: "preferir" },
      ]).promo_surpresa,
    ).toBe("preferir");
  });

  it("valores estranhos voltam ao padrão; desligados só com critérios conhecidos", () => {
    const p = parametrosDasLinhas([
      { chave: "promo_heroi", valor: "talvez" },
      { chave: "promo_surpresa", valor: "evitar" },
      { chave: "criterios_heroi_desligados", valor: ["vmd", "custo"] },
    ]);
    expect(p.promo_heroi).toBe("obrigatoria");
    expect(p.promo_surpresa).toBe("excluir");
    expect(p.criterios_heroi_desligados).toEqual(["vmd"]);
    expect(ligados(p.criterios_heroi, p.criterios_heroi_desligados)).toEqual([
      "preco",
      "cobertura",
    ]);
  });
});

describe("liga/desliga e promoção como 1º critério", () => {
  it("critério desligado não influencia; tudo desligado = todos empatados", () => {
    const semValor = niveisDoAgregado(["cobertura_alta", "vmd_alto", "vmd_medio"]);
    const tudoLigado = niveisDoAgregado(PARAMETROS_PADRAO.criterios_agregado);
    // sem os critérios de valor, o custo não muda o nível
    expect(semValor({ forca: "Forte", parado: true, custoTerco: 2 })).toBe(
      semValor({ forca: "Forte", parado: true, custoTerco: 0 }),
    );
    expect(tudoLigado({ forca: "Forte", parado: true, custoTerco: 2 })).not.toBe(
      tudoLigado({ forca: "Forte", parado: true, custoTerco: 0 }),
    );
    const nenhum = niveisDoAgregado([]);
    expect(nenhum({ forca: "Forte", parado: true, custoTerco: 0 })).toBe(
      nenhum({ forca: "Média", parado: false, custoTerco: 2 }),
    );
    expect(chaveDoHeroi([], { forca: "Forte", parado: true, precoTerco: 2 })).toBe("");
  });

  it("preferir promoção: vem antes de todos os outros critérios", () => {
    const n = niveisDoAgregado(PARAMETROS_PADRAO.criterios_agregado, true);
    expect(n({ forca: "Média", parado: false, custoTerco: 1, promo: true })).toBeLessThan(
      n({ forca: "Forte", parado: true, custoTerco: 0, promo: false }),
    );
    const h = PARAMETROS_PADRAO.criterios_heroi;
    const promoFraco = {
      forca: "Média" as const,
      parado: false,
      precoTerco: 0 as const,
      promo: true,
    };
    const forteSemPromo = {
      forca: "Forte" as const,
      parado: true,
      precoTerco: 2 as const,
      promo: false,
    };
    expect(chaveDoHeroi(h, promoFraco, true) < chaveDoHeroi(h, forteSemPromo, true)).toBe(true);
    expect(chaveDoHeroi(h, promoFraco, false) > chaveDoHeroi(h, forteSemPromo, false)).toBe(true);
  });
});

describe("heróis possíveis (teto, sem estoque)", () => {
  const prod = (sku: string, categoria: string, extra: Partial<ProdutoCatalogo> = {}) => ({
    sku,
    categoria,
    marca: "X",
    nicho: "F" as const,
    regular: true,
    fornecedor: "BOT",
    preco_dsku: 150,
    ...extra,
  });
  const produtos: ProdutoCatalogo[] = [
    prod("1", "CABELOS"),
    prod("2", "CABELOS", { preco_dsku: 50 }),
    prod("3", "PERFUMARIA"),
    prod("4", "PERFUMARIA", { regular: false }),
    prod("5", "PERFUMARIA", { nicho: "I" }),
    prod("6", "PERFUMARIA", { fornecedor: "OUTRO" }),
  ];

  it("por categoria: produtos do pool; herói = regular, preço mínimo, fora Infantil, na promoção", () => {
    const comPromo = contagemPorCategoria(produtos, new Set(["3"]), PARAMETROS_PADRAO);
    expect(comPromo).toEqual([
      { categoria: "CABELOS", produtos: 2, herois: 0 },
      { categoria: "PERFUMARIA", produtos: 3, herois: 1 },
    ]);
    // ciclo sem base de promoção: não filtra pela promoção (herói sai dos de VMD alto na simulação)
    const semPromo = contagemPorCategoria(produtos, new Set(), PARAMETROS_PADRAO);
    expect(semPromo.find((c) => c.categoria === "CABELOS")!.herois).toBe(1);
    // promoção "ignorar": também não filtra
    const ignorar = { ...PARAMETROS_PADRAO, promo_heroi: "ignorar" as const };
    expect(contagemPorCategoria(produtos, new Set(["3"]), ignorar)[0]!.herois).toBe(1);
  });

  it("por tema: zero herói possível (ex.: cabelos sem promoção) para o aviso", () => {
    const p: Parametros = {
      ...PARAMETROS_PADRAO,
      temas_personalizados: [{ nome: "Meu cabelo", categorias: ["CABELOS"] }],
    };
    const t = heroisPorTema(produtos, new Set(["3"]), p);
    expect(t.get("cabelo")).toBe(0);
    expect(t.get("Meu cabelo")).toBe(0);
    expect(t.get("banho")).toBe(1);
  });
});

const SEED = join(__dirname, "..", "..", "..", "seed");
const temSeed = existsSync(SEED) && readdirSync(SEED).some((f) => f.startsWith("lojas"));

describe.skipIf(!temSeed)("liga/desliga e promoção com a seed/ (ciclo 15)", () => {
  let dados: DadosSeed;
  const rodar = (extra: Partial<Parametros>) =>
    simular({
      ciclo: CICLOS_PADRAO[0]!,
      ciclos: CICLOS_PADRAO,
      lojas: dados.lojas,
      faturamento: dados.faturamento,
      estoque: dados.estoque,
      produtos: dados.produtos,
      promocoes: dados.promocoes.filter((x) => x.ciclo === 15),
      parametros: { ...PARAMETROS_PADRAO, ...extra },
      semente: 3,
    });

  beforeAll(async () => {
    const arquivos = readdirSync(SEED)
      .filter((f) => f.endsWith(".csv"))
      .map((f) => new File([readFileSync(join(SEED, f))], f));
    dados = await dadosDaSeed(arquivos);
  }, 120_000);

  it("tudo em Não usar ainda gera kits", () => {
    const r = rodar({
      criterios_heroi_desligados: [...PARAMETROS_PADRAO.criterios_heroi],
      criterios_agregado_desligados: [...PARAMETROS_PADRAO.criterios_agregado],
    });
    expect(r.kits.length).toBeGreaterThan(0);
  }, 120_000);

  it("promoção ignorar no herói deixa entrar herói fora da promoção", () => {
    const promo = new Set(
      dados.promocoes.filter((x) => x.ciclo === 15 && x.desconto_pct > 0).map((x) => x.sku),
    );
    const heroisForaDaPromo = (r: ReturnType<typeof rodar>) =>
      r.kits.filter((k) => k.itens.some((i) => i.papel === "heroi" && !promo.has(i.sku))).length;
    expect(heroisForaDaPromo(rodar({}))).toBe(0);
    expect(heroisForaDaPromo(rodar({ promo_heroi: "ignorar" }))).toBeGreaterThan(0);
  }, 120_000);
});
