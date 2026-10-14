// Dashboard "Dados gerais" do admin e do Acompanhamento (F2a, refeito em 12/10/2026) — regra pura.
// Entra só o que já vem somado por loja (resumo_lojas_da_base + plano_metas), o resumo de estoque e
// a hierarquia/perfis. Nada de kits ou itens. O que depende de vendas fica para a F2b.
import type { HierarquiaEPerfis, LojaDaBase } from "@/lib/dados/tipos";
import type { VendaLoja } from "@/lib/vendas/ruido";

import type { ResumoEstoqueLoja } from "./estoque";

export interface CadastroLoja {
  bcps: string;
  nome: string;
  nomeCompleto?: string | null | undefined;
  praca: string;
  ativo: boolean;
  participa: boolean;
}

/** Vendas (F2b): venda da Sacola estimada no período da campanha. */
export interface Realizado {
  /** Venda da Sacola estimada (R$) = venda do canal − ruído. */
  vendido: number;
  /** vendido ÷ preço médio dos kits da loja (ponderado pelas quantidades planejadas). */
  sacolas: number;
  /** Venda do canal App Delivery (GMV) e o ruído descontado. */
  canal: number;
  ruido: number;
  boletos: number;
}

/** Números do quadro "Meta" (e do "Realizado") de uma loja, praça ou do total. */
export interface NumerosMeta {
  /** Meta em R$ (receita da meta). */
  meta: number;
  /** Meta de sacolas vendidas (soma das "sacolas da meta"). */
  sacolasMeta: number;
  sacolasPlanejadas: number;
  receitaPlanejada: number;
  custoPlanejado: number;
  vendedoras: number;
  /** Soma do "pode montar hoje" (só lojas com disponibilidade gravada; null = nenhuma). */
  podeMontar: number | null;
  /** null = ainda sem vendas enviadas (aguardando vendas). */
  realizado?: Realizado | null | undefined;
}

export interface Derivados {
  /** Receita planejada ÷ sacolas planejadas. */
  precoMedio: number | null;
  /** (Receita − custo) planejados ÷ sacolas planejadas. */
  margemPorSacola: number | null;
  /** Margem sobre a receita planejada. */
  margemPct: number | null;
  /** Margem por sacola × meta de sacolas: a margem se a meta for batida. */
  margemDaMeta: number | null;
  sacolasPorSemana: number | null;
  sacolasPorVendedora: number | null;
  sacolasPorVendedoraSemana: number | null;
  /** Vendido ÷ meta (R$) e sacolas vendidas ÷ meta de sacolas (null sem vendas). */
  pctMeta: number | null;
  pctSacolas: number | null;
  /** Margem por sacola × sacolas vendidas. */
  margemRealizada: number | null;
}

export interface LinhaLojaPainel extends NumerosMeta {
  bcps: string;
  nome: string;
  /** Para a busca e a dica ao passar o mouse; a tabela mostra o abreviado. */
  nomeCompleto: string | null;
  praca: string;
  estoque: ResumoEstoqueLoja | null;
}

export interface LinhaPracaPainel extends NumerosMeta {
  praca: string;
  lojas: LinhaLojaPainel[];
}

export interface PainelAdmin {
  totais: NumerosMeta;
  pracas: LinhaPracaPainel[];
  lojas: LinhaLojaPainel[];
  /** Semanas do ciclo (dias ÷ 7). */
  semanas: number;
  disponivelRef: string | null;
  /** Lojas com sacolas planejadas abaixo da meta de sacolas (falta de estoque). */
  faltaEstoque: LinhaLojaPainel[];
}

const div = (a: number, b: number) => (b > 0 ? a / b : null);

const paraCima = (v: number | null) => (v === null ? null : Math.ceil(v - 1e-9));

export function derivados(n: NumerosMeta, semanas: number): Derivados {
  const margem = n.receitaPlanejada - n.custoPlanejado;
  const porSacola = div(margem, n.sacolasPlanejadas);
  const porSemana = div(n.sacolasMeta, semanas);
  return {
    precoMedio: div(n.receitaPlanejada, n.sacolasPlanejadas),
    margemPorSacola: porSacola,
    margemPct: div(margem, n.receitaPlanejada),
    margemDaMeta: porSacola === null ? null : porSacola * n.sacolasMeta,
    sacolasPorSemana: porSemana,
    // não existe meia sacola: por vendedora, sempre para cima (P2, 13/10/2026)
    sacolasPorVendedora: paraCima(div(n.sacolasMeta, n.vendedoras)),
    sacolasPorVendedoraSemana: porSemana === null ? null : paraCima(div(porSemana, n.vendedoras)),
    pctMeta: n.realizado ? div(n.realizado.vendido, n.meta) : null,
    pctSacolas: n.realizado ? div(n.realizado.sacolas, n.sacolasMeta) : null,
    margemRealizada: n.realizado && porSacola !== null ? porSacola * n.realizado.sacolas : null,
  };
}

export function somarMeta(xs: NumerosMeta[]): NumerosMeta {
  const com = xs.filter((x) => x.podeMontar !== null);
  const soma = (f: (x: NumerosMeta) => number) => xs.reduce((s, x) => s + f(x), 0);
  return {
    meta: soma((x) => x.meta),
    sacolasMeta: soma((x) => x.sacolasMeta),
    sacolasPlanejadas: soma((x) => x.sacolasPlanejadas),
    receitaPlanejada: soma((x) => x.receitaPlanejada),
    custoPlanejado: soma((x) => x.custoPlanejado),
    vendedoras: soma((x) => x.vendedoras),
    podeMontar: com.length ? com.reduce((s, x) => s + (x.podeMontar ?? 0), 0) : null,
    realizado: somarRealizado(xs.map((x) => x.realizado ?? null)),
  };
}

function somarRealizado(xs: (Realizado | null)[]): Realizado | null {
  const com = xs.filter((x): x is Realizado => x !== null);
  if (!com.length) return null;
  const soma = (f: (x: Realizado) => number) => com.reduce((s, x) => s + f(x), 0);
  return {
    vendido: soma((x) => x.vendido),
    sacolas: soma((x) => x.sacolas),
    canal: soma((x) => x.canal),
    ruido: soma((x) => x.ruido),
    boletos: soma((x) => x.boletos),
  };
}

/**
 * Realizado de uma loja: `vendas` null = ainda sem vendas enviadas; loja sem linha = venda 0.
 * Sacolas = R$ estimado ÷ preço médio dos kits da loja (receita ÷ sacolas planejadas).
 */
export function realizadoDaLoja(
  vendas: Map<string, VendaLoja> | null,
  bcps: string,
  receitaPlanejada: number,
  sacolasPlanejadas: number,
): Realizado | null {
  if (!vendas) return null;
  const v = vendas.get(bcps);
  const preco = sacolasPlanejadas > 0 ? receitaPlanejada / sacolasPlanejadas : 0;
  const vendido = v?.estimado ?? 0;
  return {
    vendido,
    sacolas: preco > 0 ? vendido / preco : 0,
    canal: v?.canal ?? 0,
    ruido: v?.ruido ?? 0,
    boletos: v?.boletos ?? 0,
  };
}

export function montarPainelAdmin(e: {
  lojasBase: LojaDaBase[];
  cadastro: CadastroLoja[];
  resumo: ResumoEstoqueLoja[];
  diasCiclo: number;
  /** F2b: venda estimada por loja no período da campanha (null = sem vendas enviadas). */
  vendas?: Map<string, VendaLoja> | null;
}): PainelAdmin {
  const cadastro = new Map(e.cadastro.map((l) => [l.bcps, l]));
  const resumo = new Map(e.resumo.map((r) => [r.bcps, r]));
  let disponivelRef: string | null = null;
  const lojas = e.lojasBase
    .map((l): LinhaLojaPainel => {
      if (l.disponivelRef && (!disponivelRef || l.disponivelRef > disponivelRef))
        disponivelRef = l.disponivelRef;
      return {
        bcps: l.bcps,
        nome: cadastro.get(l.bcps)?.nome ?? l.bcps,
        nomeCompleto: cadastro.get(l.bcps)?.nomeCompleto ?? null,
        praca: cadastro.get(l.bcps)?.praca ?? "",
        meta: l.meta,
        sacolasMeta: l.sacolasMeta,
        sacolasPlanejadas: l.sacolasPlanejadas,
        receitaPlanejada: l.receita,
        custoPlanejado: l.custo ?? 0,
        vendedoras: l.vendedoras,
        podeMontar: l.capacidade,
        realizado: realizadoDaLoja(e.vendas ?? null, l.bcps, l.receita, l.sacolasPlanejadas),
        estoque: resumo.get(l.bcps) ?? null,
      };
    })
    .sort((a, b) => a.praca.localeCompare(b.praca) || a.nome.localeCompare(b.nome));

  const porPraca = new Map<string, LinhaLojaPainel[]>();
  for (const l of lojas) porPraca.set(l.praca, [...(porPraca.get(l.praca) ?? []), l]);
  return {
    totais: somarMeta(lojas),
    pracas: [...porPraca.entries()].map(([praca, ls]) => ({
      praca,
      lojas: ls,
      ...somarMeta(ls),
    })),
    lojas,
    semanas: e.diasCiclo / 7,
    disponivelRef,
    faltaEstoque: lojas.filter((l) => l.sacolasPlanejadas < l.sacolasMeta),
  };
}

export interface GerenteSemLoja {
  nome: string;
  usuario: string;
  matricula: string | null;
}

export interface SaudeAcessos {
  /** Lojas que participam (e estão ativas) sem ninguém na dGerentes. */
  lojasSemGerente: CadastroLoja[];
  /**
   * Usuários gerentes ativos sem loja: sem matrícula ou com matrícula fora da hierarquia de todas
   * as lojas. Quem "vê todas as lojas" (diretoria) não entra.
   */
  gerentesSemLoja: GerenteSemLoja[];
}

const PERFIS_GERENTE = new Set(["gerente", "grvo", "gcvo_gpvo"]);

export function saudeDosAcessos(cadastro: CadastroLoja[], h: HierarquiaEPerfis): SaudeAcessos {
  const comGerente = new Set(h.vinculos.map((v) => v.bcps));
  const naHierarquia = new Set(h.vinculos.map((v) => v.matricula));
  return {
    lojasSemGerente: cadastro.filter((l) => l.participa && l.ativo && !comGerente.has(l.bcps)),
    gerentesSemLoja: h.perfis
      .filter(
        (p) =>
          p.ativo &&
          PERFIS_GERENTE.has(p.perfil) &&
          !p.ve_todas &&
          (!p.matricula || !naHierarquia.has(p.matricula)),
      )
      .map((p) => ({ nome: p.nome, usuario: p.usuario, matricula: p.matricula }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  };
}
