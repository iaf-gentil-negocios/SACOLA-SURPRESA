// Motor da Sacola Surpresa: mix POR LOJA, só com o estoque da própria loja (ESPECIFICACAO §7 e §12).
// Puro (sem banco): recebe os dados já carregados e devolve a simulação.
import type { Nicho } from "@/lib/bases/nicho";
import { entraNoPlano } from "@/lib/lojas/regras";

import { alocarSkus, capacidadeConjunta, podeMontar } from "./capacidade";
import { metasDoCiclo, type CicloMotor, type FaturamentoMes, type LojaMeta } from "./metas";
import {
  faixasDaPraca,
  type CriterioAgregado,
  type CriterioHeroi,
  type Parametros,
} from "./parametros";
import { NOME_TEMA, nichoCorrigido, temasDoMotor, type ItemTema, type Tema } from "./temas";

// ---------------------------------------------------------------------------
// Entrada e saída

export interface ProdutoMotor {
  sku: string;
  descricao: string;
  marca: string | null;
  categoria: string | null;
  nicho: Nicho | null;
  regular: boolean;
  fornecedor: string | null;
}

export interface EstoqueMotor {
  bcps: string;
  sku: string;
  estoque: number;
  vmd: number;
  preco: number;
  custo: number | null;
}

export interface PromoMotor {
  sku: string;
  desconto_pct: number;
}

export interface LojaMotor extends LojaMeta {
  tipo: string;
  ativo: boolean;
  /** Só lojas que participam (e estão ativas) recebem kits e entram na divisão da meta. */
  participa: boolean;
  /** Regional = matrícula do GRVO da loja (dGerentes); usado na Divisão por Regional. */
  regional?: string | null;
  /** Nome completo da dCentros (0002i), só para a busca; a tela mostra o abreviado (nome). */
  nomeCompleto?: string | null;
  /** Cidade e UF (dCentros, 0002f; correção manual no mapa), para o mapa do Nordeste. */
  cidade?: string | null;
  uf?: string | null;
}

export interface EntradaSimulacao {
  ciclo: CicloMotor;
  ciclos: CicloMotor[];
  lojas: LojaMotor[];
  faturamento: FaturamentoMes[];
  estoque: EstoqueMotor[];
  produtos: ProdutoMotor[];
  promocoes: PromoMotor[];
  parametros: Parametros;
  semente: number;
  /** Simular só estas praças (null = todas). As metas usam sempre todas as lojas. */
  pracas?: string[] | null;
}

export type Forca = "Forte" | "Média" | "Fraca";
export type Papel = "heroi" | "surpresa" | "mimo";

export interface ItemKit {
  ordem: number;
  papel: Papel;
  sku: string;
  descricao: string;
  /** Valor do item na sacola (herói pelo preço promocional, se o parâmetro estiver ligado). */
  precoItem: number;
  promoPct: number | null;
}

export interface KitSimulado {
  codigo: string;
  tema: string;
  nicho: Nicho;
  preco: number;
  valorCheio: number;
  descontoPct: number;
  heroiSku: string;
  itens: ItemKit[];
  composicao: string;
  /** Lojas que usam o kit. */
  lojas: number;
}

export interface DetalheItemLoja {
  sku: string;
  forca: Forca;
  cobertura: number | null; // null = infinita
  estoque: number;
  vmd: number;
  custo: number | null;
}

export interface KitNaLoja {
  codigo: string;
  qtd: number;
  custo: number;
  margem: number;
  valorCheio: number;
  descontoPct: number;
  reaproveitado: boolean;
  detalhes: DetalheItemLoja[];
}

export interface LojaSimulada {
  bcps: string;
  nome: string;
  praca: string;
  vendedoras: number;
  meta: number;
  metaSemana: number;
  metaVendSemana: number | null;
  metasMes: Record<string, number>;
  sacolasMeta: number;
  sacolasPossiveis: number;
  sacolasPlanejadas: number;
  receita: number;
  custo: number;
  poolTamanho: number;
  kits: KitNaLoja[];
  avisos: string[];
}

export interface ResultadoSimulacao {
  ciclo: number;
  semente: number;
  geradaEm: string;
  pracas: string[] | null;
  parametros: Parametros;
  metaCiclo: number;
  metasPracas: { praca: string; meta: number; metaSugerida: number; digitada: boolean }[];
  lojas: LojaSimulada[];
  kits: KitSimulado[];
  resumo: {
    lojas: number;
    kits: number;
    meta: number;
    sacolasMeta: number;
    sacolasPossiveis: number;
    sacolasPlanejadas: number;
    receita: number;
    custo: number;
    margem: number;
    kitsReaproveitados: number;
  };
}

// ---------------------------------------------------------------------------
// Sorteio reproduzível

export function sorteador(semente: number) {
  let t = semente >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashTexto(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Pool da loja

interface ItemPool extends ItemTema {
  sku: string;
  descricao: string;
  regular: boolean;
  preco: number;
  custo: number | null;
  estoque: number;
  vmd: number;
  cobertura: number; // Infinity quando VMD = 0
  parado: boolean;
  forca: Forca;
  /** Custo por posição na loja, em terços: 0 baixo · 1 médio · 2 alto (sem custo = médio). */
  custoTerco: 0 | 1 | 2;
  /** Preço cheio por posição na loja, em terços: 0 baixo · 1 médio · 2 alto. */
  precoTerco: 0 | 1 | 2;
  /** Prioridade como surpresa (menor = melhor), pelos critérios do agregado; 9 = Fraca (só mimo). */
  nivel: number;
  promoPct: number;
}

// ---------------------------------------------------------------------------
// Critérios (Motor do Mix): ordem de prioridade, comparada critério a critério

interface Classes {
  forca: Forca;
  parado: boolean;
  custoTerco: 0 | 1 | 2;
  /** Em promoção no ciclo (só conta quando a promoção é "preferir"). */
  promo?: boolean;
}

const ATENDE_AGREGADO: Record<CriterioAgregado, (x: Classes) => boolean> = {
  cobertura_alta: (x) => x.parado,
  vmd_alto: (x) => x.forca === "Forte",
  vmd_medio: (x) => x.forca === "Média",
  custo_alto: (x) => x.custoTerco === 2,
  custo_medio: (x) => x.custoTerco === 1,
  custo_baixo: (x) => x.custoTerco === 0,
};

/**
 * Nível de cada combinação (força, parado, terço de custo) pelos critérios do agregado:
 * quem atende ao 1º critério vem antes; no empate, o 2º; e assim por diante.
 * O resultado vai para a faixa 1–4 (a mesma de antes), para a preferência pela marca do herói
 * e o sorteio de desempate continuarem com o mesmo peso. Sem os critérios de custo, dá
 * exatamente o de antes: Forte parado 1 · Média parada 2 · Forte 3 · Média 4.
 */
export function niveisDoAgregado(criterios: CriterioAgregado[], preferirPromo = false) {
  const combos: Classes[] = [];
  for (const forca of ["Forte", "Média"] as Forca[])
    for (const parado of [true, false])
      for (const custoTerco of [0, 1, 2] as const)
        for (const promo of preferirPromo ? [true, false] : [false])
          combos.push({ forca, parado, custoTerco, promo });
  // promoção "preferir" = 1º critério (antes dos da lista)
  const chave = (x: Classes) =>
    (preferirPromo ? (x.promo ? "0" : "1") : "") +
    criterios.map((k) => (ATENDE_AGREGADO[k](x) ? "0" : "1")).join("");
  const distintas = [...new Set(combos.map(chave))].sort();
  const passo = distintas.length > 1 ? 3 / (distintas.length - 1) : 0;
  return (x: Classes) => (x.forca === "Fraca" ? 9 : 1 + distintas.indexOf(chave(x)) * passo);
}

/** Ordem do herói (menor = melhor): VMD maior, cobertura maior, preço cheio maior — na ordem escolhida. */
export function chaveDoHeroi(
  criterios: CriterioHeroi[],
  x: Pick<Classes, "forca" | "parado"> & { precoTerco: 0 | 1 | 2; promo?: boolean },
  preferirPromo = false,
): string {
  const ordemForca = { Forte: 0, Média: 1, Fraca: 2 };
  return (
    (preferirPromo ? (x.promo ? "0" : "1") : "") +
    criterios
      .map((k) =>
        k === "vmd"
          ? ordemForca[x.forca]
          : k === "cobertura"
            ? x.parado
              ? 0
              : 1
            : 2 - x.precoTerco,
      )
      .join("")
  );
}

/** Critérios ligados, na ordem da lista ("Não usar" = fora da comparação). */
export const ligados = <T extends string>(ordem: T[], desligados: T[]) =>
  ordem.filter((c) => !desligados.includes(c));

function montarPool(
  estoqueLoja: EstoqueMotor[],
  produtos: Map<string, ProdutoMotor>,
  promo: Map<string, number>,
  p: Parametros,
): ItemPool[] {
  const fornecedores = new Set(p.pool_fornecedores);
  const base = estoqueLoja
    .filter((e) => e.preco > 0 && e.estoque >= p.pool_estoque_min)
    .flatMap((e) => {
      const prod = produtos.get(e.sku);
      if (!prod || !prod.fornecedor || !fornecedores.has(prod.fornecedor)) return [];
      return [{ e, prod }];
    })
    // força: VMD da loja, maior primeiro (empate pelo SKU, para ser reproduzível)
    .sort((a, b) => b.e.vmd - a.e.vmd || a.e.sku.localeCompare(b.e.sku));

  const n = base.length;
  const nForte = Math.round((n * p.forca_pct_forte) / 100);
  const nMedia = Math.round((n * p.forca_pct_media) / 100);
  // custo em terços pela posição na loja (só itens com custo; sem custo = médio)
  const comCusto = base
    .filter(({ e }) => e.custo !== null)
    .sort((a, b) => a.e.custo! - b.e.custo! || a.e.sku.localeCompare(b.e.sku));
  const tercoDe = new Map<string, 0 | 1 | 2>(
    comCusto.map(({ e }, i) => [
      e.sku,
      Math.min(2, Math.floor((i * 3) / comCusto.length)) as 0 | 1 | 2,
    ]),
  );
  const nivelDe = niveisDoAgregado(
    ligados(p.criterios_agregado, p.criterios_agregado_desligados),
    p.promo_surpresa === "preferir",
  );
  // preço cheio em terços pela posição na loja (critério do herói)
  const porPreco = [...base].sort(
    (a, b) => a.e.preco - b.e.preco || a.e.sku.localeCompare(b.e.sku),
  );
  const precoTercoDe = new Map<string, 0 | 1 | 2>(
    porPreco.map(({ e }, i) => [
      e.sku,
      Math.min(2, Math.floor((i * 3) / porPreco.length)) as 0 | 1 | 2,
    ]),
  );

  return base.map(({ e, prod }, i) => {
    let forca: Forca = i < nForte ? "Forte" : i < nForte + nMedia ? "Média" : "Fraca";
    if (forca === "Forte" && !prod.regular) forca = "Média";
    if (p.forca_vmd_zero_fraca && e.vmd <= 0) forca = "Fraca";
    const cobertura = e.vmd > 0 ? e.estoque / e.vmd : Infinity;
    const parado = cobertura >= p.parado_cobertura_dias;
    const custoTerco = tercoDe.get(e.sku) ?? 1;
    const nivel = nivelDe({ forca, parado, custoTerco, promo: (promo.get(e.sku) ?? 0) > 0 });
    const marca = (prod.marca ?? "").toUpperCase().trim();
    return {
      sku: e.sku,
      descricao: prod.descricao,
      marca,
      categoria: (prod.categoria ?? "SEM CATEGORIA").toUpperCase(),
      nicho: nichoCorrigido(prod.nicho, marca),
      regular: prod.regular,
      preco: e.preco,
      custo: e.custo,
      estoque: e.estoque,
      vmd: e.vmd,
      cobertura,
      parado,
      forca,
      custoTerco,
      precoTerco: precoTercoDe.get(e.sku) ?? 1,
      nivel,
      promoPct: promo.get(e.sku) ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Kit dentro da loja

interface KitInterno {
  tema: string;
  heroi: ItemPool;
  itens: { item: ItemPool; papel: Papel; valor: number }[];
  valorCheio: number;
  preco: number;
  desconto: number;
  custo: number;
  composicao: string;
  reaproveitado: boolean;
  qtd: number;
}

const composicaoDe = (skus: string[], preco: number) =>
  `${[...skus].sort().join("-")}|${preco.toFixed(2)}`;

/** Preço final mais próximo de `v` nos degraus da faixa (ex.: 184,90 / 189,90 / …). */
export function precoNaFaixa(
  v: number,
  pMin: number,
  pMax: number,
  degrau: number,
  terminacao: number,
) {
  const recuo = Math.round((1 - terminacao) * 100) / 100;
  const candidatos: number[] = [];
  for (let x = Math.ceil((pMin + recuo) / degrau) * degrau; x <= pMax + recuo + 1e-9; x += degrau) {
    candidatos.push(Math.round((x - recuo) * 100) / 100);
  }
  if (!candidatos.length) candidatos.push(Math.round((Math.round(pMax) - recuo) * 100) / 100);
  return candidatos.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), candidatos[0]!);
}

interface ContextoLoja {
  p: Parametros;
  faixa: ReturnType<typeof faixasDaPraca>;
  pool: ItemPool[];
  porSku: Map<string, ItemPool>;
  promoOk: boolean;
  usos: Map<string, number>;
  heroisUsados: Map<string, number>;
  vistos: Set<string>;
  rand: () => number;
  temasPorChave: Map<string, Tema>;
  /** Soma dos preços cheios das (itens mínimo − 1) surpresas mais baratas da loja (cabe herói?). */
  menorSurpresas: number;
}

/** Herói: sempre pelo preço promocional (sem promoção, pelo preço cheio); nunca recebe o desconto do kit. */
function valorDoHeroi(c: ContextoLoja, h: ItemPool) {
  return c.promoOk && h.promoPct > 0 ? h.preco * (1 - h.promoPct / 100) : h.preco;
}

/**
 * Preço do kit (P1, 13/10/2026). O desconto do kit vale só para as surpresas (e o mimo):
 * - "de" (valor cheio) = herói pelo preço promocional + surpresas pelo preço cheio;
 * - "por" (preço final) = herói pelo preço promocional + surpresas com o desconto do kit,
 *   com degrau e terminação aplicados no total do kit (não item a item).
 * `descontoSurpresas` = 1 − (por − herói) ÷ surpresas; é ele que fica na faixa do Motor (mín./máx./alvo).
 */
export function precoDoKit(
  heroi: number,
  surpresas: number,
  faixa: { pMin: number; pMax: number; dMin: number; dMax: number; dAlvo: number },
  degrau: number,
  terminacao: number,
  precoFixo: number | null = null,
): { preco: number; valorCheio: number; descontoSurpresas: number; desconto: number } | null {
  if (surpresas <= 0) return null;
  const dentro = (d: number) => d >= faixa.dMin - 0.002 && d <= faixa.dMax + 0.002;
  const descontoDe = (preco: number) => 1 - (preco - heroi) / surpresas;
  const alvo = (d: number) =>
    precoNaFaixa(heroi + surpresas * (1 - d), faixa.pMin, faixa.pMax, degrau, terminacao);
  let preco = precoFixo ?? alvo(faixa.dAlvo);
  let ds = descontoDe(preco);
  if (!dentro(ds) && precoFixo === null) {
    preco = alvo(ds < faixa.dMin ? faixa.dMin : faixa.dMax);
    ds = descontoDe(preco);
  }
  if (!dentro(ds) || preco < faixa.pMin - 1e-9 || preco > faixa.pMax + 1e-9) return null;
  const valorCheio = heroi + surpresas;
  return { preco, valorCheio, descontoSurpresas: ds, desconto: 1 - preco / valorCheio };
}

/** Soma dos `n` menores preços cheios do pool (as surpresas mais baratas possíveis). */
function menorSurpresas(pool: { preco: number }[], n: number) {
  if (n <= 0) return 0;
  return [...pool.map((x) => x.preco)]
    .sort((a, b) => a - b)
    .slice(0, n)
    .reduce((s, x) => s + x, 0);
}

/**
 * O herói ainda deixa espaço para as surpresas mínimas? (correção de 13/10/2026) Com o P1 o herói
 * entra inteiro no preço final; um herói de preço promocional perto do preço máximo não fecha
 * nenhuma sacola, e como só conta como "usado" quando o kit fecha, ele era sorteado de novo a cada
 * tentativa e a loja ficava com poucos kits.
 */
export function heroiCabeNaFaixa(
  heroi: number,
  faixa: { pMax: number; dMax: number },
  menorSurpresas: number,
) {
  if (heroi >= faixa.pMax) return false;
  return (faixa.pMax - heroi) / (1 - faixa.dMax) + 1e-9 >= menorSurpresas;
}

/** Faixa do valor cheio da sacola com este herói: as surpresas é que levam o desconto. */
function limitesDoCheio(faixa: ContextoLoja["faixa"], heroi: number) {
  return {
    min: heroi + Math.max(0, faixa.pMin - heroi) / (1 - faixa.dMin),
    max: heroi + Math.max(0, faixa.pMax - heroi) / (1 - faixa.dMax),
    alvo: heroi + Math.max(0, faixa.pMedio - heroi) / (1 - faixa.dAlvo),
  };
}

/** Valida a composição na loja (preço, desconto, herói, custo) e devolve o kit, ou null. */
function fecharKit(
  c: ContextoLoja,
  tema: Tema,
  heroi: ItemPool,
  itens: { item: ItemPool; papel: Papel }[],
  precoFixo: number | null,
  reaproveitado: boolean,
): KitInterno | null {
  const { p, faixa } = c;
  const comValor = itens.map((x) => ({
    ...x,
    valor: x.papel === "heroi" ? valorDoHeroi(c, x.item) : x.item.preco,
  }));
  const valorHeroi = valorDoHeroi(c, heroi);
  const soma = comValor.reduce((s, x) => s + x.valor, 0);
  const lim = limitesDoCheio(faixa, valorHeroi);
  if (itens.length < p.itens_min || itens.length > p.itens_max) return null;
  if (soma < lim.min - 1e-9 || soma > lim.max + 1e-9) return null;
  if (valorHeroi / soma < p.heroi_pct_min / 100) return null;
  if (tema.linha && itens.filter((x) => x.item.marca === heroi.marca).length < 3) return null;

  const pr = precoDoKit(
    valorHeroi,
    soma - valorHeroi,
    faixa,
    p.preco_degrau,
    p.preco_terminacao,
    precoFixo,
  );
  if (!pr) return null;
  const { preco, desconto: d } = pr;

  const custo = itens.reduce((s, x) => s + (x.item.custo ?? 0), 0);
  if (p.trava_custo && preco < custo) return null;

  const composicao = composicaoDe(
    itens.map((x) => x.item.sku),
    preco,
  );
  if (c.vistos.has(composicao)) return null;

  return {
    tema: tema.chave,
    heroi,
    itens: comValor,
    valorCheio: soma,
    preco,
    desconto: d,
    custo,
    composicao,
    reaproveitado,
    qtd: 0,
  };
}

function registrar(c: ContextoLoja, k: KitInterno) {
  c.vistos.add(k.composicao);
  for (const x of k.itens) c.usos.set(x.item.sku, (c.usos.get(x.item.sku) ?? 0) + 1);
  c.heroisUsados.set(k.heroi.sku, (c.heroisUsados.get(k.heroi.sku) ?? 0) + 1);
}

const livre = (c: ContextoLoja, x: ItemPool) => (c.usos.get(x.sku) ?? 0) < c.p.sku_max_kits_loja;

/** Tenta montar um kit novo do tema (como `tryMix` da referência). */
function tentarKit(c: ContextoLoja, tema: Tema, tentativa: number): KitInterno | null {
  const { p, faixa } = c;
  const herois = c.pool.filter(
    (x) =>
      tema.heroi(x) &&
      x.regular &&
      x.preco >= p.heroi_preco_min &&
      x.estoque >= p.heroi_estoque_min &&
      heroiCabeNaFaixa(valorDoHeroi(c, x), faixa, c.menorSurpresas) &&
      // promoção obrigatória: só promoção; ciclo sem base de promoção → herói dos de VMD alto
      (p.promo_heroi !== "obrigatoria" || (c.promoOk ? x.promoPct > 0 : x.forca === "Forte")) &&
      livre(c, x) &&
      (c.heroisUsados.get(x.sku) ?? 0) < 1 + Math.floor(tentativa / 8),
  );
  if (!herois.length) return null;
  // critérios do herói: só os mais bem colocados concorrem; entre eles, sorteio (variedade)
  const criterios = ligados(p.criterios_heroi, p.criterios_heroi_desligados);
  const preferir = p.promo_heroi === "preferir" && c.promoOk;
  const chaves = herois.map((x) =>
    chaveDoHeroi(criterios, { ...x, promo: x.promoPct > 0 }, preferir),
  );
  const melhor = chaves.reduce((a, b) => (b < a ? b : a));
  const topo = herois.filter((_, i) => chaves[i] === melhor);
  const heroi = topo[Math.floor(c.rand() * topo.length)]!;
  let soma = valorDoHeroi(c, heroi);
  const { min: cheioMin, max: cheioMax, alvo: cheioAlvo } = limitesDoCheio(faixa, soma);

  const itens: { item: ItemPool; papel: Papel }[] = [{ item: heroi, papel: "heroi" }];
  const porCategoria = new Map([[heroi.categoria, 1]]);
  const usados = new Set([heroi.sku]);
  const pode = (x: ItemPool) =>
    !usados.has(x.sku) &&
    livre(c, x) &&
    tema.agrega(x, heroi) &&
    (porCategoria.get(x.categoria) ?? 0) < p.categoria_max &&
    !(p.promo_surpresa === "excluir" && c.promoOk && x.promoPct > 0);

  const candidatos = c.pool
    .filter((x) => x.nivel < 9 && pode(x))
    .map((x) => ({
      x,
      r: x.nivel + (x.marca && x.marca === heroi.marca ? -1.2 : 0) + c.rand() * 0.8,
    }))
    .sort((a, b) => a.r - b.r)
    .map((o) => o.x);

  for (const x of candidatos) {
    if (itens.length >= p.itens_max) break;
    if (soma >= cheioAlvo * 0.95 && itens.length >= p.itens_min) break;
    if (!pode(x) || soma + x.preco > cheioMax) continue;
    itens.push({ item: x, papel: "surpresa" });
    soma += x.preco;
    porCategoria.set(x.categoria, (porCategoria.get(x.categoria) ?? 0) + 1);
    usados.add(x.sku);
  }

  // mimo: no máximo `mimo_max` Fraca, só para completar o valor cheio
  let mimos = 0;
  while (soma < cheioMin && itens.length < p.itens_max && mimos < p.mimo_max) {
    let melhor: ItemPool | null = null;
    let dist = Infinity;
    for (const x of c.pool) {
      if (x.nivel !== 9 || !pode(x)) continue;
      const s2 = soma + x.preco;
      if (s2 > cheioMax) continue;
      const dd = Math.abs(cheioAlvo - s2);
      if (dd < dist) {
        dist = dd;
        melhor = x;
      }
    }
    if (!melhor) break;
    itens.push({ item: melhor, papel: "mimo" });
    soma += melhor.preco;
    usados.add(melhor.sku);
    mimos++;
  }

  return fecharKit(c, tema, heroi, itens, null, false);
}

/** Kit do catálogo comum (outra loja da praça/regional): vale aqui se a loja tiver estoque e o kit passar nas regras dela. */
function reaproveitar(c: ContextoLoja, k: KitInterno): KitInterno | null {
  const tema = c.temasPorChave.get(k.tema);
  if (!tema) return null;
  const itens: { item: ItemPool; papel: Papel }[] = [];
  let fracas = 0;
  for (const x of k.itens) {
    const aqui = c.porSku.get(x.item.sku);
    if (!aqui || !livre(c, aqui)) return null;
    if (x.papel === "heroi") {
      if (aqui.estoque < c.p.heroi_estoque_min || !aqui.regular) return null;
    } else if (aqui.forca === "Fraca") {
      fracas++;
    }
    itens.push({
      item: aqui,
      papel: x.papel === "heroi" ? "heroi" : aqui.forca === "Fraca" ? "mimo" : "surpresa",
    });
  }
  if (fracas > c.p.mimo_max) return null;
  const heroi = itens.find((x) => x.papel === "heroi")!.item;
  return fecharKit(c, tema, heroi, itens, k.preco, true);
}

/** Distribui sacolas entre os kits respeitando o estoque (um de cada vez). Sem limite = sacolas possíveis. */
function alocar(kits: KitInterno[], estoque: Map<string, number>, limite: number, gravar: boolean) {
  const resto = new Map(estoque);
  const qtd = kits.map(() => 0);
  let total = 0;
  let andou = true;
  while (total < limite && andou) {
    andou = false;
    kits.forEach((k, i) => {
      if (total >= limite) return;
      if (k.itens.every((x) => (resto.get(x.item.sku) ?? 0) >= 1)) {
        for (const x of k.itens) resto.set(x.item.sku, resto.get(x.item.sku)! - 1);
        qtd[i]!++;
        total++;
        andou = true;
      }
    });
  }
  if (gravar) kits.forEach((k, i) => (k.qtd = qtd[i]!));
  return total;
}

// ---------------------------------------------------------------------------
// Simulação

const arred = (v: number, casas = 2) => Math.round(v * 10 ** casas) / 10 ** casas;

export function simular(e: EntradaSimulacao): ResultadoSimulacao {
  const p = e.parametros;
  const lojasAtivas = e.lojas.filter(entraNoPlano);
  const metas = metasDoCiclo(p, e.ciclos, e.ciclo.id, lojasAtivas, e.faturamento);
  const metaPorLoja = new Map(metas.lojas.map((m) => [m.bcps, m]));
  const produtos = new Map(e.produtos.map((x) => [x.sku, x]));
  const promo = new Map(
    e.promocoes.filter((x) => x.desconto_pct > 0).map((x) => [x.sku, x.desconto_pct]),
  );
  const promoOk = promo.size > 0;
  const estoquePorLoja = new Map<string, EstoqueMotor[]>();
  for (const x of e.estoque) {
    const l = estoquePorLoja.get(x.bcps);
    if (l) l.push(x);
    else estoquePorLoja.set(x.bcps, [x]);
  }
  const temas = temasDoMotor(p);
  const temasPorChave = new Map(temas.map((t) => [t.chave, t]));
  const filtro = e.pracas?.length ? new Set(e.pracas) : null;
  // Divisão: grupo do catálogo comum (sem transferência: cada loja só monta com o próprio estoque)
  const grupoDe = (l: LojaMotor) =>
    p.mix_divisao === "praca"
      ? "p:" + l.praca
      : p.mix_divisao === "regional" && l.regional
        ? "r:" + l.regional
        : "u:" + l.bcps;

  // ordem: grupo; dentro do grupo, a loja de maior meta primeiro (ela "abre" os kits que as outras reaproveitam)
  const ordem = lojasAtivas
    .filter((l) => !filtro || filtro.has(l.praca))
    .sort(
      (a, b) =>
        grupoDe(a).localeCompare(grupoDe(b)) ||
        a.praca.localeCompare(b.praca) ||
        (metaPorLoja.get(b.bcps)?.meta ?? 0) - (metaPorLoja.get(a.bcps)?.meta ?? 0) ||
        a.bcps.localeCompare(b.bcps),
    );

  const biblioteca = new Map<string, { kit: KitInterno; lojas: number }[]>(); // por grupo da divisão
  const internos: {
    loja: LojaMotor;
    kits: KitInterno[];
    possiveis: number;
    pool: number;
    avisos: string[];
  }[] = [];

  for (const loja of ordem) {
    const meta = metaPorLoja.get(loja.bcps)!;
    const estoqueLoja = estoquePorLoja.get(loja.bcps) ?? [];
    const pool = montarPool(estoqueLoja, produtos, promo, p);
    const c: ContextoLoja = {
      p,
      faixa: faixasDaPraca(p, loja.praca),
      pool,
      porSku: new Map(pool.map((x) => [x.sku, x])),
      promoOk,
      usos: new Map(),
      heroisUsados: new Map(),
      vistos: new Set(),
      rand: sorteador(e.semente ^ hashTexto(loja.bcps)),
      temasPorChave,
      menorSurpresas: menorSurpresas(pool, p.itens_min - 1),
    };
    const estoque = new Map(estoqueLoja.map((x) => [x.sku, x.estoque]));
    const kits: KitInterno[] = [];
    const avisos: string[] = [];
    let planejadas = 0;

    if (meta.sacolasMeta > 0) {
      // 1) catálogo comum: kits de outras lojas do mesmo grupo (os mais usados primeiro)
      if (p.mix_divisao !== "unidade") {
        const lib = [...(biblioteca.get(grupoDe(loja)) ?? [])].sort((a, b) => b.lojas - a.lojas);
        for (const { kit } of lib) {
          if (kits.length >= p.geracao_kits_max_loja || planejadas >= meta.sacolasMeta) break;
          const k = reaproveitar(c, kit);
          if (!k) continue;
          kits.push(k);
          registrar(c, k);
          planejadas = alocar(kits, estoque, meta.sacolasMeta, false);
        }
      }
      // 2) kits novos, em rodadas, até cobrir a meta
      for (
        let rodada = 0;
        rodada < p.geracao_rodadas_max && planejadas < meta.sacolasMeta;
        rodada++
      ) {
        let novos = 0;
        for (const tema of temas) {
          if (kits.length >= p.geracao_kits_max_loja) break;
          for (let t = 0; t < 20; t++) {
            const k = tentarKit(c, tema, t + rodada * 4);
            if (k) {
              kits.push(k);
              registrar(c, k);
              novos++;
              break;
            }
          }
        }
        planejadas = alocar(kits, estoque, meta.sacolasMeta, false);
        if (!novos || kits.length >= p.geracao_kits_max_loja) break;
      }
    }

    const possiveis = alocar(kits, estoque, Infinity, false);
    alocar(kits, estoque, meta.sacolasMeta, true);
    const usados = kits.filter((k) => k.qtd > 0);
    if (!pool.length) avisos.push("Loja sem pool (nenhum SKU BOT com preço e estoque mínimo).");
    else if (meta.sacolasMeta > 0 && !usados.length)
      avisos.push("Nenhum kit coube nas regras com o estoque desta loja.");
    if (usados.some((k) => k.itens.some((x) => x.item.custo === null)))
      avisos.push("Há itens sem custo na cobertura (custo considerado 0).");

    if (p.mix_divisao === "regional" && !loja.regional)
      avisos.push(
        "Loja sem GRVO na dGerentes: na divisão por Regional, fica com catálogo próprio.",
      );
    const lib = biblioteca.get(grupoDe(loja)) ?? [];
    for (const k of usados) {
      const ja = lib.find((x) => x.kit.composicao === k.composicao);
      if (ja) ja.lojas++;
      else lib.push({ kit: k, lojas: 1 });
    }
    biblioteca.set(grupoDe(loja), lib);
    internos.push({ loja, kits: usados, possiveis, pool: pool.length, avisos });
  }

  // códigos: mesma composição (SKUs + preço final) = mesmo código, em todo o ciclo
  const codigos = new Map<string, string>();
  const kitsGlobais = new Map<string, KitSimulado>();
  const lojasSim: LojaSimulada[] = internos.map(({ loja, kits, possiveis, pool, avisos }) => {
    const meta = metaPorLoja.get(loja.bcps)!;
    const kitsLoja: KitNaLoja[] = kits.map((k) => {
      let codigo = codigos.get(k.composicao);
      if (!codigo) {
        codigo = `C${e.ciclo.id}-${String(codigos.size + 1).padStart(4, "0")}`;
        codigos.set(k.composicao, codigo);
        kitsGlobais.set(codigo, {
          codigo,
          tema: k.tema,
          nicho: k.heroi.nicho,
          preco: k.preco,
          valorCheio: arred(k.valorCheio),
          descontoPct: arred(k.desconto * 100, 1),
          heroiSku: k.heroi.sku,
          itens: k.itens.map((x, i) => ({
            ordem: i + 1,
            papel: x.papel,
            sku: x.item.sku,
            descricao: x.item.descricao,
            precoItem: arred(x.valor),
            promoPct: x.item.promoPct > 0 ? x.item.promoPct : null,
          })),
          composicao: k.composicao,
          lojas: 0,
        });
      }
      kitsGlobais.get(codigo)!.lojas++;
      return {
        codigo,
        qtd: k.qtd,
        custo: arred(k.custo),
        margem: arred(k.preco - k.custo),
        valorCheio: arred(k.valorCheio),
        descontoPct: arred(k.desconto * 100, 1),
        reaproveitado: k.reaproveitado,
        detalhes: k.itens.map((x) => ({
          sku: x.item.sku,
          forca: x.item.forca,
          cobertura: Number.isFinite(x.item.cobertura) ? arred(x.item.cobertura, 1) : null,
          estoque: x.item.estoque,
          vmd: x.item.vmd,
          custo: x.item.custo,
        })),
      };
    });
    const receita = kits.reduce((s, k) => s + k.qtd * k.preco, 0);
    const custo = kits.reduce((s, k) => s + k.qtd * k.custo, 0);
    return {
      bcps: loja.bcps,
      nome: loja.nome,
      praca: loja.praca,
      vendedoras: loja.vendedoras,
      meta: arred(meta.meta),
      metaSemana: arred(meta.metaSemana),
      metaVendSemana: meta.metaVendSemana === null ? null : arred(meta.metaVendSemana),
      metasMes: Object.fromEntries(Object.entries(meta.metasMes).map(([m, v]) => [m, arred(v)])),
      sacolasMeta: meta.sacolasMeta,
      sacolasPossiveis: possiveis,
      sacolasPlanejadas: kits.reduce((s, k) => s + k.qtd, 0),
      receita: arred(receita),
      custo: arred(custo),
      poolTamanho: pool,
      kits: kitsLoja,
      avisos,
    };
  });

  const soma = (f: (l: LojaSimulada) => number) => lojasSim.reduce((s, l) => s + f(l), 0);
  const receita = soma((l) => l.receita);
  const custo = soma((l) => l.custo);
  return {
    ciclo: e.ciclo.id,
    semente: e.semente,
    geradaEm: new Date().toISOString(),
    pracas: e.pracas?.length ? [...e.pracas] : null,
    parametros: p,
    metaCiclo: arred(metas.metaCiclo),
    metasPracas: metas.pracas.map((x) => ({
      ...x,
      meta: arred(x.meta),
      metaSugerida: arred(x.metaSugerida),
    })),
    lojas: lojasSim,
    kits: [...kitsGlobais.values()],
    resumo: {
      lojas: lojasSim.length,
      kits: kitsGlobais.size,
      meta: arred(soma((l) => l.meta)),
      sacolasMeta: soma((l) => l.sacolasMeta),
      sacolasPossiveis: soma((l) => l.sacolasPossiveis),
      sacolasPlanejadas: soma((l) => l.sacolasPlanejadas),
      receita: arred(receita),
      custo: arred(custo),
      margem: arred(receita - custo),
      kitsReaproveitados: lojasSim.reduce(
        (s, l) => s + l.kits.filter((k) => k.reaproveitado).length,
        0,
      ),
    },
  };
}

// ---------------------------------------------------------------------------
// Troca de kits de uma loja na base (F1b)

/** Kit da loja na base atual. */
export interface KitDaBaseNaLoja {
  codigo: string;
  skus: string[];
  heroiSku: string;
  preco: number;
  qtd: number;
  /** Custo do kit na loja (da base; só admin). */
  custo: number;
}

export interface EntradaRegerar {
  /** Dados do motor (parâmetros, estoque de hoje, produtos, promoção, ciclo, semente, lojas). */
  motor: EntradaSimulacao;
  bcps: string;
  /** Meta inteira da loja na base, em sacolas (até a parte de vendas). */
  sacolasMeta: number;
  kitsAtuais: KitDaBaseNaLoja[];
  /** Composições que já existem na base → código (mesma composição = mesmo código). */
  codigosDaBase: Map<string, string>;
  /** Próximo número livre de código no ciclo (C15-NNNN). */
  proximoNumero: number;
}

export interface ResultadoRegerar {
  /** Kits indisponíveis (montam 0): saem da loja. */
  remover: string[];
  /** Kits que ficam: mesmo código, quantidade ajustada ao estoque. */
  manter: { codigo: string; qtd: number; disponivel: number }[];
  /** Composições novas na base (para gravar kit e itens). */
  kitsNovos: KitSimulado[];
  /** Kits novos nesta loja (podem reaproveitar código da base). */
  novos: (KitNaLoja & { disponivel: number })[];
  loja: {
    sacolasPossiveis: number;
    sacolasPlanejadas: number;
    receita: number;
    custo: number;
    capacidade: number;
  };
  avisos: string[];
}

/**
 * Troca os kits indisponíveis de uma loja por kits novos, sem mexer nos que ainda montam:
 * - fica todo kit que monta pelo menos 1 (mesmo código), com a quantidade planejada reduzida
 *   ao que o estoque permite;
 * - o estoque que os kits que ficam usam na capacidade deles é reservado: os kits novos só usam
 *   o que sobra (a capacidade dos que ficaram não cai);
 * - os kits novos cobrem o que falta da meta da loja depois dos que ficaram.
 */
export function regerarKitsDaLoja(r: EntradaRegerar): ResultadoRegerar {
  const e = r.motor;
  const p = e.parametros;
  const loja = e.lojas.find((l) => l.bcps === r.bcps);
  if (!loja) throw new Error(`Loja ${r.bcps} fora dos dados do motor.`);
  const estoqueLoja = e.estoque.filter((x) => x.bcps === r.bcps);
  const estoque = new Map(estoqueLoja.map((x) => [x.sku, x.estoque]));
  const avisos: string[] = [];

  // 1) quem fica e quem sai
  const comDisp = r.kitsAtuais.map((k) => ({ ...k, disponivel: podeMontar(k.skus, estoque) }));
  const ficam = comDisp.filter((k) => k.disponivel >= 1);
  const remover = comDisp.filter((k) => k.disponivel < 1).map((k) => k.codigo);

  // 2) quantidade dos que ficam (até a de antes) e reserva da capacidade deles
  const planejadosFicam = alocarSkus(
    ficam.map((k) => k.skus),
    estoque,
    r.sacolasMeta,
    ficam.map((k) => k.qtd),
  ).qtd;
  const reserva = alocarSkus(
    ficam.map((k) => k.skus),
    estoque,
  ).resto;
  const falta = Math.max(0, r.sacolasMeta - planejadosFicam.reduce((s, q) => s + q, 0));

  // 3) kits novos só com o estoque que sobra
  const produtos = new Map(e.produtos.map((x) => [x.sku, x]));
  const promo = new Map(
    e.promocoes.filter((x) => x.desconto_pct > 0).map((x) => [x.sku, x.desconto_pct]),
  );
  const sobra = estoqueLoja.map((x) => ({ ...x, estoque: reserva.get(x.sku) ?? 0 }));
  const pool = montarPool(sobra, produtos, promo, p);
  const temas = temasDoMotor(p);
  const c: ContextoLoja = {
    p,
    faixa: faixasDaPraca(p, loja.praca),
    pool,
    porSku: new Map(pool.map((x) => [x.sku, x])),
    promoOk: promo.size > 0,
    usos: new Map(),
    heroisUsados: new Map(),
    vistos: new Set(),
    rand: sorteador(e.semente ^ hashTexto(loja.bcps)),
    temasPorChave: new Map(temas.map((t) => [t.chave, t])),
    menorSurpresas: menorSurpresas(pool, p.itens_min - 1),
  };
  // os que ficam contam nos limites da loja (usos por SKU, herói repetido, composição repetida)
  for (const k of ficam) {
    c.vistos.add(composicaoDe(k.skus, k.preco));
    for (const s of k.skus) c.usos.set(s, (c.usos.get(s) ?? 0) + 1);
    c.heroisUsados.set(k.heroiSku, (c.heroisUsados.get(k.heroiSku) ?? 0) + 1);
  }
  const sobraMapa = new Map(sobra.map((x) => [x.sku, x.estoque]));
  const novos: KitInterno[] = [];
  let planejadas = 0;
  if (falta > 0) {
    for (let rodada = 0; rodada < p.geracao_rodadas_max && planejadas < falta; rodada++) {
      let feitos = 0;
      for (const tema of temas) {
        if (ficam.length + novos.length >= p.geracao_kits_max_loja) break;
        for (let t = 0; t < 20; t++) {
          const k = tentarKit(c, tema, t + rodada * 4);
          if (k) {
            novos.push(k);
            registrar(c, k);
            feitos++;
            break;
          }
        }
      }
      planejadas = alocar(novos, sobraMapa, falta, false);
      if (!feitos || ficam.length + novos.length >= p.geracao_kits_max_loja) break;
    }
  }
  alocar(novos, sobraMapa, falta, true);
  const usados = novos.filter((k) => k.qtd > 0);
  if (falta > 0 && !usados.length)
    avisos.push("Nenhum kit novo coube nas regras com o estoque que sobrou.");

  // 4) códigos: composição que já existe na base reaproveita o código
  const codigos = new Map(r.codigosDaBase);
  let numero = r.proximoNumero;
  const kitsNovos: KitSimulado[] = [];
  const novosNaLoja = usados.map((k) => {
    let codigo = codigos.get(k.composicao);
    if (!codigo) {
      codigo = `C${e.ciclo.id}-${String(numero++).padStart(4, "0")}`;
      codigos.set(k.composicao, codigo);
      kitsNovos.push({
        codigo,
        tema: k.tema,
        nicho: k.heroi.nicho,
        preco: k.preco,
        valorCheio: arred(k.valorCheio),
        descontoPct: arred(k.desconto * 100, 1),
        heroiSku: k.heroi.sku,
        itens: k.itens.map((x, i) => ({
          ordem: i + 1,
          papel: x.papel,
          sku: x.item.sku,
          descricao: x.item.descricao,
          precoItem: arred(x.valor),
          promoPct: x.item.promoPct > 0 ? x.item.promoPct : null,
        })),
        composicao: k.composicao,
        lojas: 1,
      });
    }
    return {
      codigo,
      qtd: k.qtd,
      custo: arred(k.custo),
      margem: arred(k.preco - k.custo),
      valorCheio: arred(k.valorCheio),
      descontoPct: arred(k.desconto * 100, 1),
      reaproveitado: false,
      // estoque de hoje (completo) = estoque "da geração" deste kit nas próximas comparações
      detalhes: k.itens.map((x) => ({
        sku: x.item.sku,
        forca: x.item.forca,
        cobertura: Number.isFinite(x.item.cobertura) ? arred(x.item.cobertura, 1) : null,
        estoque: estoque.get(x.item.sku) ?? 0,
        vmd: x.item.vmd,
        custo: x.item.custo,
      })),
      disponivel: podeMontar(
        k.itens.map((x) => x.item.sku),
        estoque,
      ),
    };
  });

  // 5) números da loja com os kits que ficam + os novos
  const todos = [
    ...ficam.map((k, i) => ({
      skus: k.skus,
      qtd: planejadosFicam[i]!,
      preco: k.preco,
      custo: k.custo,
    })),
    ...usados.map((k) => ({
      skus: k.itens.map((x) => x.item.sku),
      qtd: k.qtd,
      preco: k.preco,
      custo: k.custo,
    })),
  ];
  const capacidade = capacidadeConjunta(
    todos.map((k) => k.skus),
    estoque,
  );
  return {
    remover,
    manter: ficam.map((k, i) => ({
      codigo: k.codigo,
      qtd: planejadosFicam[i]!,
      disponivel: k.disponivel,
    })),
    kitsNovos,
    novos: novosNaLoja,
    loja: {
      sacolasPossiveis: capacidade,
      sacolasPlanejadas: todos.reduce((s, k) => s + k.qtd, 0),
      receita: arred(todos.reduce((s, k) => s + k.qtd * k.preco, 0)),
      custo: arred(todos.reduce((s, k) => s + k.qtd * k.custo, 0)),
      capacidade,
    },
    avisos,
  };
}

/** Composição (SKUs + preço final) no mesmo formato do motor, para achar o código na base. */
export const composicaoDoKit = (skus: string[], preco: number) => composicaoDe(skus, preco);

/** Heróis que hoje passariam na loja (travas + promoção), para "heróis novos fora dos kits". */
export function heroisPossiveisNaLoja(e: EntradaSimulacao, bcps: string): string[] {
  const p = e.parametros;
  const produtos = new Map(e.produtos.map((x) => [x.sku, x]));
  const promo = new Map(
    e.promocoes.filter((x) => x.desconto_pct > 0).map((x) => [x.sku, x.desconto_pct]),
  );
  const promoOk = promo.size > 0;
  const pool = montarPool(
    e.estoque.filter((x) => x.bcps === bcps),
    produtos,
    promo,
    p,
  );
  const praca = e.lojas.find((l) => l.bcps === bcps)?.praca ?? "";
  const faixa = faixasDaPraca(p, praca);
  const menor = menorSurpresas(pool, p.itens_min - 1);
  const valor = (x: ItemPool) =>
    promoOk && x.promoPct > 0 ? x.preco * (1 - x.promoPct / 100) : x.preco;
  return pool
    .filter(
      (x) =>
        x.regular &&
        x.preco >= p.heroi_preco_min &&
        x.estoque >= p.heroi_estoque_min &&
        heroiCabeNaFaixa(valor(x), faixa, menor) &&
        (p.promo_heroi !== "obrigatoria" || (promoOk ? x.promoPct > 0 : x.forca === "Forte")),
    )
    .map((x) => x.sku);
}

export { NOME_TEMA };
