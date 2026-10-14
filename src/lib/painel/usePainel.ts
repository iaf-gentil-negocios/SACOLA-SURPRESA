// Leituras do dashboard do admin/Acompanhamento (F2a, refeito em 12/10/2026). Tudo resumido e
// guardado por 5 min (padrão do app): uma linha por loja da base (resumo_lojas_da_base +
// plano_metas), o resumo de estoque e a hierarquia/perfis. Nada de kits, itens ou da Cobertura.
import { useQuery } from "@tanstack/react-query";

import { repositorio } from "@/lib/dados";
import type { BaseDefinida } from "@/lib/dados/tipos";
import { hojeEmSaoPaulo } from "@/lib/dados/periodo";

import { resumoMaisRecente } from "./estoque";

/** Base do painel: a atual do ciclo; sem atual, a próxima; sem nenhuma, null. */
export function baseDoPainel(bases: BaseDefinida[], hoje = hojeEmSaoPaulo()): BaseDefinida | null {
  return (
    bases.find((b) => b.inicio <= hoje && b.fim >= hoje) ??
    [...bases].filter((b) => b.inicio > hoje).sort((a, b) => a.inicio.localeCompare(b.inicio))[0] ??
    null
  );
}

export function useDadosDaBasePainel(base: BaseDefinida | null) {
  return useQuery({
    queryKey: ["painel", "base", base?.id],
    enabled: !!base,
    queryFn: () => repositorio.lojasDaBase(base!.id),
  });
}

export function useResumoEstoque() {
  return useQuery({
    queryKey: ["painel", "resumo-estoque"],
    queryFn: async () => resumoMaisRecente(await repositorio.resumoEstoque()),
  });
}

export { useHierarquiaEPerfis } from "@/lib/dados";
