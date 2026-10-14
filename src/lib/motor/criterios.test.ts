// @vitest-environment node
// Motor do Mix (parte F1a): critérios, divisão e temas personalizados.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { CICLOS_PADRAO, dadosDaSeed, type DadosSeed } from "@/lib/local/seed";

import { chaveDoHeroi, niveisDoAgregado, simular } from "./gerar";
import { PARAMETROS_PADRAO, parametrosDasLinhas, type Parametros } from "./parametros";
import { temaPersonalizado, temasDoMotor } from "./temas";

describe("critérios do agregado", () => {
  it("cobertura alta → VMD alto → VMD médio reproduz a regra antiga (1 a 4)", () => {
    const nivel = niveisDoAgregado(["cobertura_alta", "vmd_alto", "vmd_medio"]);
    for (const custoTerco of [0, 1, 2] as const) {
      expect(nivel({ forca: "Forte", parado: true, custoTerco })).toBe(1);
      expect(nivel({ forca: "Média", parado: true, custoTerco })).toBe(2);
      expect(nivel({ forca: "Forte", parado: false, custoTerco })).toBe(3);
      expect(nivel({ forca: "Média", parado: false, custoTerco })).toBe(4);
    }
    expect(nivel({ forca: "Fraca", parado: true, custoTerco: 0 })).toBe(9);
  });

  it("a ordem manda: o 1º critério vence os seguintes", () => {
    const padrao = niveisDoAgregado(PARAMETROS_PADRAO.criterios_agregado);
    // padrão: … → valor baixo → valor alto → valor médio
    const fortParadoCaro = padrao({ forca: "Forte", parado: true, custoTerco: 2 });
    const fortParadoBarato = padrao({ forca: "Forte", parado: true, custoTerco: 0 });
    const fortParadoMedio = padrao({ forca: "Forte", parado: true, custoTerco: 1 });
    expect(fortParadoBarato).toBe(1);
    expect(fortParadoBarato).toBeLessThan(fortParadoCaro);
    expect(fortParadoCaro).toBeLessThan(fortParadoMedio);
    expect(padrao({ forca: "Média", parado: false, custoTerco: 1 })).toBe(4);

    const custoPrimeiro = niveisDoAgregado([
      "custo_baixo",
      "cobertura_alta",
      "vmd_alto",
      "vmd_medio",
      "custo_medio",
      "custo_alto",
    ]);
    expect(custoPrimeiro({ forca: "Média", parado: false, custoTerco: 0 })).toBeLessThan(
      custoPrimeiro({ forca: "Forte", parado: true, custoTerco: 2 }),
    );
  });
});

describe("critérios do herói", () => {
  const forteBarato = { forca: "Forte" as const, parado: false, precoTerco: 0 as const };
  const mediaCara = { forca: "Média" as const, parado: false, precoTerco: 2 as const };
  it("preço cheio maior primeiro; VMD maior; cobertura maior; a ordem da lista manda", () => {
    // padrão: preço → VMD → cobertura
    const padrao = PARAMETROS_PADRAO.criterios_heroi;
    expect(padrao).toEqual(["preco", "vmd", "cobertura"]);
    expect(chaveDoHeroi(padrao, mediaCara) < chaveDoHeroi(padrao, forteBarato)).toBe(true);
    const vmdPrimeiro = ["vmd", "preco", "cobertura"] as const;
    expect(
      chaveDoHeroi([...vmdPrimeiro], forteBarato) < chaveDoHeroi([...vmdPrimeiro], mediaCara),
    ).toBe(true);
    const parado = { ...forteBarato, forca: "Média" as const, parado: true };
    expect(
      chaveDoHeroi(["cobertura", "vmd", "preco"], parado) <
        chaveDoHeroi(["cobertura", "vmd", "preco"], mediaCara),
    ).toBe(true);
  });
});

describe("parâmetros do Motor do Mix", () => {
  it("listas sempre completas, sem repetição; valores estranhos saem", () => {
    const p = parametrosDasLinhas([
      { chave: "criterios_heroi", valor: ["custo", "preco", "x", "preco"] },
      { chave: "criterios_agregado", valor: ["vmd_baixo", "custo_baixo"] },
      { chave: "mix_divisao", valor: "galaxia" },
    ]);
    expect(p.criterios_heroi).toEqual(["preco", "vmd", "cobertura"]);
    expect(p.criterios_agregado[0]).toBe("custo_baixo");
    expect(p.criterios_agregado).toHaveLength(6);
    expect(p.mix_divisao).toBe("unidade");
  });

  it("antes da divisão: 'reaproveitar kits da praça' desligado vira Unidade", () => {
    expect(
      parametrosDasLinhas([{ chave: "reaproveitar_kits_praca", valor: false }]).mix_divisao,
    ).toBe("unidade");
    expect(parametrosDasLinhas([]).mix_divisao).toBe("unidade");
    expect(parametrosDasLinhas([{ chave: "mix_divisao", valor: "praca" }]).mix_divisao).toBe(
      "praca",
    );
  });

  it("temas personalizados: nome único, 1 a 4 categorias", () => {
    const p = parametrosDasLinhas([
      {
        chave: "temas_personalizados",
        valor: [
          { nome: "Corpo", categorias: ["a", "b", "c", "d", "e"] },
          { nome: "corpo", categorias: ["x"] },
          { nome: "Vazio", categorias: [] },
        ],
      },
    ]);
    expect(p.temas_personalizados).toEqual([{ nome: "Corpo", categorias: ["A", "B", "C", "D"] }]);
  });
});

describe("tema personalizado", () => {
  const t = temaPersonalizado({ nome: "Corpo", categorias: ["CABELOS", "SOLAR"] });
  const item = (categoria: string, nicho: "F" | "M" | "I" | "U") => ({
    categoria,
    nicho,
    marca: "X",
  });
  it("mesma regra de Banho e Rosto", () => {
    expect(t.chave).toBe("Corpo");
    expect(t.heroi(item("CABELOS", "F"))).toBe(true);
    expect(t.heroi(item("CABELOS", "I"))).toBe(false); // Infantil fora do herói
    expect(t.heroi(item("MAQUIAGEM", "F"))).toBe(false);
    const h = item("CABELOS", "F");
    expect(t.agrega(item("SOLAR", "U"), h)).toBe(true);
    expect(t.agrega(item("SOLAR", "F"), h)).toBe(true);
    expect(t.agrega(item("SOLAR", "M"), h)).toBe(false);
  });
  it("só entra no motor se estiver ligado (pelo nome)", () => {
    const base = {
      temas: ["ela"],
      temas_personalizados: [{ nome: "Corpo", categorias: ["SOLAR"] }],
    };
    expect(temasDoMotor(base).map((x) => x.chave)).toEqual(["ela"]);
    expect(temasDoMotor({ ...base, temas: ["ela", "Corpo"] }).map((x) => x.chave)).toEqual([
      "ela",
      "Corpo",
    ]);
  });
});

const SEED = join(__dirname, "..", "..", "..", "seed");
const temSeed = existsSync(SEED) && readdirSync(SEED).some((f) => f.startsWith("lojas"));

describe.skipIf(!temSeed)("divisão e temas com a seed/ (ciclo 15)", () => {
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
      semente: 7,
    });

  beforeAll(async () => {
    const arquivos = readdirSync(SEED)
      .filter((f) => f.endsWith(".csv"))
      .map((f) => new File([readFileSync(join(SEED, f))], f));
    dados = await dadosDaSeed(arquivos);
  }, 120_000);

  it("Unidade não reaproveita; Regional reaproveita só dentro do mesmo GRVO", () => {
    expect(rodar({ mix_divisao: "unidade" }).resumo.kitsReaproveitados).toBe(0);
    // regional fictícia: duas regiões pela primeira letra da praça
    const regional = (praca: string) => (praca < "N" ? "R1" : "R2");
    dados = { ...dados, lojas: dados.lojas.map((l) => ({ ...l, regional: regional(l.praca) })) };
    const r = rodar({ mix_divisao: "regional" });
    expect(r.resumo.kitsReaproveitados).toBeGreaterThan(0);
    // todo kit reaproveitado tem a origem (gerado na hora, mesma composição) na mesma regional;
    // a mesma composição pode surgir sozinha em outra regional (coincidência), e isso não é reaproveitar
    const origens = new Map<string, Set<string>>();
    for (const l of r.lojas)
      for (const k of l.kits.filter((x) => !x.reaproveitado))
        origens.set(k.codigo, (origens.get(k.codigo) ?? new Set()).add(regional(l.praca)));
    for (const l of r.lojas)
      for (const k of l.kits.filter((x) => x.reaproveitado))
        expect(origens.get(k.codigo)?.has(regional(l.praca))).toBe(true);
  }, 120_000);

  it("tema personalizado ligado sozinho gera kits com o nome dele", () => {
    const r = rodar({
      temas: ["Meu banho"],
      temas_personalizados: [
        {
          nome: "Meu banho",
          categorias: ["PERFUMARIA", "SABONETE CORPO", "CUIDADOS COM A PELE", "DESODORANTES"],
        },
      ],
    });
    expect(r.kits.length).toBeGreaterThan(0);
    expect(r.kits.every((k) => k.tema === "Meu banho")).toBe(true);
  }, 120_000);
});
