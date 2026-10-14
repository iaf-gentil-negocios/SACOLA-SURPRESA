// Ponto único de acesso aos dados das telas do admin, e os "hooks" de leitura.
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { MODO_LOCAL } from "@/lib/modo-local";
import type { ResultadoSimulacao } from "@/lib/motor/gerar";

import { repositorioLocal } from "./local";
import { repositorioNuvem } from "./nuvem";
import type { BaseDefinida, Repositorio } from "./tipos";

export const repositorio: Repositorio = MODO_LOCAL ? repositorioLocal : repositorioNuvem;

export const CHAVES = {
  ciclos: ["dados", "ciclos"],
  parametros: ["dados", "parametros"],
  lojas: ["dados", "lojas"],
  faturamento: ["dados", "faturamento"],
  simulacoes: (ciclo: number) => ["dados", "simulacoes", ciclo],
  bases: (ciclo: number) => ["dados", "bases", ciclo],
  /** Hierarquia (dGerentes) e perfis: um cache só para Lojas e Dados gerais (revisão de consumo). */
  hierarquia: ["dados", "hierarquia"],
  /** Simulação aberta na tela (gerada agora ou aberta das salvas), compartilhada entre as páginas. */
  simulacaoAtual: ["dados", "simulacao-atual"],
} as const;

export function useParametros() {
  return useQuery({ queryKey: CHAVES.parametros, queryFn: () => repositorio.parametros() });
}

export function useLojas() {
  return useQuery({
    queryKey: CHAVES.lojas,
    queryFn: () => repositorio.lojas(),
    staleTime: 5 * 60_000,
  });
}

/** Hierarquia e perfis (null no modo local). Relida depois de upload de gerentes ou mudança em Acessos. */
export function useHierarquiaEPerfis() {
  return useQuery({
    queryKey: CHAVES.hierarquia,
    queryFn: () => repositorio.hierarquiaEPerfis(),
  });
}

export function useFaturamento() {
  return useQuery({
    queryKey: CHAVES.faturamento,
    queryFn: () => repositorio.faturamento(),
    staleTime: 5 * 60_000,
  });
}

export function useSimulacoes(ciclo: number | null) {
  return useQuery({
    queryKey: CHAVES.simulacoes(ciclo ?? 0),
    enabled: ciclo !== null,
    queryFn: () => repositorio.listarSimulacoes(ciclo!),
  });
}

export function useBases(ciclo: number | null) {
  return useQuery({
    queryKey: CHAVES.bases(ciclo ?? 0),
    enabled: ciclo !== null,
    queryFn: () => repositorio.listarBases(ciclo!),
  });
}

export interface SimulacaoAtual {
  resultado: ResultadoSimulacao;
  /** id quando veio das salvas; null = gerada agora e ainda não salva. */
  salvaId: number | null;
  nome: string | null;
}

export function useSimulacaoAtual() {
  const queryClient = useQueryClient();
  const { data } = useQuery<SimulacaoAtual | null>({
    queryKey: CHAVES.simulacaoAtual,
    queryFn: () => null,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const definir = (s: SimulacaoAtual | null) => queryClient.setQueryData(CHAVES.simulacaoAtual, s);
  return [data ?? null, definir] as const;
}

/** Bases de todos os ciclos (pelo cache de cada ciclo), para a análise de divergências (F1b). */
export async function basesDeTodosOsCiclos(
  queryClient: QueryClient,
  ciclos: { id: number }[],
): Promise<BaseDefinida[]> {
  const listas = await Promise.all(
    ciclos.map((c) =>
      queryClient.fetchQuery({
        queryKey: CHAVES.bases(c.id),
        queryFn: () => repositorio.listarBases(c.id),
      }),
    ),
  );
  return listas.flat();
}
