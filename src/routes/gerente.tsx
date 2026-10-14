import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Calculator,
  Eye,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Package,
  ShoppingBag,
  Target,
} from "lucide-react";

import { BotaoTema } from "@/components/layout/BotaoTema";
import { Carregando } from "@/components/layout/CabecalhoPagina";
import { Marca } from "@/components/layout/Marca";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ROTULO_PERFIL } from "@/lib/auth/rotulos";
import { ehAcompanhamento, exigirSessao, sair, type Perfil } from "@/lib/auth/sessao";
import { useEscopo } from "@/lib/escopo";
import { situacaoDaBase } from "@/lib/dados/periodo";
import { useBaseEscolhida, useBasesGerente } from "@/lib/gerente/base";
import { MODO_LOCAL } from "@/lib/modo-local";
import {
  alvoDoVerComo,
  encerrarVerComo,
  VisaoContext,
  type VisaoGerente,
} from "@/lib/gerente/visao";

const MENU = [
  { to: "/gerente", rotulo: "Painel", icone: LayoutDashboard, exato: true },
  { to: "/gerente/metas", rotulo: "Metas", icone: Target },
  { to: "/gerente/simulador-vendas", rotulo: "Simulador por vendas", icone: Calculator },
  { to: "/gerente/simulador-kits", rotulo: "Simulador por kits", icone: ShoppingBag },
  { to: "/gerente/kits", rotulo: "Kits", icone: Package },
] as const;

const dataBR = (d: string) => d.split("-").reverse().join("/");
const ROTULO_SITUACAO = { atual: "Atual: ", encerrada: "Histórico: ", futura: "Futura: " };

/** Rótulo do perfil; "vê todas as lojas" (diretoria) aparece junto. */
function rotuloDe(p: Perfil & { ve_todas?: boolean | null }) {
  const base = ROTULO_PERFIL[p.perfil as keyof typeof ROTULO_PERFIL] ?? p.perfil;
  return p.ve_todas ? `${base} · vê todas as lojas` : base;
}

// Área do gerente: exige sessão ativa, com a senha já trocada.
// Admin entra só pelo "Ver como gerente" (Acessos), vendo as telas do gerente escolhido, só leitura.
export const Route = createFileRoute("/gerente")({
  ssr: false,
  head: () => ({ meta: [{ title: "Sacola Surpresa" }] }),
  beforeLoad: async ({ context }) => {
    const eu = await exigirSessao(context.queryClient, "qualquer");
    if (eu.troca_senha) throw redirect({ to: "/trocar-senha" });
    // Acompanhamento (F2a) fica na área do admin, só leitura
    if (ehAcompanhamento(eu)) throw redirect({ to: "/admin" });
    // modo local (sem banco): a área do gerente com todas as lojas das bases deste navegador
    if (MODO_LOCAL) {
      const visao: VisaoGerente = {
        userId: eu.user_id,
        nome: "Modo local",
        rotulo: "vê todas as lojas (teste)",
        verComo: false,
      };
      return { perfil: eu, visao };
    }
    if (eu.perfil !== "admin") {
      const visao: VisaoGerente = {
        userId: eu.user_id,
        nome: eu.nome,
        rotulo: rotuloDe(eu),
        verComo: false,
      };
      return { perfil: eu, visao };
    }
    const alvo = alvoDoVerComo();
    if (!alvo) throw redirect({ to: "/admin/acessos" });
    // "*": inclui ve_todas (parte C), que ainda não está no types.ts
    const { data } = await supabase.from("perfis").select("*").eq("user_id", alvo).maybeSingle();
    if (!data || !data.ativo || data.perfil === "admin") {
      encerrarVerComo();
      throw redirect({ to: "/admin/acessos" });
    }
    const visao: VisaoGerente = {
      userId: data.user_id,
      nome: data.nome,
      rotulo: rotuloDe(data),
      verComo: true,
    };
    return { perfil: eu, visao };
  },
  pendingComponent: Carregando,
  component: AreaGerente,
});

function AreaGerente() {
  const { perfil, visao } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: lojas } = useEscopo(visao);
  const pracas = [...new Set((lojas ?? []).map((l) => l.praca))];
  const { data: bases } = useBasesGerente(visao);
  const [base, escolherBase] = useBaseEscolhida(bases);

  const aoSair = async () => {
    await sair(queryClient, perfil.user_id);
    navigate({ to: "/login" });
  };
  const voltarAoAdmin = () => {
    encerrarVerComo();
    queryClient.removeQueries({ queryKey: ["gerente"] });
    navigate({ to: "/admin/acessos" });
  };

  return (
    <VisaoContext.Provider value={visao}>
      <div className="min-h-screen">
        {visao.verComo && (
          <div className="sticky top-0 z-20 flex flex-wrap items-center justify-center gap-3 bg-navy px-4 py-2 text-sm text-navy-foreground">
            <Eye className="size-4" aria-hidden />
            <span>
              Vendo como <b>{visao.nome}</b> — só leitura. Bases que ainda não começaram aparecem
              aqui; o gerente só as vê a partir do início.
            </span>
            <Button size="sm" variant="secondary" onClick={voltarAoAdmin}>
              <ArrowLeft /> Voltar ao admin
            </Button>
          </div>
        )}
        <header className="border-b bg-card">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
            <Marca subtitulo="Metas, simuladores e kits" />
            <div className="flex flex-wrap items-center gap-2">
              <BotaoTema />
              {!visao.verComo && (
                <>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/trocar-senha">
                      <KeyRound /> Trocar senha
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" onClick={aoSair}>
                    <LogOut /> Sair
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-1 px-4 pb-4 text-sm text-muted-foreground">
            <span>
              <b className="text-foreground">{visao.nome}</b> · {visao.rotulo}
            </span>
            <span>
              Escopo:{" "}
              {lojas === undefined
                ? "…"
                : lojas.length === 0
                  ? "nenhuma loja liberada ainda"
                  : `${pracas.join(", ")} · ${lojas.length} ${lojas.length === 1 ? "loja" : "lojas"}`}
            </span>
            <span>
              Base:{" "}
              {bases === undefined ? (
                "…"
              ) : !bases.length ? (
                "nenhuma base publicada ainda"
              ) : (
                <select
                  className="rounded-md border bg-card px-2 py-1 text-sm text-foreground"
                  value={base?.id ?? ""}
                  onChange={(e) => escolherBase(Number(e.target.value))}
                >
                  {bases.map((b) => (
                    <option key={b.id} value={b.id}>
                      {ROTULO_SITUACAO[situacaoDaBase(b)]}
                      {b.nome} (C{b.ciclo}, {dataBR(b.inicio)} a {dataBR(b.fim)})
                    </option>
                  ))}
                </select>
              )}
            </span>
          </div>
          <nav
            className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-3"
            aria-label="Menu do gerente"
          >
            {MENU.map((m) => (
              <Link
                key={m.to}
                to={m.to}
                activeOptions={{ exact: "exato" in m && m.exato }}
                className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold hover:bg-muted"
                activeProps={{ className: "!bg-navy !text-navy-foreground" }}
              >
                <m.icone className="size-4" aria-hidden /> {m.rotulo}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 pt-6 pb-12">
          <Outlet />
        </main>
      </div>
    </VisaoContext.Provider>
  );
}
