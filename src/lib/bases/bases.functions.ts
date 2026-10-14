// Funções de servidor do upload das bases (admin).
// Este arquivo também vai para o navegador (só as chamadas); a gravação fica em
// bases.server.ts, importado dentro dos handlers.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BASES, PARTES, TAMANHO_LOTE } from "./esquemas";

const envioIdSchema = z.number().int().positive();

export const iniciarEnvio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      base: z.enum(BASES),
      ciclo: z.number().int().min(1).max(99).nullable(),
      versaoRef: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable(),
      arquivo: z.string().max(300),
      detalhes: z.record(z.string(), z.union([z.string(), z.number()])),
    }),
  )
  .handler(async ({ data, context }) => {
    const srv = await import("./bases.server");
    return srv.executar(async () => {
      await srv.exigirAdmin(context.userId);
      return srv.iniciarEnvio(context.userId, data);
    });
  });

export const enviarLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      envioId: envioIdSchema,
      base: z.enum(BASES),
      parte: z.enum(PARTES),
      linhas: z.array(z.unknown()).min(1).max(TAMANHO_LOTE),
    }),
  )
  .handler(async ({ data, context }) => {
    const srv = await import("./bases.server");
    return srv.executar(async () => {
      await srv.exigirAdmin(context.userId);
      return srv.gravarLote(data);
    });
  });

export const concluirEnvio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ envioId: envioIdSchema }))
  .handler(async ({ data, context }) => {
    const srv = await import("./bases.server");
    return srv.executar(async () => {
      await srv.exigirAdmin(context.userId);
      return srv.concluirEnvio(data.envioId);
    });
  });

export const cancelarEnvio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ envioId: envioIdSchema }))
  .handler(async ({ data, context }) => {
    const srv = await import("./bases.server");
    return srv.executar(async () => {
      await srv.exigirAdmin(context.userId);
      return srv.cancelarEnvio(data.envioId);
    });
  });

/** Exclui os dados de uma base (lojas: só inativa). */
export const excluirBase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ base: z.enum(BASES), ciclo: z.number().int().nullable() }))
  .handler(async ({ data, context }) => {
    const srv = await import("./bases.server");
    return srv.executar(async () => {
      await srv.exigirAdmin(context.userId);
      return srv.excluirBase(data);
    });
  });
