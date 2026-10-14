// Leitura e gravação da situação das bases (parte D): envios, fixa/variável e desatualizadas.
// As regras ficam em ./situacao.ts (puro).
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { MODO_LOCAL } from "@/lib/modo-local";

import type { BaseId } from "./esquemas";
import {
  basesDesatualizadas,
  CHAVE_CLASSIFICACAO,
  classificacaoDe,
  type Classe,
  type Classificacao,
} from "./situacao";

export const CHAVE_ENVIOS = ["bases-envios"] as const;
export const CHAVE_CLASSIF = ["bases-classificacao"] as const;
export const CHAVE_ENVIOS_RESUMO = ["bases-envios-resumo"] as const;

/**
 * Versão leve dos envios, para a faixa do topo de todas as telas do admin: só os concluídos e só
 * as colunas que o aviso usa (sem o JSON inteiro de detalhes).
 */
export function useEnviosResumo() {
  return useQuery({
    queryKey: CHAVE_ENVIOS_RESUMO,
    enabled: !MODO_LOCAL,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bases_envios")
        .select("base, ciclo, status, concluido_em, excluida_em:detalhes->>excluida_em")
        .eq("status", "concluido")
        .order("concluido_em", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (
        data as unknown as {
          base: string;
          ciclo: number | null;
          status: string;
          concluido_em: string | null;
          excluida_em: string | null;
        }[]
      ).map((e) => ({ ...e, detalhes: e.excluida_em ? { excluida_em: e.excluida_em } : {} }));
    },
  });
}

/** Envios das bases, do mais novo ao mais antigo (admin). */
export function useEnviosBases() {
  return useQuery({
    queryKey: CHAVE_ENVIOS,
    enabled: !MODO_LOCAL,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bases_envios")
        .select("*")
        .order("enviado_em", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data;
    },
  });
}

/** Fixa/variável de cada base (padrão quando ainda não foi salvo). */
export function useClassificacao() {
  return useQuery({
    queryKey: CHAVE_CLASSIF,
    enabled: !MODO_LOCAL,
    queryFn: async (): Promise<Classificacao> => {
      const { data, error } = await supabase
        .from("parametros")
        .select("valor")
        .eq("chave", CHAVE_CLASSIFICACAO)
        .maybeSingle();
      if (error) throw error;
      return classificacaoDe(data?.valor);
    },
  });
}

/** Troca uma base de lista e salva a classificação inteira. */
export async function salvarClasse(atual: Classificacao, base: BaseId, classe: Classe) {
  const valor = { ...atual, [base]: classe } as unknown as Json;
  const { error } = await supabase
    .from("parametros")
    .upsert({ chave: CHAVE_CLASSIFICACAO, valor }, { onConflict: "chave" });
  if (error) throw new Error(error.message);
}

/** Bases variáveis sem atualização há mais de 24 h (para a faixa do topo e os cards). */
export function useBasesDesatualizadas(cicloPromocao: number | null) {
  const { data: envios } = useEnviosResumo();
  const { data: classificacao } = useClassificacao();
  if (!envios || !classificacao) return [];
  return basesDesatualizadas(envios, classificacao, cicloPromocao, Date.now());
}
