// Vendas e declarações na área do gerente (F2b). O banco filtra pelo escopo (RLS): o gerente lê só
// as vendas, o ruído e as declarações das lojas dele, sem custo. Só o GVO da loja declara.
// "Ver como": o admin lê tudo e aqui filtramos pelo escopo do gerente escolhido (não declara).
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Declaracao } from "@/lib/dados/tipos";
import { hojeEmSaoPaulo } from "@/lib/dados/periodo";
import { MODO_LOCAL } from "@/lib/modo-local";
import type { CicloMotor } from "@/lib/motor/metas";
import type { VendaDia } from "@/lib/vendas/leitor";
import { vendasPorLoja, type RuidoLoja, type VendaLoja } from "@/lib/vendas/ruido";

import { lojasDe, type VisaoGerente } from "./visao";

export interface VendasGerente {
  /** null = nenhuma venda enviada ainda. */
  porLoja: Map<string, VendaLoja> | null;
  ate: string | null;
  linhas: VendaDia[];
  ruidos: RuidoLoja[];
}

const local = () => import("@/lib/dados/local");

async function lerVendas(ciclo: CicloMotor, visao: VisaoGerente): Promise<VendasGerente> {
  const inicio = ciclo.inicioCampanha || ciclo.inicio;
  const hoje = hojeEmSaoPaulo();
  const fim = ciclo.fim < hoje ? ciclo.fim : hoje;
  let envios: { fim: string }[];
  let linhas: VendaDia[] = [];
  let ruidos: RuidoLoja[] = [];
  if (MODO_LOCAL) {
    const { repositorioLocal } = await local();
    envios = await repositorioLocal.vendasEnvios();
    if (envios.length && inicio <= fim) linhas = await repositorioLocal.vendasDiarias(inicio, fim);
    ruidos = await repositorioLocal.ruidos(ciclo.id);
  } else {
    // tabelas do 0002j, ainda fora do types.ts
    const e = await supabase
      .from("vendas_envios" as never)
      .select("fim")
      .order("fim" as never, { ascending: false })
      .limit(1);
    if (e.error) throw new Error(e.error.message);
    envios = (e.data ?? []) as unknown as { fim: string }[];
    if (envios.length) {
      const [v, r] = await Promise.all([
        inicio <= fim
          ? supabase
              .from("vendas_canal_dia" as never)
              .select("bcps, dia, gmv, boletos, itens")
              .gte("dia" as never, inicio as never)
              .lte("dia" as never, fim as never)
              .limit(20000)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("ruido_lojas" as never)
          .select("bcps, dow, ruido, dias_historico, outliers")
          .eq("ciclo" as never, ciclo.id as never)
          .limit(5000),
      ]);
      const erro = v.error ?? r.error;
      if (erro) throw new Error(erro.message);
      linhas = ((v.data ?? []) as unknown as VendaDia[]).map((x) => ({
        ...x,
        gmv: Number(x.gmv),
        itens: Number(x.itens),
      }));
      ruidos = ((r.data ?? []) as unknown as RuidoLoja[]).map((x) => ({
        ...x,
        ruido: Number(x.ruido),
      }));
    }
  }
  if (visao.verComo && !MODO_LOCAL) {
    const escopo = new Set(await lojasDe(visao.userId));
    linhas = linhas.filter((l) => escopo.has(l.bcps));
    ruidos = ruidos.filter((r) => escopo.has(r.bcps));
  }
  if (!envios.length) return { porLoja: null, ate: null, linhas: [], ruidos: [] };
  return {
    porLoja: vendasPorLoja(linhas, ruidos, inicio, ciclo.fim),
    ate: envios.reduce<string | null>((m, x) => (!m || x.fim > m ? x.fim : m), null),
    linhas,
    ruidos,
  };
}

export function useVendasGerente(ciclo: CicloMotor | null, visao: VisaoGerente) {
  return useQuery({
    queryKey: ["gerente", visao.userId, "vendas", ciclo?.id, ciclo?.inicioCampanha],
    enabled: !!ciclo,
    queryFn: () => lerVendas(ciclo!, visao),
  });
}

/** Declarações do ciclo nas lojas do escopo (GVO, GCVO/GPVO, GRVO e diretoria veem). */
export function useDeclaracoesGerente(ciclo: number | null, visao: VisaoGerente) {
  return useQuery({
    queryKey: ["gerente", visao.userId, "declaracoes", ciclo],
    enabled: ciclo !== null,
    queryFn: async (): Promise<Declaracao[]> => {
      if (MODO_LOCAL) return (await local()).repositorioLocal.declaracoes(ciclo!);
      const { lerDeclaracoes } = await import("@/lib/dados/nuvem");
      const todas = await lerDeclaracoes(ciclo!);
      if (!visao.verComo) return todas;
      const escopo = new Set(await lojasDe(visao.userId));
      return todas.filter((d) => escopo.has(d.bcps));
    },
  });
}

/** Lojas em que o usuário é o GVO (só ele declara). "Ver como" não declara. */
export function useLojasGvo(visao: VisaoGerente) {
  return useQuery({
    queryKey: ["gerente", visao.userId, "lojas-gvo"],
    queryFn: async (): Promise<string[]> => {
      if (visao.verComo) return [];
      // modo local: o teste vale como GVO de todas as lojas
      if (MODO_LOCAL)
        return (await (await local()).repositorioLocal.lojas())
          .filter((l) => l.participa)
          .map((l) => l.bcps);
      const { data, error } = await supabase.rpc("minhas_lojas_gvo" as never);
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as (string | { minhas_lojas_gvo: string })[]).map((x) =>
        typeof x === "string" ? x : x.minhas_lojas_gvo,
      );
    },
  });
}

export interface NovaDeclaracao {
  bcps: string;
  ciclo: number;
  tipo: "dia" | "semana";
  inicio: string;
  sacolas: number;
}

const somarDias = (iso: string, n: number) =>
  new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/** Declara (o banco grava o dono, o status e o preço médio dos kits da praça). */
export async function declarar(d: NovaDeclaracao, precoMedioLocal?: number): Promise<void> {
  const fim = d.tipo === "semana" ? somarDias(d.inicio, 6) : d.inicio;
  if (MODO_LOCAL) {
    const { ler, gravar } = await local();
    const lista = await ler<Declaracao[]>("declaracoes", []);
    if (
      lista.some(
        (x) =>
          x.bcps === d.bcps && x.inicio === d.inicio && x.fim === fim && x.status !== "recusada",
      )
    )
      throw new Error("Já existe uma declaração desta loja para este período.");
    await gravar("declaracoes", [
      ...lista,
      {
        id: lista.reduce((m, x) => Math.max(m, x.id), 0) + 1,
        userId: "local",
        bcps: d.bcps,
        ciclo: d.ciclo,
        tipo: d.tipo,
        inicio: d.inicio,
        fim,
        sacolas: d.sacolas,
        precoMedio: Math.round((precoMedioLocal ?? 0) * 100) / 100,
        status: "pendente",
        motivo: null,
        criadoEm: new Date().toISOString(),
        decididoEm: null,
      } satisfies Declaracao,
    ]);
    return;
  }
  const { error } = await supabase.from("declaracoes_vendas" as never).insert({
    bcps: d.bcps,
    ciclo: d.ciclo,
    tipo: d.tipo,
    inicio: d.inicio,
    fim,
    sacolas: d.sacolas,
  } as never);
  if (error)
    throw new Error(
      error.code === "23505"
        ? "Já existe uma declaração desta loja para este período."
        : error.message,
    );
}

/** O GVO apaga a própria declaração enquanto está pendente. */
export async function apagarDeclaracao(id: number): Promise<void> {
  if (MODO_LOCAL) {
    const { ler, gravar } = await local();
    const lista = await ler<Declaracao[]>("declaracoes", []);
    await gravar(
      "declaracoes",
      lista.filter((x) => !(x.id === id && x.status === "pendente")),
    );
    return;
  }
  const { error } = await supabase
    .from("declaracoes_vendas" as never)
    .delete()
    .eq("id" as never, id as never);
  if (error) throw new Error(error.message);
}
