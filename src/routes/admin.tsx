import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AdminShell } from "@/components/layout/AdminShell";
import { Carregando } from "@/components/layout/CabecalhoPagina";
import { ehAcompanhamento, exigirSessao } from "@/lib/auth/sessao";

// Área do admin: exige sessão de admin (ou Acompanhamento, só leitura) ativo, com a senha trocada.
export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin · Sacola Surpresa" }] }),
  beforeLoad: async ({ context }) => {
    const perfil = await exigirSessao(context.queryClient, "admin");
    return { perfil, soLeitura: ehAcompanhamento(perfil) };
  },
  pendingComponent: Carregando,
  component: AreaAdmin,
});

function AreaAdmin() {
  const { perfil, soLeitura } = Route.useRouteContext();
  return (
    <AdminShell perfil={perfil} soLeitura={soLeitura}>
      <Outlet />
    </AdminShell>
  );
}
