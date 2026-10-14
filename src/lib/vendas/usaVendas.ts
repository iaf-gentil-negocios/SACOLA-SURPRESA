// Leituras de vendas do admin/Acompanhamento (F2b) e recálculo do ruído. Tudo resumido: vendas por
// loja e dia do período da campanha, o ruído do ciclo e os envios (só datas). Cache de 5 min.
import { useQuery } from "@tanstack/react-query";

import { repositorio } from "@/lib/dados";
import { hojeEmSaoPaulo } from "@/lib/dados/periodo";
import type { CicloMotor } from "@/lib/motor/metas";

import {
  calcularRuido,
  diasCobertos,
  janelaDoHistorico,
  vendasPorLoja,
  type VendaLoja,
} from "./ruido";

export const CHAVE_VENDAS = ["vendas"] as const;

/** Período das vendas do ciclo: do início da campanha (ou do ciclo) até o fim do ciclo. */
export function periodoDaCampanha(c: Pick<CicloMotor, "inicio" | "fim" | "inicioCampanha">) {
  return { inicio: c.inicioCampanha || c.inicio, fim: c.fim };
}

/** Último dia com vendas enviadas (null = nenhum envio ainda). */
export function vendasAte(envios: { fim: string }[]): string | null {
  return envios.reduce<string | null>((m, e) => (!m || e.fim > m ? e.fim : m), null);
}

export function useEnviosVendas() {
  return useQuery({
    queryKey: [...CHAVE_VENDAS, "envios"],
    queryFn: () => repositorio.vendasEnvios(),
  });
}

export interface VendasDoCiclo {
  /** null = nenhum envio de vendas ainda (aguardando vendas). */
  porLoja: Map<string, VendaLoja> | null;
  ate: string | null;
  inicio: string;
  fim: string;
  linhas: Awaited<ReturnType<typeof repositorio.vendasDiarias>>;
  ruidos: Awaited<ReturnType<typeof repositorio.ruidos>>;
}

export function useVendasDoCiclo(ciclo: CicloMotor | null) {
  const { data: envios } = useEnviosVendas();
  const p = ciclo ? periodoDaCampanha(ciclo) : null;
  const fimLido = p ? (p.fim < hojeEmSaoPaulo() ? p.fim : hojeEmSaoPaulo()) : "";
  return useQuery({
    queryKey: [...CHAVE_VENDAS, "ciclo", ciclo?.id, p?.inicio, fimLido, envios?.length],
    enabled: !!ciclo && !!envios,
    queryFn: async (): Promise<VendasDoCiclo> => {
      if (!envios!.length)
        return { porLoja: null, ate: null, inicio: p!.inicio, fim: p!.fim, linhas: [], ruidos: [] };
      const [linhas, ruidos] = await Promise.all([
        p!.inicio <= fimLido ? repositorio.vendasDiarias(p!.inicio, fimLido) : Promise.resolve([]),
        repositorio.ruidos(ciclo!.id),
      ]);
      return {
        porLoja: vendasPorLoja(linhas, ruidos, p!.inicio, p!.fim),
        ate: vendasAte(envios!),
        inicio: p!.inicio,
        fim: p!.fim,
        linhas,
        ruidos,
      };
    },
  });
}

/**
 * Recalcula e grava o ruído de cada ciclo (depois de um envio de vendas ou de mudar o início da
 * campanha). Lê só a janela de 8 semanas de cada ciclo.
 */
export async function recalcularRuido(ciclos: CicloMotor[]): Promise<number> {
  const cobertos = diasCobertos(await repositorio.vendasEnvios());
  let lojas = 0;
  for (const c of ciclos) {
    const { inicio } = periodoDaCampanha(c);
    const j = janelaDoHistorico(inicio);
    const r = calcularRuido(await repositorio.vendasDiarias(j.inicio, j.fim), inicio, cobertos);
    await repositorio.gravarRuido(c.id, inicio, r);
    lojas += new Set(r.map((x) => x.bcps)).size;
  }
  return lojas;
}
