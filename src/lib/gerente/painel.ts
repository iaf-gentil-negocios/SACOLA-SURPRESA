// Dados do Painel do gerente (F2a, refeito em 12/10/2026): uma linha por loja do escopo, já somada
// no banco (resumo_lojas_da_base, sem custo para o gerente), mais as metas. Os kits só são baixados
// se ele abrir Kits ou o Simulador por kits.
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { MODO_LOCAL } from "@/lib/modo-local";
import type { CicloMotor } from "@/lib/motor/metas";

import { metasDaBase, type BaseGerente } from "./base";
import { lojasDe, type VisaoGerente } from "./visao";

export interface LojaPainelGerente {
  bcps: string;
  nome: string;
  praca: string;
  cidade?: string | null;
  uf?: string | null;
  meta: number;
  vendedoras: number;
  /** "AAAA-MM" → meta do mês (parte deste ciclo). */
  metasMes: Record<string, number>;
  sacolasMeta: number;
  sacolasPlanejadas: number;
  receitaPlanejada: number;
  /** "Pode montar hoje" (null = disponibilidade ainda não gravada). */
  podeMontar: number | null;
}

export interface DadosPainelGerente {
  base: BaseGerente;
  ciclo: CicloMotor | null;
  lojas: LojaPainelGerente[];
  pracas: string[];
  disponivelRef: string | null;
}

export function montarDadosPainel(
  base: BaseGerente,
  ciclo: DadosPainelGerente["ciclo"],
  lojas: LojaPainelGerente[],
  disponivelRef: string | null,
): DadosPainelGerente {
  const ordenadas = [...lojas].sort(
    (a, b) => a.praca.localeCompare(b.praca) || a.nome.localeCompare(b.nome),
  );
  return {
    base,
    ciclo,
    lojas: ordenadas,
    pracas: [...new Set(ordenadas.map((l) => l.praca))].filter(Boolean).sort(),
    disponivelRef,
  };
}

async function lerNuvem(
  queryClient: QueryClient,
  base: BaseGerente,
  visao: VisaoGerente,
): Promise<DadosPainelGerente> {
  type Resumo = {
    bcps: string;
    sacolas_meta: number;
    sacolas_planejadas: number;
    receita: number;
    capacidade: number | null;
    disponivel_ref: string | null;
  };
  const [resumo, { metas, mensais, lojas, ciclo }] = await Promise.all([
    // função do 0002f (fora do types.ts): o banco já filtra o escopo e não entrega custo
    supabase.rpc("resumo_lojas_da_base" as never, { p_plano: base.id } as never),
    // metas, lojas e ciclo: a mesma leitura (e o mesmo cache) de Kits e do Simulador
    metasDaBase(queryClient, base, visao.userId),
  ]);
  if (resumo.error) throw new Error(resumo.error.message);
  // gerente logado: o banco já filtrou; "ver como": escopo do gerente escolhido
  const escopo = visao.verComo ? new Set(await lojasDe(visao.userId)) : null;
  const metaDe = new Map(metas.map((m) => [m.bcps, m]));
  const cadastro = new Map(lojas.map((l) => [l.bcps, l]));
  const meses = new Map<string, Record<string, number>>();
  for (const m of mensais) {
    const r = meses.get(m.bcps) ?? {};
    r[m.mes.slice(0, 7)] = Number(m.meta);
    meses.set(m.bcps, r);
  }
  let ref: string | null = null;
  const linhas = ((resumo.data ?? []) as unknown as Resumo[])
    .filter((r) => !escopo || escopo.has(r.bcps))
    .map((r): LojaPainelGerente => {
      if (r.disponivel_ref && (!ref || r.disponivel_ref > ref)) ref = r.disponivel_ref;
      return {
        bcps: r.bcps,
        nome: cadastro.get(r.bcps)?.nome ?? r.bcps,
        praca: cadastro.get(r.bcps)?.praca ?? "",
        cidade: (cadastro.get(r.bcps) as { cidade?: string | null } | undefined)?.cidade ?? null,
        uf: (cadastro.get(r.bcps) as { uf?: string | null } | undefined)?.uf ?? null,
        meta: Number(metaDe.get(r.bcps)?.meta ?? 0),
        vendedoras: metaDe.get(r.bcps)?.vendedoras ?? 0,
        metasMes: meses.get(r.bcps) ?? {},
        sacolasMeta: r.sacolas_meta,
        sacolasPlanejadas: r.sacolas_planejadas,
        receitaPlanejada: Number(r.receita),
        podeMontar: r.capacidade,
      };
    });
  return montarDadosPainel(base, ciclo, linhas, ref);
}

export function usePainelGerente(base: BaseGerente | null, visao: VisaoGerente) {
  const queryClient = useQueryClient();
  return useQuery({
    // a versão dos kits entra na chave: troca de kits na base = releitura
    queryKey: ["gerente", visao.userId, "painel", base?.id, base?.kitsVersao],
    enabled: !!base,
    queryFn: async () =>
      MODO_LOCAL
        ? (await import("./local")).painelLocal(base!)
        : lerNuvem(queryClient, base!, visao),
  });
}
