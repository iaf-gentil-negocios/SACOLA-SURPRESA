// Regras do período de uma base (as mesmas do gatilho `validar_periodo_base` no banco).
// Desde 11/10/2026 (SQL 0002c): datas livres; fora do ciclo só gera aviso. Bloqueia fim antes do
// início e sobreposição com outra base do mesmo ciclo.
import type { CicloMotor } from "@/lib/motor/metas";

export interface PeriodoExistente {
  id: number;
  inicio: string;
  fim: string;
}

const fmt = (d: string) => d.split("-").reverse().join("/");

/** Devolve a mensagem de erro (bloqueia), ou null se o período vale. */
export function erroDoPeriodo(
  ciclo: CicloMotor,
  inicio: string,
  fim: string,
  existentes: PeriodoExistente[],
): string | null {
  if (!inicio || !fim || fim < inicio)
    return "Período da base inválido: informe início e fim (fim depois do início).";
  const choca = existentes.find((b) => b.inicio <= fim && b.fim >= inicio);
  if (choca) return "Já existe uma base deste ciclo com período que se sobrepõe a este.";
  return null;
}

/** Aviso (não bloqueia): período fora do ciclo. */
export function avisoDoPeriodo(ciclo: CicloMotor, inicio: string, fim: string): string | null {
  if (!inicio || !fim || fim < inicio) return null;
  if (inicio < ciclo.inicio || fim > ciclo.fim)
    return `Período fora do ${ciclo.nome} (${fmt(ciclo.inicio)} a ${fmt(ciclo.fim)}). Dá para definir mesmo assim; a meta continua a do ciclo.`;
  return null;
}

/** Data de hoje em São Paulo (AAAA-MM-DD), como o banco usa para "base já iniciada". */
export function hojeEmSaoPaulo(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

export type SituacaoBase = "atual" | "futura" | "encerrada";

export function situacaoDaBase(
  b: { inicio: string; fim: string },
  hoje = hojeEmSaoPaulo(),
): SituacaoBase {
  if (b.inicio > hoje) return "futura";
  if (b.fim < hoje) return "encerrada";
  return "atual";
}

/**
 * Bases para a análise de divergências (F1b): as atuais (período contém hoje), uma por ciclo; sem
 * nenhuma atual, a próxima a começar. Mais de uma = seletor na tela, começando pelo ciclo do menu.
 */
export function basesParaAnalise<T extends { ciclo: number; inicio: string; fim: string }>(
  bases: T[],
  cicloMenu: number | null,
  hoje = hojeEmSaoPaulo(),
): T[] {
  const ordem = (a: T, b: T) =>
    Number(b.ciclo === cicloMenu) - Number(a.ciclo === cicloMenu) || a.ciclo - b.ciclo;
  const atuais = bases.filter((b) => situacaoDaBase(b, hoje) === "atual").sort(ordem);
  if (atuais.length) return atuais;
  const proxima = bases
    .filter((b) => b.inicio > hoje)
    .sort((a, b) => a.inicio.localeCompare(b.inicio) || ordem(a, b))[0];
  return proxima ? [proxima] : [];
}
