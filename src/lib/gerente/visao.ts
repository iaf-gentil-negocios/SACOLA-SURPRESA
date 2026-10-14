// Quem a área do gerente está mostrando (parte C):
// - o próprio gerente logado (a RLS entrega só as lojas dele e só bases já iniciadas); ou
// - "Ver como gerente": o admin escolhe um gerente e vê as telas dele, só leitura, com as bases
//   que ainda não começaram. O escopo vem da função lojas_de do banco (a mesma regra da RLS).
//   As tabelas lidas são as mesmas do gerente: sem custo nem margem.
import { createContext, useContext } from "react";

import { supabase } from "@/integrations/supabase/client";

export interface VisaoGerente {
  /** Usuário cujas telas são mostradas. */
  userId: string;
  nome: string;
  rotulo: string;
  /** Admin vendo como gerente: só leitura, não registra acessos, mostra bases futuras. */
  verComo: boolean;
}

export const VisaoContext = createContext<VisaoGerente | null>(null);

export function useVisao(): VisaoGerente {
  const v = useContext(VisaoContext);
  if (!v) throw new Error("useVisao fora da área do gerente.");
  return v;
}

const CHAVE = "sacola.ver-como";
let alvoEmMemoria: string | null = null;

/** Guarda o gerente escolhido (sobrevive ao recarregar a página, só nesta aba). */
export function iniciarVerComo(userId: string) {
  alvoEmMemoria = userId;
  try {
    sessionStorage.setItem(CHAVE, userId);
  } catch {
    // sem sessionStorage: vale só a memória
  }
}

export function alvoDoVerComo(): string | null {
  if (alvoEmMemoria) return alvoEmMemoria;
  try {
    return sessionStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

export function encerrarVerComo() {
  alvoEmMemoria = null;
  try {
    sessionStorage.removeItem(CHAVE);
  } catch {
    // nada a limpar
  }
}

/** Lojas do escopo de um usuário pela função do banco (admin pode pedir de qualquer um). */
export async function lojasDe(userId: string): Promise<string[]> {
  // `as never`: função da parte C (SQL editor), ainda não está no types.ts
  const { data, error } = await supabase.rpc("lojas_de" as never, { p_user: userId } as never);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as (string | { lojas_de: string })[]).map((x) =>
    typeof x === "string" ? x : x.lojas_de,
  );
}
