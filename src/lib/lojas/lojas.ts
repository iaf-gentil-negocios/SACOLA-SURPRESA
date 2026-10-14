// Lojas com as colunas da parte B (participa, tipo da dCentros, SAP, centro de custo, marca).
// Essas colunas entraram pelo SQL editor (drizzle/migrations/0002a_lojas_participacao.sql), que
// não regenera o types.ts do Lovable. Por isso o tipo delas fica declarado aqui, num lugar só,
// e as leituras/gravações dessas colunas passam por este arquivo. Regras puras: ./regras.ts.
import { supabase } from "@/integrations/supabase/client";
import { MODO_LOCAL } from "@/lib/modo-local";
import type { Database } from "@/integrations/supabase/types";

type LinhaLoja = Database["public"]["Tables"]["lojas"]["Row"];

export interface ColunasParteB {
  participa: boolean;
  tipo_dcentros: string | null;
  sap: string | null;
  centro_custo: string | null;
  marca: string | null;
  /** 0002i: nome completo da dCentros (null em lojas gravadas antes). */
  nome_completo: string | null;
}

/** `tipo` técnico: o types.ts ainda não tem o valor `outro` (Venda Direta e Escritório). */
export type LojaCompleta = Omit<LinhaLoja, "tipo"> & { tipo: string } & ColunasParteB;

/** Chave do react-query da tela Lojas (a tela Bases também a recarrega). */
export const CHAVE_LOJAS_COMPLETAS = ["lojas-completas"] as const;

export async function lerLojasCompletas(): Promise<LojaCompleta[]> {
  if (MODO_LOCAL) {
    // modo local: as lojas da seed, só para conferir a tela (a gravação só vale na nuvem)
    const { repositorioLocal } = await import("@/lib/dados/local");
    return (await repositorioLocal.lojas()).map(
      (l) =>
        ({
          ...l,
          divisao: null,
          canal_geral: null,
          canais: [],
          atualizado_em: "",
          tipo_dcentros: l.tipo === "loja" ? "Varejo" : "HUB",
          sap: null,
          centro_custo: null,
          marca: null,
          nome_completo: l.nomeCompleto ?? null,
        }) as unknown as LojaCompleta,
    );
  }
  const { data, error } = await supabase.from("lojas").select("*").order("praca").order("nome");
  if (error) throw new Error(error.message);
  return (data as unknown as Partial<LojaCompleta>[]).map((l) => ({
    ...(l as LojaCompleta),
    participa: l.participa ?? false,
    tipo_dcentros: l.tipo_dcentros ?? null,
    sap: l.sap ?? null,
    centro_custo: l.centro_custo ?? null,
    marca: l.marca ?? null,
    nome_completo: l.nome_completo ?? null,
  }));
}

/** Marca ou desmarca "participa" nas lojas indicadas (admin; a RLS confere). */
export async function gravarParticipa(bcps: string[], participa: boolean): Promise<void> {
  if (MODO_LOCAL)
    throw new Error("No modo local a participação vem da seed: salvar só funciona na nuvem.");
  for (let i = 0; i < bcps.length; i += 200) {
    const { error } = await supabase
      .from("lojas")
      .update({ participa, atualizado_em: new Date().toISOString() } as never)
      .in("bcps", bcps.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
}
