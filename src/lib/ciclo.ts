import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import { repositorio } from "@/lib/dados";
import type { CicloMotor } from "@/lib/motor/metas";

export type Ciclo = CicloMotor;

const CHAVE = "sacola.ciclo";
const CHAVE_QUERY = ["ciclo-escolhido"] as const;

export function useCiclos() {
  return useQuery({
    queryKey: ["ciclos"],
    queryFn: () => repositorio.ciclos(),
    staleTime: 10 * 60_000,
  });
}

/** Ciclo escolhido no menu: o mesmo em todas as páginas (lembrado neste navegador). */
export function useCicloSelecionado(ciclos: Ciclo[] | undefined) {
  const queryClient = useQueryClient();
  const { data: ciclo } = useQuery<number | null>({
    queryKey: CHAVE_QUERY,
    queryFn: () => null,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  useEffect(() => {
    const primeiro = ciclos?.[0];
    if (!ciclos || !primeiro || (ciclo !== null && ciclo !== undefined)) return;
    let salvo: number | null = null;
    try {
      salvo = Number(localStorage.getItem(CHAVE)) || null;
    } catch {
      // sem armazenamento: usa o primeiro ciclo
    }
    queryClient.setQueryData(CHAVE_QUERY, ciclos.some((c) => c.id === salvo) ? salvo : primeiro.id);
  }, [ciclos, ciclo, queryClient]);

  const escolher = useCallback(
    (id: number) => {
      queryClient.setQueryData(CHAVE_QUERY, id);
      try {
        localStorage.setItem(CHAVE, String(id));
      } catch {
        // sem armazenamento: vale só nesta visita
      }
    },
    [queryClient],
  );

  return [ciclo ?? null, escolher] as const;
}

export function periodoDoCiclo(c: Ciclo): string {
  const f = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);
  return `${f(c.inicio)}–${f(c.fim)}`;
}
