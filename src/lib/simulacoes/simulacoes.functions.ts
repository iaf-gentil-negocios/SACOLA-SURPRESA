// Funções de servidor das simulações salvas e bases (admin). A gravação fica em
// simulacoes.server.ts, importado dentro dos handlers.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const json = z.custom<import("@/integrations/supabase/types").Json>(() => true);
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const iniciarSimulacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      nome: z.string().trim().min(1).max(120),
      ciclo: z.number().int(),
      semente: z.number().int(),
      pracas: z.array(z.string().max(100)).nullable(),
      parametros: json,
      resumo: json,
    }),
  )
  .handler(async ({ data: d, context }) => {
    const srv = await import("./simulacoes.server");
    return srv.executar(async () => {
      await srv.exigirAdmin(context.userId);
      return srv.iniciarSimulacao(context.userId, d);
    });
  });

// As partes da simulação (kits, itens, kits por loja, lojas) vão direto ao banco pela função
// gravar_parte_simulacao (0002h, revisão de consumo item 9), com a mesma validação de antes.

export const concluirSimulacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data: d, context }) => {
    const srv = await import("./simulacoes.server");
    return srv.executar(async () => {
      await srv.exigirAdmin(context.userId);
      return srv.concluirSimulacao(d.id);
    });
  });

export const definirBase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      simulacaoId: z.number().int().positive(),
      nome: z.string().trim().min(1).max(120),
      inicio: data,
      fim: data,
    }),
  )
  .handler(async ({ data: d, context }) => {
    const srv = await import("./simulacoes.server");
    return srv.executar(async () => {
      await srv.exigirAdmin(context.userId);
      return srv.definirBase(context.userId, d);
    });
  });
