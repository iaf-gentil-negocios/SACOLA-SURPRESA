// Converte uma simulação em linhas das tabelas simulacao_* e de volta (nuvem). Puro e testável.
import type { KitSimulado, LojaSimulada, ResultadoSimulacao } from "@/lib/motor/gerar";
import type { Parametros } from "@/lib/motor/parametros";

export interface LinhasSimulacao {
  kits: {
    codigo: string;
    tema: string;
    nicho: string | null;
    preco: number;
    valor_cheio: number;
    desconto_pct: number;
    heroi_sku: string;
    composicao: string;
    lojas: number;
  }[];
  itens: {
    codigo: string;
    ordem: number;
    papel: "heroi" | "surpresa" | "mimo";
    sku: string;
    descricao: string;
    preco_item: number;
    promo_pct: number | null;
  }[];
  kitLojas: {
    codigo: string;
    bcps: string;
    qtd: number;
    custo: number;
    margem: number;
    valor_cheio: number;
    desconto_pct: number;
    reaproveitado: boolean;
    detalhes: unknown;
  }[];
  lojas: {
    bcps: string;
    praca: string;
    vendedoras: number;
    meta: number;
    meta_semana: number;
    meta_vend_semana: number | null;
    metas_mes: Record<string, number>;
    sacolas_meta: number;
    sacolas_possiveis: number;
    sacolas_planejadas: number;
    receita: number;
    custo: number;
    pool_tamanho: number;
    avisos: string[];
  }[];
}

export function linhasDaSimulacao(r: ResultadoSimulacao): LinhasSimulacao {
  return {
    kits: r.kits.map((k) => ({
      codigo: k.codigo,
      tema: k.tema,
      nicho: k.nicho,
      preco: k.preco,
      valor_cheio: k.valorCheio,
      desconto_pct: k.descontoPct,
      heroi_sku: k.heroiSku,
      composicao: k.composicao,
      lojas: k.lojas,
    })),
    itens: r.kits.flatMap((k) =>
      k.itens.map((i) => ({
        codigo: k.codigo,
        ordem: i.ordem,
        papel: i.papel,
        sku: i.sku,
        descricao: i.descricao,
        preco_item: i.precoItem,
        promo_pct: i.promoPct,
      })),
    ),
    kitLojas: r.lojas.flatMap((l) =>
      l.kits.map((k) => ({
        codigo: k.codigo,
        bcps: l.bcps,
        qtd: k.qtd,
        custo: k.custo,
        margem: k.margem,
        valor_cheio: k.valorCheio,
        desconto_pct: k.descontoPct,
        reaproveitado: k.reaproveitado,
        detalhes: k.detalhes,
      })),
    ),
    lojas: r.lojas.map((l) => ({
      bcps: l.bcps,
      praca: l.praca,
      vendedoras: l.vendedoras,
      meta: l.meta,
      meta_semana: l.metaSemana,
      meta_vend_semana: l.metaVendSemana,
      metas_mes: l.metasMes,
      sacolas_meta: l.sacolasMeta,
      sacolas_possiveis: l.sacolasPossiveis,
      sacolas_planejadas: l.sacolasPlanejadas,
      receita: l.receita,
      custo: l.custo,
      pool_tamanho: l.poolTamanho,
      avisos: l.avisos,
    })),
  };
}

/** Remonta a simulação a partir das linhas gravadas (nomes de loja vêm do cadastro). */
export function simulacaoDasLinhas(
  cabecalho: {
    ciclo: number;
    semente: number;
    pracas: string[] | null;
    parametros: Parametros;
    resumo: ResultadoSimulacao["resumo"];
    criadoEm: string;
    metaCiclo: number;
    metasPracas: ResultadoSimulacao["metasPracas"];
  },
  linhas: LinhasSimulacao,
  nomesLojas: Map<string, string>,
): ResultadoSimulacao {
  const num = Number;
  const itensPorKit = new Map<string, LinhasSimulacao["itens"]>();
  for (const i of linhas.itens)
    itensPorKit.set(i.codigo, [...(itensPorKit.get(i.codigo) ?? []), i]);
  const kits: KitSimulado[] = linhas.kits.map((k) => ({
    codigo: k.codigo,
    tema: k.tema,
    nicho: (k.nicho ?? "U") as KitSimulado["nicho"],
    preco: num(k.preco),
    valorCheio: num(k.valor_cheio),
    descontoPct: num(k.desconto_pct),
    heroiSku: k.heroi_sku,
    composicao: k.composicao,
    lojas: k.lojas,
    itens: (itensPorKit.get(k.codigo) ?? [])
      .sort((a, b) => a.ordem - b.ordem)
      .map((i) => ({
        ordem: i.ordem,
        papel: i.papel,
        sku: i.sku,
        descricao: i.descricao,
        precoItem: num(i.preco_item),
        promoPct: i.promo_pct === null ? null : num(i.promo_pct),
      })),
  }));
  const kitsPorLoja = new Map<string, LinhasSimulacao["kitLojas"]>();
  for (const k of linhas.kitLojas) kitsPorLoja.set(k.bcps, [...(kitsPorLoja.get(k.bcps) ?? []), k]);
  const lojas: LojaSimulada[] = linhas.lojas.map((l) => ({
    bcps: l.bcps,
    nome: nomesLojas.get(l.bcps) ?? l.bcps,
    praca: l.praca,
    vendedoras: l.vendedoras,
    meta: num(l.meta),
    metaSemana: num(l.meta_semana),
    metaVendSemana: l.meta_vend_semana === null ? null : num(l.meta_vend_semana),
    metasMes: l.metas_mes,
    sacolasMeta: l.sacolas_meta,
    sacolasPossiveis: l.sacolas_possiveis,
    sacolasPlanejadas: l.sacolas_planejadas,
    receita: num(l.receita),
    custo: num(l.custo),
    poolTamanho: l.pool_tamanho,
    avisos: l.avisos,
    kits: (kitsPorLoja.get(l.bcps) ?? []).map((k) => ({
      codigo: k.codigo,
      qtd: k.qtd,
      custo: num(k.custo),
      margem: num(k.margem),
      valorCheio: num(k.valor_cheio),
      descontoPct: num(k.desconto_pct),
      reaproveitado: k.reaproveitado,
      detalhes: k.detalhes as LojaSimulada["kits"][number]["detalhes"],
    })),
  }));
  return {
    ciclo: cabecalho.ciclo,
    semente: cabecalho.semente,
    geradaEm: cabecalho.criadoEm,
    pracas: cabecalho.pracas,
    parametros: cabecalho.parametros,
    metaCiclo: cabecalho.metaCiclo,
    metasPracas: cabecalho.metasPracas,
    lojas,
    kits,
    resumo: cabecalho.resumo,
  };
}
