// Perfil Acompanhamento (F2a): vê a área do admin só leitura. As telas usam isto para esconder os
// botões de alterar; a proteção real é a RLS (o perfil só tem SELECT) e as funções de servidor.
import { getRouteApi, redirect } from "@tanstack/react-router";

const admin = getRouteApi("/admin");

export function useSoLeitura(): boolean {
  return admin.useRouteContext({ select: (c) => c.soLeitura });
}

/** Para o `beforeLoad` das telas só do admin (Motor, Bases, Acessos): Acompanhamento volta ao início. */
export function soAdmin({ context }: { context: { soLeitura: boolean } }) {
  if (context.soLeitura) throw redirect({ to: "/admin" });
}
