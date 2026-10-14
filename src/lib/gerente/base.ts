// Dados do gerente: bases já iniciadas (atual + histórico) e o conteúdo da base escolhida.
// A RLS do banco entrega só as lojas do escopo do gerente e só bases já iniciadas.
// "Ver como gerente" (admin): a RLS entrega tudo; aqui filtramos pelo escopo do gerente escolhido
// (função lojas_de) e as bases futuras aparecem também. Nenhuma tabela com custo ou margem é lida.
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { hojeEmSaoPaulo } from "@/lib/dados/periodo";
import type { CicloMotor } from "@/lib/motor/metas";
import { MODO_LOCAL } from "@/lib/modo-local";

import { lojasDe, type VisaoGerente } from "./visao";

export interface BaseGerente {
  id: number;
  ciclo: number;
  nome: string;
  inicio: string;
  fim: string;
  /** Muda a cada troca de kits na base (F1b): a base é relida quando muda. */
  kitsVersao: string | null;
}

export interface MetaLojaGerente {
  bcps: string;
  nome: string;
  praca: string;
  meta: number;
  vendedoras: number;
  metaSemana: number;
  metaVendSemana: number | null;
  metasMes: Record<string, number>; // "AAAA-MM" → meta do mês (parte deste ciclo)
}

export interface ItemKitGerente {
  ordem: number;
  papel: "heroi" | "surpresa" | "mimo";
  sku: string;
  descricao: string;
  precoItem: number;
}

export interface KitGerente {
  codigo: string;
  tema: string;
  preco: number;
  valorCheio: number;
  descontoPct: number;
  itens: ItemKitGerente[];
  /** Quantidade por loja do escopo e "pode montar N" com o estoque do dia (null = sem dado). */
  lojas: { bcps: string; qtd: number; disponivel: number | null }[];
}

export interface DadosBase {
  base: BaseGerente;
  ciclo: CicloMotor | null;
  lojas: MetaLojaGerente[];
  kits: KitGerente[];
  pracas: string[];
  /** Capacidade total de cada loja: os kits dividem produtos; no total dá para montar X. */
  capacidadeLoja: Record<string, number>;
  /** Data da Cobertura usada na disponibilidade (null = ainda sem disponibilidade). */
  disponivelRef: string | null;
}

const PAGINA = 1000;
async function todas<T>(
  consulta: (
    de: number,
    ate: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const r: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    r.push(...(data ?? []));
    if (!data || data.length < PAGINA) return r;
  }
}

export function useBasesGerente(visao: VisaoGerente) {
  return useQuery({
    queryKey: ["gerente", visao.userId, "bases"],
    // base nova aparece em até 10 min (ou ao recarregar a página)
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<BaseGerente[]> => {
      if (MODO_LOCAL) return (await import("./local")).basesLocais();
      // kits_versao (F1b, 0002d) ainda não está no types.ts
      const { data, error } = await supabase
        .from("planos")
        .select("id, ciclo, nome, inicio, fim, kits_versao" as "*")
        .not("inicio", "is", null)
        .order("inicio", { ascending: false });
      if (error) throw new Error(error.message);
      return (data as unknown as ((typeof data)[number] & { kits_versao?: string | null })[]).map(
        (b) => ({
          id: b.id,
          ciclo: b.ciclo,
          nome: b.nome ?? `Base ${b.id}`,
          inicio: b.inicio!,
          fim: b.fim!,
          kitsVersao: b.kits_versao ?? null,
        }),
      );
    },
  });
}

/** Base atual = a que contém hoje; senão, a mais recente já iniciada. */
export function baseAtual(bases: BaseGerente[], hoje = hojeEmSaoPaulo()): BaseGerente | null {
  return bases.find((b) => b.inicio <= hoje && b.fim >= hoje) ?? bases[0] ?? null;
}

const CHAVE_ESCOLHIDA = ["gerente", "base-escolhida"] as const;

/** Base escolhida (padrão: a atual), a mesma em todas as páginas do gerente. */
export function useBaseEscolhida(bases: BaseGerente[] | undefined) {
  const queryClient = useQueryClient();
  const { data: id } = useQuery<number | null>({
    queryKey: CHAVE_ESCOLHIDA,
    queryFn: () => null,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  useEffect(() => {
    if (!bases?.length || (id && bases.some((b) => b.id === id))) return;
    queryClient.setQueryData(CHAVE_ESCOLHIDA, baseAtual(bases)?.id ?? null);
  }, [bases, id, queryClient]);
  const escolher = useCallback(
    (novo: number) => queryClient.setQueryData(CHAVE_ESCOLHIDA, novo),
    [queryClient],
  );
  return [bases?.find((b) => b.id === id) ?? null, escolher] as const;
}

/**
 * Metas da base (por loja e por mês), lojas e ciclo: lidas uma vez e divididas entre o Painel e as
 * telas com kits (revisão de consumo, item 7). A base é congelada: vale enquanto a página estiver aberta.
 */
export function metasDaBase(queryClient: QueryClient, base: BaseGerente, userId: string) {
  return queryClient.ensureQueryData({
    queryKey: ["gerente", userId, "metas", base.id],
    staleTime: Infinity,
    queryFn: async () => {
      const [metas, mensais, lojas, ciclo] = await Promise.all([
        todas((de, ate) =>
          supabase
            .from("plano_metas")
            .select("bcps, meta, vendedoras, meta_semana, meta_vend_semana")
            .eq("plano_id", base.id)
            .range(de, ate),
        ),
        todas((de, ate) =>
          supabase
            .from("base_metas_mensais")
            .select("bcps, mes, meta")
            .eq("plano_id", base.id)
            .range(de, ate),
        ),
        // cidade e UF (0002f) ainda fora do types.ts: para o mapa do Painel
        todas((de, ate) =>
          supabase
            .from("lojas")
            .select("bcps, nome, praca, cidade, uf" as "bcps, nome, praca")
            .range(de, ate),
        ),
        // "*": inclui inicio_campanha (F2b, 0002j), que ainda não está no types.ts
        supabase.from("ciclos").select("*").eq("id", base.ciclo).maybeSingle(),
      ]);
      if (ciclo.error) throw new Error(ciclo.error.message);
      const c = ciclo.data as
        | ({ id: number; nome: string; inicio: string; fim: string } & {
            inicio_campanha?: string | null;
          })
        | null;
      return {
        metas,
        mensais,
        lojas,
        ciclo: c && {
          id: c.id,
          nome: c.nome,
          inicio: c.inicio,
          fim: c.fim,
          inicioCampanha: c.inicio_campanha ?? null,
        },
      };
    },
  });
}

export function useDadosBase(base: BaseGerente | null, visao: VisaoGerente) {
  const queryClient = useQueryClient();
  return useQuery({
    // a versão dos kits entra na chave: troca de kits na base (F1b) = releitura
    queryKey: ["gerente", visao.userId, "base", base?.id, base?.kitsVersao],
    enabled: !!base,
    // a base definida é congelada: lida uma vez enquanto a página estiver aberta
    staleTime: Infinity,
    queryFn: async (): Promise<DadosBase> => {
      if (MODO_LOCAL) return (await import("./local")).dadosBaseLocal(base!);
      const id = base!.id;
      const [
        { metas: todasMetas, mensais: todasMensais, lojas, ciclo },
        todosKitLojas,
        todosKits,
        todosItens,
      ] = await Promise.all([
        metasDaBase(queryClient, base!, visao.userId),
        todas((de, ate) =>
          supabase
            .from("base_kit_lojas")
            // colunas da F1b (0002d) ainda fora do types.ts
            .select("codigo, bcps, qtd, disponivel, capacidade_loja, disponivel_ref" as "*")
            .eq("plano_id", id)
            .range(de, ate),
        ),
        todas((de, ate) =>
          supabase
            .from("base_kits")
            .select("codigo, tema, preco, valor_cheio, desconto_pct")
            .eq("plano_id", id)
            .order("codigo")
            .range(de, ate),
        ),
        todas((de, ate) =>
          supabase
            .from("base_kit_itens")
            .select("codigo, ordem, papel, sku, descricao, preco_item")
            .eq("plano_id", id)
            .range(de, ate),
        ),
      ]);
      // gerente logado: a RLS já filtrou; "ver como": filtra pelo escopo do gerente escolhido
      const escopo = visao.verComo ? new Set(await lojasDe(visao.userId)) : null;
      const doEscopo = <T extends { bcps: string }>(xs: T[]) =>
        escopo ? xs.filter((x) => escopo.has(x.bcps)) : xs;
      const metas = doEscopo(todasMetas);
      const mensais = doEscopo(todasMensais);
      const kitLojas = doEscopo(todosKitLojas);
      const comLoja = new Set(kitLojas.map((k) => k.codigo));
      const kits = escopo ? todosKits.filter((k) => comLoja.has(k.codigo)) : todosKits;
      const itens = escopo ? todosItens.filter((i) => comLoja.has(i.codigo)) : todosItens;
      const nomeLoja = new Map(lojas.map((l) => [l.bcps, l]));
      const mesesPor = new Map<string, Record<string, number>>();
      for (const m of mensais) {
        const r = mesesPor.get(m.bcps) ?? {};
        r[m.mes.slice(0, 7)] = Number(m.meta);
        mesesPor.set(m.bcps, r);
      }
      const lojasMeta: MetaLojaGerente[] = metas
        .map((m) => ({
          bcps: m.bcps,
          nome: nomeLoja.get(m.bcps)?.nome ?? m.bcps,
          praca: nomeLoja.get(m.bcps)?.praca ?? "",
          meta: Number(m.meta),
          vendedoras: m.vendedoras,
          metaSemana: Number(m.meta_semana ?? 0),
          metaVendSemana: m.meta_vend_semana === null ? null : Number(m.meta_vend_semana),
          metasMes: mesesPor.get(m.bcps) ?? {},
        }))
        .sort((a, b) => a.praca.localeCompare(b.praca) || a.nome.localeCompare(b.nome));

      const itensPor = new Map<string, ItemKitGerente[]>();
      for (const i of itens) {
        itensPor.set(i.codigo, [
          ...(itensPor.get(i.codigo) ?? []),
          {
            ordem: i.ordem,
            papel: i.papel,
            sku: i.sku,
            descricao: i.descricao,
            precoItem: Number(i.preco_item),
          },
        ]);
      }
      // colunas da F1b (0002d): disponibilidade e capacidade da loja
      type Disp = {
        disponivel?: number | null;
        capacidade_loja?: number | null;
        disponivel_ref?: string | null;
      };
      const lojasPor = new Map<string, KitGerente["lojas"]>();
      const capacidadeLoja: Record<string, number> = {};
      let disponivelRef: string | null = null;
      for (const k of kitLojas as ((typeof kitLojas)[number] & Disp)[]) {
        lojasPor.set(k.codigo, [
          ...(lojasPor.get(k.codigo) ?? []),
          { bcps: k.bcps, qtd: k.qtd, disponivel: k.disponivel ?? null },
        ]);
        if (k.capacidade_loja !== null && k.capacidade_loja !== undefined)
          capacidadeLoja[k.bcps] = k.capacidade_loja;
        if (k.disponivel_ref && (!disponivelRef || k.disponivel_ref > disponivelRef))
          disponivelRef = k.disponivel_ref;
      }

      return {
        base: base!,
        ciclo,
        lojas: lojasMeta,
        kits: kits.map((k) => ({
          codigo: k.codigo,
          tema: k.tema,
          preco: Number(k.preco),
          valorCheio: Number(k.valor_cheio),
          descontoPct: Number(k.desconto_pct),
          itens: (itensPor.get(k.codigo) ?? []).sort((a, b) => a.ordem - b.ordem),
          lojas: lojasPor.get(k.codigo) ?? [],
        })),
        pracas: [...new Set(lojasMeta.map((l) => l.praca))].filter(Boolean).sort(),
        capacidadeLoja,
        disponivelRef,
      };
    },
  });
}

/** Lojas (do escopo) filtradas por praça. */
export function filtrarPorPraca<T extends { praca: string }>(itens: T[], praca: string) {
  return praca ? itens.filter((x) => x.praca === praca) : itens;
}
