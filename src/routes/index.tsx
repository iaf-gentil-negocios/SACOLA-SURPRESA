import { createFileRoute, redirect } from "@tanstack/react-router";

import { Carregando } from "@/components/layout/CabecalhoPagina";
import { destinoDoPerfil, obterSessao } from "@/lib/auth/sessao";

// Início: manda cada um para a sua área (ou para o login).
export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const s = await obterSessao(context.queryClient);
    throw redirect({ to: s.estado === "ok" ? destinoDoPerfil(s.perfil) : "/login" });
  },
  component: Carregando,
});
