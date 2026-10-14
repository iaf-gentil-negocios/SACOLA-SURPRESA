// Parâmetros do motor (tabela `parametros`: chave → valor json). Valores padrão = os do SQL.

export type DivisaoCiclos = "peso_2025" | "dias" | "digitada";
export type DivisaoLojas = "faturamento" | "vendedoras";

/**
 * Motor do Mix (parte F1a, 11/10/2026).
 * Divisão = onde o catálogo de kits é comum: a loja reaproveita kits já montados por outras lojas do
 * mesmo grupo, mas só recebe os que monta com o próprio estoque (sem transferência; meta por loja).
 */
export type Divisao = "unidade" | "praca" | "regional";
/** Herói (promoção do ciclo é obrigatória: filtro, não critério). */
export type CriterioHeroi = "vmd" | "cobertura" | "preco";
/**
 * Promoção do ciclo (1º item do Herói e das Surpresas, não se arrasta).
 * Herói: obrigatória (só promoção) / preferir (1º critério) / ignorar.
 * Surpresas: excluir (promoção não entra) / ignorar / preferir (1º critério).
 */
export type PromoHeroi = "obrigatoria" | "preferir" | "ignorar";
export type PromoSurpresa = "excluir" | "ignorar" | "preferir";
/** Agregado (surpresas). VMD baixo só entra como mimo. */
export type CriterioAgregado =
  "cobertura_alta" | "vmd_alto" | "vmd_medio" | "custo_alto" | "custo_medio" | "custo_baixo";
/** Tema criado pelo admin: nome + até 4 categorias (mesma regra de Banho e Rosto). */
export interface TemaPersonalizado {
  nome: string;
  categorias: string[];
}

/** Ordem padrão (ajustada em 11/10/2026 pela comparação com a seed): preço cheio → VMD → cobertura. */
export const CRITERIOS_HEROI: CriterioHeroi[] = ["preco", "vmd", "cobertura"];
/**
 * Ordem padrão (ajustada em 11/10/2026): cobertura alta → VMD alto → VMD médio → valor baixo →
 * valor alto → valor médio. Na seed, dá mais sacolas e mais margem que o motor de antes.
 */
export const CRITERIOS_AGREGADO: CriterioAgregado[] = [
  "cobertura_alta",
  "vmd_alto",
  "vmd_medio",
  "custo_baixo",
  "custo_alto",
  "custo_medio",
];

export interface LimitesPraca {
  preco_min?: number;
  preco_max?: number;
  desconto_max?: number;
}

export interface Parametros {
  meta_total: number;
  meta_divisao_ciclos: DivisaoCiclos;
  meta_pesos_ciclos: Record<string, number>;
  meta_ciclos_digitada: Record<string, number>;
  meta_divisao_lojas: DivisaoLojas;
  meta_faturamento_meses: string[];
  /** { "<ciclo>": { "<praça>": meta } } */
  meta_pracas_digitada: Record<string, Record<string, number>>;
  simulador_vendas_vendedora_semana: number;
  preco_min: number;
  preco_max: number;
  preco_degrau: number;
  preco_terminacao: number;
  desconto_min: number;
  desconto_max: number;
  desconto_alvo: number;
  limites_pracas: Record<string, LimitesPraca>;
  trava_custo: boolean;
  heroi_preco_min: number;
  heroi_pct_min: number;
  heroi_estoque_min: number;
  heroi_valor_promo: boolean;
  /** Antigo: o herói sair dos de VMD alto quando o ciclo não tem promoção agora é automático. */
  heroi_sem_promo_usa_forte: boolean;
  forca_pct_forte: number;
  forca_pct_media: number;
  forca_vmd_zero_fraca: boolean;
  parado_cobertura_dias: number;
  pool_fornecedores: string[];
  pool_estoque_min: number;
  /** Antigo: substituído por promo_surpresa (ligado = excluir). Lido só para converter. */
  surpresa_excluir_promo: boolean;
  mimo_max: number;
  itens_min: number;
  itens_max: number;
  categoria_max: number;
  sku_max_kits_loja: number;
  geracao_rodadas_max: number;
  geracao_kits_max_loja: number;
  /** Antigo: substituído por mix_divisao (praça = true). Lido só para converter. */
  reaproveitar_kits_praca: boolean;
  /** Fixos ligados (chave) e temas personalizados ligados (nome). */
  temas: string[];
  mix_divisao: Divisao;
  /** Ordem de prioridade (primeiro = mais importante). */
  criterios_heroi: CriterioHeroi[];
  criterios_agregado: CriterioAgregado[];
  /** Critérios desligados ("Não usar"): ficam na lista, mas não influenciam nada. */
  criterios_heroi_desligados: CriterioHeroi[];
  criterios_agregado_desligados: CriterioAgregado[];
  promo_heroi: PromoHeroi;
  promo_surpresa: PromoSurpresa;
  /** Divergências (F1b): queda mínima (%) da capacidade de kits ou do estoque dos produtos dos kits. */
  divergencia_queda_pct: number;
  /** Divergências (F1b): a capacidade precisa cair pelo menos N kits para a loja ser divergente. */
  divergencia_min_kits: number;
  temas_personalizados: TemaPersonalizado[];
}

export const PARAMETROS_PADRAO: Parametros = {
  meta_total: 6_000_000,
  meta_divisao_ciclos: "peso_2025",
  meta_pesos_ciclos: { "15": 0.1541, "16": 0.4031, "17": 0.4428 },
  meta_ciclos_digitada: {},
  meta_divisao_lojas: "faturamento",
  meta_faturamento_meses: ["2026-07", "2026-08", "2026-09"],
  meta_pracas_digitada: {},
  simulador_vendas_vendedora_semana: 4,
  preco_min: 180,
  preco_max: 200,
  preco_degrau: 5,
  preco_terminacao: 0.9,
  desconto_min: 20,
  desconto_max: 50,
  desconto_alvo: 35,
  limites_pracas: {},
  trava_custo: true,
  heroi_preco_min: 99.9,
  heroi_pct_min: 30,
  heroi_estoque_min: 10,
  heroi_valor_promo: true,
  heroi_sem_promo_usa_forte: true,
  forca_pct_forte: 27,
  forca_pct_media: 45,
  forca_vmd_zero_fraca: true,
  parado_cobertura_dias: 180,
  pool_fornecedores: ["BOT"],
  pool_estoque_min: 3,
  surpresa_excluir_promo: true,
  mimo_max: 1,
  itens_min: 3,
  itens_max: 6,
  categoria_max: 2,
  sku_max_kits_loja: 6,
  geracao_rodadas_max: 15,
  geracao_kits_max_loja: 20,
  reaproveitar_kits_praca: true,
  temas: ["ela", "ele", "inf", "linha", "banho", "rosto", "cabelo"],
  // padrão decidido em 11/10/2026: cada unidade monta o próprio catálogo
  mix_divisao: "unidade",
  criterios_heroi: [...CRITERIOS_HEROI],
  criterios_agregado: [...CRITERIOS_AGREGADO],
  criterios_heroi_desligados: [],
  criterios_agregado_desligados: [],
  promo_heroi: "obrigatoria",
  promo_surpresa: "excluir",
  divergencia_queda_pct: 30,
  divergencia_min_kits: 3,
  temas_personalizados: [],
};

/** Lista salva vira uma ordem válida: só itens conhecidos, sem repetição; os que faltarem vão ao fim. */
export function ordemValida<T extends string>(salva: unknown, todos: readonly T[]): T[] {
  const lista = Array.isArray(salva) ? salva.filter((x): x is T => todos.includes(x as T)) : [];
  const unicos = [...new Set(lista)];
  return [...unicos, ...todos.filter((t) => !unicos.includes(t))];
}

/** Temas personalizados válidos: nome preenchido e único, 1 a 4 categorias. */
export function temasPersonalizadosValidos(valor: unknown): TemaPersonalizado[] {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set<string>();
  const r: TemaPersonalizado[] = [];
  for (const t of valor) {
    if (!t || typeof t !== "object") continue;
    const nome = String((t as { nome?: unknown }).nome ?? "").trim();
    const cats = (t as { categorias?: unknown }).categorias;
    const categorias = Array.isArray(cats)
      ? [...new Set(cats.map((c) => String(c).trim().toUpperCase()).filter(Boolean))].slice(0, 4)
      : [];
    if (!nome || vistos.has(nome.toLowerCase()) || !categorias.length) continue;
    vistos.add(nome.toLowerCase());
    r.push({ nome, categorias });
  }
  return r;
}

/** Monta os parâmetros a partir das linhas da tabela; chave ausente ou de tipo errado usa o padrão. */
export function parametrosDasLinhas(linhas: { chave: string; valor: unknown }[]): Parametros {
  const p: Parametros = structuredClone(PARAMETROS_PADRAO);
  const alvo = p as unknown as Record<string, unknown>;
  for (const { chave, valor } of linhas) {
    if (!(chave in alvo)) continue;
    const padrao = alvo[chave];
    const mesmoTipo = Array.isArray(padrao)
      ? Array.isArray(valor)
      : typeof padrao === typeof valor && valor !== null;
    if (mesmoTipo) alvo[chave] = valor;
  }
  // Motor do Mix: listas sempre completas e válidas
  p.criterios_heroi = ordemValida(p.criterios_heroi, CRITERIOS_HEROI);
  p.criterios_agregado = ordemValida(p.criterios_agregado, CRITERIOS_AGREGADO);
  p.temas_personalizados = temasPersonalizadosValidos(p.temas_personalizados);
  p.criterios_heroi_desligados = p.criterios_heroi_desligados.filter((c) =>
    CRITERIOS_HEROI.includes(c),
  );
  p.criterios_agregado_desligados = p.criterios_agregado_desligados.filter((c) =>
    CRITERIOS_AGREGADO.includes(c),
  );
  if (!["obrigatoria", "preferir", "ignorar"].includes(p.promo_heroi))
    p.promo_heroi = "obrigatoria";
  if (!["excluir", "ignorar", "preferir"].includes(p.promo_surpresa)) p.promo_surpresa = "excluir";
  // quem salvou antes: "promoção não entra como surpresa" ligado = excluir; desligado = ignorar
  if (!linhas.some((l) => l.chave === "promo_surpresa") && !p.surpresa_excluir_promo)
    p.promo_surpresa = "ignorar";
  if (!["unidade", "praca", "regional"].includes(p.mix_divisao)) p.mix_divisao = "unidade";
  // antes da divisão existir, "reaproveitar kits da praça" desligado = cada unidade por si
  if (!linhas.some((l) => l.chave === "mix_divisao") && !p.reaproveitar_kits_praca)
    p.mix_divisao = "unidade";
  return p;
}

/** Faixas de preço/desconto de uma praça (limites da praça sobre os gerais). */
export function faixasDaPraca(p: Parametros, praca: string) {
  const l = p.limites_pracas[praca] ?? {};
  const pMin = l.preco_min ?? p.preco_min;
  const pMax = Math.max(pMin, l.preco_max ?? p.preco_max);
  const dMin = p.desconto_min / 100;
  const dMax = Math.max(dMin, (l.desconto_max ?? p.desconto_max) / 100);
  const dAlvo = Math.min(dMax, Math.max(dMin, p.desconto_alvo / 100));
  return { pMin, pMax, dMin, dMax, dAlvo, pMedio: (pMin + pMax) / 2 };
}
