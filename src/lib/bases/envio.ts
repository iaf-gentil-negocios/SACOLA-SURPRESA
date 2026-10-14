// Envia uma análise ao servidor: inicia o envio, manda os lotes e conclui.
import { supabase } from "@/integrations/supabase/client";

import type { Analise } from "./analise";
import { cancelarEnvio, concluirEnvio, enviarLote, iniciarEnvio } from "./bases.functions";
import { TAMANHO_LOTE } from "./esquemas";

export interface Progresso {
  enviados: number;
  total: number;
  etapa: string;
}

function lotes<T>(itens: T[], tamanho: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) r.push(itens.slice(i, i + tamanho));
  return r;
}

/** Tenta de novo quando a falha é de rede (exceção), não quando é erro de negócio. */
async function comRetentativa<T>(fn: () => Promise<T>, tentativas = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tentativas) throw e;
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
}

/** Lote da Cobertura direto no banco (0002h: mesma validação do servidor, só admin). */
async function gravarCobertura(
  envioId: number,
  parte: string,
  linhas: unknown[],
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const funcao = parte === "skus" ? "gravar_skus_cobertura" : "gravar_lote_cobertura";
  // função do 0002h, ainda fora do types.ts
  const { error } = await supabase.rpc(
    funcao as never,
    { p_envio: envioId, p_linhas: linhas } as never,
  );
  // erro de regra (P0001 = raise exception) não é repetido; erro de rede sobe para a retentativa
  if (error) {
    if (error.code === "P0001") return { ok: false, erro: error.message };
    throw new Error(error.message);
  }
  return { ok: true };
}

export async function enviarAnalise(
  analise: Analise,
  arquivo: string,
  aoProgredir: (p: Progresso) => void,
): Promise<Record<string, number>> {
  const blocos = analise.partes.flatMap((p) =>
    // vendedoras substitui tudo de uma vez: precisa ir num lote só
    (analise.base === "vendedoras" ? [p.linhas] : lotes(p.linhas, TAMANHO_LOTE)).map((linhas) => ({
      parte: p.parte,
      linhas,
    })),
  );
  const total = blocos.reduce((s, b) => s + b.linhas.length, 0);
  aoProgredir({ enviados: 0, total, etapa: "Iniciando…" });

  const inicio = await iniciarEnvio({
    data: {
      base: analise.base,
      ciclo: analise.ciclo ?? null,
      versaoRef: analise.versaoRef ?? null,
      arquivo,
      detalhes: {
        layout: analise.layout,
        linhas_lidas: analise.linhasLidas,
        linhas_com_erro: analise.erros.length,
        ...(analise.mes ? { mes: analise.mes } : {}),
      },
    },
  });
  if (!inicio.ok) throw new Error(inicio.erro);
  const envioId = inicio.envioId;

  try {
    let enviados = 0;
    // partes em ordem (ex.: SKUs novos antes da cobertura); dentro da parte, 3 lotes ao mesmo tempo
    for (const parte of [...new Set(blocos.map((b) => b.parte))]) {
      const fila = blocos.filter((b) => b.parte === parte && b.linhas.length > 0);
      const trabalhar = async () => {
        for (let b = fila.shift(); b; b = fila.shift()) {
          const lote = b;
          // Cobertura (o grosso do volume): direto no banco, por função só do admin (0002h),
          // sem passar pelo Worker. As outras bases continuam pela função de servidor.
          const r = await comRetentativa(() =>
            analise.base === "cobertura"
              ? gravarCobertura(envioId, lote.parte, lote.linhas)
              : enviarLote({
                  data: { envioId, base: analise.base, parte: lote.parte, linhas: lote.linhas },
                }),
          );
          if (!r.ok) throw new Error(r.erro);
          enviados += lote.linhas.length;
          aoProgredir({
            enviados,
            total,
            etapa: parte === "skus" ? "Gravando SKUs novos…" : "Gravando…",
          });
        }
      };
      await Promise.all([trabalhar(), trabalhar(), trabalhar()]);
    }
    aoProgredir({ enviados, total, etapa: "Concluindo (substituindo a versão anterior)…" });
    const fim = await concluirEnvio({ data: { envioId } });
    if (!fim.ok) throw new Error(fim.erro);
    aoProgredir({ enviados: total, total, etapa: "Concluído" });
    return fim.resultado;
  } catch (e) {
    await cancelarEnvio({ data: { envioId } }).catch(() => undefined);
    throw e;
  }
}
