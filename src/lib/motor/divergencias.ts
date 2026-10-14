// Divergências de estoque por loja (F1b) — regra pura, roda no navegador do admin depois de simular.
// Compara o estoque de hoje com duas referências: o dia anterior (Cobertura anterior) e o estoque
// de quando os kits da loja foram gerados.
//   🔴 Divergente: a capacidade de montar os kits atuais cai ≥ X% E pelo menos N kits.
//   🟡 Atenção: o estoque dos produtos dos kits cai ≥ X%, mesmo sem perder N kits.
// Também: capacidade abaixo do que falta da meta (até a parte de vendas = meta inteira da loja)
// e heróis novos fora dos kits (só informação).
import { capacidadeConjunta, podeMontar } from "./capacidade";

export type NivelDivergencia = "divergente" | "atencao" | "ok";

export interface KitParaAnalise {
  codigo: string;
  skus: string[];
  heroiSku: string;
}

export interface EntradaAnaliseLoja {
  bcps: string;
  nome: string;
  praca: string;
  kits: KitParaAnalise[];
  estoqueHoje: Map<string, number>;
  /** null = ainda não há foto do dia anterior (só existe a partir da 2ª Cobertura). */
  estoqueAnterior: Map<string, number> | null;
  estoqueGeracao: Map<string, number>;
  sacolasMeta: number;
  heroisPossiveis: string[];
  quedaPct: number;
  minKits: number;
}

export interface ProdutoAnalise {
  sku: string;
  geracao: number;
  anterior: number | null;
  hoje: number;
  /** Hoje abaixo da geração ou do dia anterior. */
  caiu: boolean;
}

export interface AnaliseLoja {
  bcps: string;
  nome: string;
  praca: string;
  nivel: NivelDivergencia;
  motivos: string[];
  capacidade: { geracao: number; anterior: number | null; hoje: number };
  estoque: { geracao: number; anterior: number | null; hoje: number };
  sacolasMeta: number;
  abaixoDaMeta: boolean;
  kits: { codigo: string; podeMontar: number }[];
  produtos: ProdutoAnalise[];
  heroisNovos: string[];
}

const pct = (de: number, para: number) => (de > 0 ? Math.round(((de - para) / de) * 100) : 0);

export function analisarLoja(e: EntradaAnaliseLoja): AnaliseLoja {
  const skus = [...new Set(e.kits.flatMap((k) => k.skus))].sort();
  const listas = e.kits.map((k) => k.skus);
  const soma = (m: Map<string, number>) => skus.reduce((s, x) => s + (m.get(x) ?? 0), 0);

  const capacidade = {
    geracao: capacidadeConjunta(listas, e.estoqueGeracao),
    anterior: e.estoqueAnterior ? capacidadeConjunta(listas, e.estoqueAnterior) : null,
    hoje: capacidadeConjunta(listas, e.estoqueHoje),
  };
  const estoque = {
    geracao: soma(e.estoqueGeracao),
    anterior: e.estoqueAnterior ? soma(e.estoqueAnterior) : null,
    hoje: soma(e.estoqueHoje),
  };

  const motivos: string[] = [];
  const refs: [string, number | null, number | null][] = [
    ["desde a geração dos kits", capacidade.geracao, estoque.geracao],
    ["desde o dia anterior", capacidade.anterior, estoque.anterior],
  ];
  let divergente = false;
  let atencao = false;
  for (const [quando, cap, est] of refs) {
    if (cap !== null && cap > 0) {
      const queda = cap - capacidade.hoje;
      if (pct(cap, capacidade.hoje) >= e.quedaPct && queda >= e.minKits) {
        divergente = true;
        motivos.push(
          `Kits: ${cap} → ${capacidade.hoje} (−${pct(cap, capacidade.hoje)}%, −${queda}) ${quando}`,
        );
      }
    }
    if (est !== null && est > 0 && pct(est, estoque.hoje) >= e.quedaPct) {
      atencao = true;
      motivos.push(
        `Estoque dos produtos dos kits: ${est} → ${estoque.hoje} (−${pct(est, estoque.hoje)}%) ${quando}`,
      );
    }
  }
  const abaixoDaMeta = e.kits.length > 0 && capacidade.hoje < e.sacolasMeta;
  if (abaixoDaMeta)
    motivos.push(`Capacidade abaixo do que falta da meta: ${capacidade.hoje} de ${e.sacolasMeta}`);

  const heroisDosKits = new Set(e.kits.map((k) => k.heroiSku));
  return {
    bcps: e.bcps,
    nome: e.nome,
    praca: e.praca,
    nivel: divergente ? "divergente" : atencao ? "atencao" : "ok",
    motivos,
    capacidade,
    estoque,
    sacolasMeta: e.sacolasMeta,
    abaixoDaMeta,
    kits: e.kits.map((k) => ({ codigo: k.codigo, podeMontar: podeMontar(k.skus, e.estoqueHoje) })),
    produtos: skus.map((sku) => {
      const geracao = e.estoqueGeracao.get(sku) ?? 0;
      const anterior = e.estoqueAnterior ? (e.estoqueAnterior.get(sku) ?? 0) : null;
      const hoje = e.estoqueHoje.get(sku) ?? 0;
      return {
        sku,
        geracao,
        anterior,
        hoje,
        caiu: hoje < geracao || (anterior !== null && hoje < anterior),
      };
    }),
    heroisNovos: e.heroisPossiveis.filter((s) => !heroisDosKits.has(s)),
  };
}

/** Ordem da lista: divergentes, atenção, depois o resto; dentro, por praça e nome. */
export function ordenarAnalises(lista: AnaliseLoja[]): AnaliseLoja[] {
  const peso = { divergente: 0, atencao: 1, ok: 2 };
  return [...lista].sort(
    (a, b) =>
      peso[a.nivel] - peso[b.nivel] ||
      a.praca.localeCompare(b.praca) ||
      a.nome.localeCompare(b.nome),
  );
}
