// Declarações dos GVOs (F2b) — regras puras: estimativa do gerente × sistema e rótulos.
// Estimativa = sacolas declaradas × preço médio dos kits da praça (gravado pelo banco).
// Desvio % = (declarado − sistema) ÷ sistema; o valor oficial é o do sistema.
import type { Declaracao } from "@/lib/dados/tipos";

import type { VendaDia } from "./leitor";
import { estimadoNoPeriodo, type RuidoLoja } from "./ruido";

export const ROTULO_STATUS: Record<Declaracao["status"], string> = {
  pendente: "Pendente",
  aprovada: "Aprovada",
  recusada: "Recusada",
};

export const CLASSE_STATUS: Record<Declaracao["status"], string> = {
  pendente: "bg-warn-soft text-warn",
  aprovada: "bg-success-soft text-success-foreground",
  recusada: "bg-muted text-muted-foreground",
};

/** Declarado × sistema de uma declaração (sistema null = período sem vendas enviadas). */
export function comparar(
  d: Declaracao,
  vendas: { linhas: VendaDia[]; ruidos: RuidoLoja[]; ate: string | null } | null,
) {
  const declarado = d.sacolas * d.precoMedio;
  const sistema =
    vendas && vendas.ate && vendas.ate >= d.fim
      ? estimadoNoPeriodo(vendas.linhas, vendas.ruidos, d.bcps, d.inicio, d.fim)
      : null;
  const desvio = sistema === null ? null : sistema > 0 ? (declarado - sistema) / sistema : null;
  return { declarado, sistema, desvio };
}

export const fmtDesvio = (v: number | null) =>
  v === null ? "—" : `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
