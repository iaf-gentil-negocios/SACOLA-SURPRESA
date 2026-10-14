// @vitest-environment node
// F1b: capacidade, divergências e troca de kits por loja.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { CICLOS_PADRAO, dadosDaSeed, type DadosSeed } from "@/lib/local/seed";

import { alocarSkus, capacidadeConjunta, podeMontar } from "./capacidade";
import { analisarLoja } from "./divergencias";
import { simular, type EntradaSimulacao } from "./gerar";
import {
  analisarBase,
  baseDaSimulacao,
  calcularDisponibilidade,
  estoquePorLojaDe,
  pedidoRegerar,
  trocarKitsDaLoja,
} from "./kits-da-base";
import { PARAMETROS_PADRAO } from "./parametros";

const m = (o: Record<string, number>) => new Map(Object.entries(o));

describe("capacidade", () => {
  it("pode montar N = menor estoque dos itens; capacidade divide os produtos", () => {
    const est = m({ A: 5, B: 3, C: 4 });
    expect(podeMontar(["A", "B"], est)).toBe(3);
    expect(podeMontar(["A", "X"], est)).toBe(0);
    // dois kits dividem B: juntos montam 3, não 3 + 3
    expect(
      capacidadeConjunta(
        [
          ["A", "B"],
          ["B", "C"],
        ],
        est,
      ),
    ).toBe(3);
    expect(alocarSkus([["A"], ["A"]], m({ A: 5 }), Infinity, [1, 10]).qtd).toEqual([1, 4]);
  });
});

describe("níveis de divergência", () => {
  const base = {
    bcps: "L1",
    nome: "Loja",
    praca: "P",
    kits: [
      { codigo: "K1", skus: ["A", "B"], heroiSku: "A" },
      { codigo: "K2", skus: ["C", "D"], heroiSku: "C" },
    ],
    estoqueGeracao: m({ A: 10, B: 10, C: 10, D: 10 }),
    estoqueAnterior: null,
    sacolasMeta: 15,
    heroisPossiveis: ["A", "Z"],
    quedaPct: 30,
    minKits: 3,
  };

  it("🔴 divergente: capacidade cai 30% ou mais e pelo menos 3 kits", () => {
    const a = analisarLoja({ ...base, estoqueHoje: m({ A: 2, B: 10, C: 10, D: 10 }) });
    expect(a.capacidade).toMatchObject({ geracao: 20, hoje: 12 });
    expect(a.nivel).toBe("divergente");
    expect(a.abaixoDaMeta).toBe(true);
    expect(a.produtos.find((p) => p.sku === "A")!.caiu).toBe(true);
    expect(a.produtos.find((p) => p.sku === "B")!.caiu).toBe(false);
    expect(a.heroisNovos).toEqual(["Z"]);
    expect(a.kits).toEqual([
      { codigo: "K1", podeMontar: 2 },
      { codigo: "K2", podeMontar: 10 },
    ]);
  });

  it("🟡 atenção: estoque dos produtos cai 30%, mas a perda de kits é menor que 3", () => {
    // loja pequena: capacidade 4 → 2 (-50%, mas só -2 kits); estoque 16 → 9 (-44%)
    const pequena = {
      ...base,
      estoqueGeracao: m({ A: 2, B: 6, C: 2, D: 6 }),
      estoqueHoje: m({ A: 1, B: 3, C: 1, D: 4 }),
    };
    const a = analisarLoja(pequena);
    expect(a.capacidade.geracao - a.capacidade.hoje).toBeLessThan(3);
    expect(a.nivel).toBe("atencao");
  });

  it("sem queda: ok; com foto do dia anterior, compara também com ela", () => {
    expect(analisarLoja({ ...base, estoqueHoje: base.estoqueGeracao }).nivel).toBe("ok");
    const a = analisarLoja({
      ...base,
      estoqueGeracao: m({ A: 5, B: 5, C: 5, D: 5 }),
      estoqueAnterior: m({ A: 20, B: 20, C: 20, D: 20 }),
      estoqueHoje: m({ A: 5, B: 5, C: 5, D: 5 }),
    });
    expect(a.nivel).toBe("divergente");
    expect(a.motivos.join(" ")).toMatch(/dia anterior/);
  });
});

const SEED = join(__dirname, "..", "..", "..", "seed");
const temSeed = existsSync(SEED) && readdirSync(SEED).some((f) => f.startsWith("lojas"));

describe.skipIf(!temSeed)("troca de kits por loja com a seed/ (ciclo 15)", () => {
  let dados: DadosSeed;
  let entrada: EntradaSimulacao;

  beforeAll(async () => {
    const arquivos = readdirSync(SEED)
      .filter((f) => f.endsWith(".csv"))
      .map((f) => new File([readFileSync(join(SEED, f))], f));
    dados = await dadosDaSeed(arquivos);
    const praca = dados.lojas.find((l) => l.participa)!.praca;
    entrada = {
      ciclo: CICLOS_PADRAO[0]!,
      ciclos: CICLOS_PADRAO,
      lojas: dados.lojas,
      faturamento: dados.faturamento,
      estoque: dados.estoque,
      produtos: dados.produtos,
      promocoes: dados.promocoes.filter((x) => x.ciclo === 15),
      parametros: PARAMETROS_PADRAO,
      semente: 5,
      pracas: [praca],
    };
  }, 120_000);

  it("zera um produto de kit: a loja diverge e a troca mantém os que ainda montam", () => {
    const r = simular(entrada);
    const base = baseDaSimulacao(r, 1);
    const loja = r.lojas.find((l) => l.kits.filter((k) => k.qtd > 0).length >= 3)!;
    const kitsLoja = base.kitLojas.filter((kl) => kl.bcps === loja.bcps);
    const heroi = base.kits.find((k) => k.codigo === kitsLoja[0]!.codigo)!.heroiSku;
    // hoje: o herói do 1º kit acabou na loja
    const hoje: EntradaSimulacao = {
      ...entrada,
      estoque: entrada.estoque.map((x) =>
        x.bcps === loja.bcps && x.sku === heroi ? { ...x, estoque: 0 } : x,
      ),
    };
    const nomes = new Map(dados.lojas.map((l) => [l.bcps, { nome: l.nome, praca: l.praca }]));
    const analise = analisarBase(base, hoje, nomes).find((a) => a.bcps === loja.bcps)!;
    expect(analise.kits.find((k) => k.codigo === kitsLoja[0]!.codigo)!.podeMontar).toBe(0);

    const { resultado, base: depois } = trocarKitsDaLoja(base, hoje, loja.bcps);
    expect(resultado.remover).toContain(kitsLoja[0]!.codigo);
    // os que ainda montam ficam, com o mesmo código
    const ficam = kitsLoja.filter((kl) => !resultado.remover.includes(kl.codigo));
    expect(resultado.manter.map((x) => x.codigo).sort()).toEqual(ficam.map((x) => x.codigo).sort());
    // kits novos não usam o kit indisponível nem o produto zerado
    for (const n of resultado.novos)
      expect(n.detalhes.every((d) => d.sku !== heroi || d.estoque > 0)).toBe(true);

    // a capacidade dos que ficaram não cai: os novos usam só o que sobra
    const estHoje = estoquePorLojaDe(hoje.estoque).get(loja.bcps)!;
    const skusDe = (c: string) => depois.kits.find((k) => k.codigo === c)!.itens.map((i) => i.sku);
    const capFicamAntes = capacidadeConjunta(
      ficam.map((kl) => skusDe(kl.codigo)),
      estHoje,
    );
    const consumoNovos = new Map(estHoje);
    for (const n of resultado.novos)
      for (const s of skusDe(n.codigo)) consumoNovos.set(s, consumoNovos.get(s)! - n.qtd);
    const capFicamDepois = capacidadeConjunta(
      ficam.map((kl) => skusDe(kl.codigo)),
      consumoNovos,
    );
    expect(capFicamDepois).toBe(capFicamAntes);

    // lojas não selecionadas não mudam
    const outras = (b: typeof base) => b.kitLojas.filter((kl) => kl.bcps !== loja.bcps);
    expect(outras(depois)).toEqual(outras(base));
    // códigos novos únicos na base e kit indisponível fora da loja
    const codigos = depois.kits.map((k) => k.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(
      depois.kitLojas.some((kl) => kl.bcps === loja.bcps && kl.codigo === kitsLoja[0]!.codigo),
    ).toBe(false);

    // pedido no formato do SQL e disponibilidade calculável
    const pedido = pedidoRegerar(resultado, "2026-10-11");
    expect(pedido.remover).toEqual(resultado.remover);
    const disp = calcularDisponibilidade(depois, estoquePorLojaDe(hoje.estoque));
    const d = disp.find((x) => x.bcps === loja.bcps)!;
    expect(d.capacidade).toBe(resultado.loja.capacidade);
    expect(d.kits.every((k) => k.disponivel >= 1)).toBe(true);
  }, 120_000);
});
