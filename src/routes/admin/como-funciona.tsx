import { createFileRoute } from "@tanstack/react-router";

import { EmConstrucao } from "@/components/layout/CabecalhoPagina";

export const Route = createFileRoute("/admin/como-funciona")({
  component: () => (
    <EmConstrucao
      titulo="Como funciona"
      descricao="Passo a passo do cálculo e origem dos dados"
      etapa="etapa 5"
    />
  ),
});
