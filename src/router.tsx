import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Economia de leituras (11/10/2026): o que já foi lido vale por 5 min e não é relido ao voltar
  // para a aba/app; depois de cada gravação, as telas já pedem a releitura do que mudou.
  const queryClient = new QueryClient({
    defaultOptions: {
      // refetchIntervalInBackground: false = garantia de que consulta periódica (se um dia existir)
      // nunca roda com a aba escondida; volta a rodar quando a aba fica visível.
      queries: {
        staleTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchIntervalInBackground: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
