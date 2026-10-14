import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CircleHelp,
  Database,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Package,
  SlidersHorizontal,
  Store,
  Target,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

import { AvisoBases } from "@/components/bases/AvisoBases";
import { Button } from "@/components/ui/button";
import { sair, type Perfil } from "@/lib/auth/sessao";
import { periodoDoCiclo, useCicloSelecionado, useCiclos } from "@/lib/ciclo";
import { MODO_LOCAL } from "@/lib/modo-local";
import { BotaoTema } from "./BotaoTema";
import { Marca } from "./Marca";

const MENU = [
  { to: "/admin", rotulo: "Dados gerais", icone: LayoutDashboard, exato: true },
  { to: "/admin/limites", rotulo: "Limites e metas", icone: Target },
  { to: "/admin/regras", rotulo: "Motor do Mix", icone: SlidersHorizontal, soAdmin: true },
  { to: "/admin/kits", rotulo: "Kits", icone: Package },
  { to: "/admin/lojas", rotulo: "Lojas", icone: Store },
  { to: "/admin/bases", rotulo: "Bases", icone: Database, soAdmin: true },
  { to: "/admin/acessos", rotulo: "Acessos", icone: Users, soAdmin: true },
  { to: "/admin/como-funciona", rotulo: "Como funciona", icone: CircleHelp },
] as const;

export function AdminShell({
  perfil,
  soLeitura,
  children,
}: {
  perfil: Perfil;
  /** Acompanhamento (F2a): sem Motor, Bases e Acessos, e nada de alterar. */
  soLeitura: boolean;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: ciclos } = useCiclos();
  const [ciclo, escolherCiclo] = useCicloSelecionado(ciclos);

  const aoSair = async () => {
    await sair(queryClient, perfil.user_id);
    navigate({ to: "/login" });
  };

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-4 border-b bg-sidebar p-4 lg:sticky lg:top-0 lg:h-screen lg:overflow-auto lg:border-r lg:border-b-0">
        <Marca compacta subtitulo={soLeitura ? "Acompanhamento · só leitura" : "Admin"} />

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Ciclo
          </span>
          <select
            className="rounded-lg border bg-card px-3 py-2 text-sm"
            value={ciclo ?? ""}
            onChange={(e) => escolherCiclo(Number(e.target.value))}
            disabled={!ciclos?.length}
          >
            {ciclos?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} · {periodoDoCiclo(c)}
              </option>
            ))}
          </select>
        </label>

        <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Menu do admin">
          {MENU.filter((m) => !(soLeitura && "soAdmin" in m)).map((m) => (
            <Link
              key={m.to}
              to={m.to}
              activeOptions={{ exact: "exato" in m && m.exato }}
              className="flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-semibold text-sidebar-foreground hover:bg-sidebar-accent"
              activeProps={{ className: "!bg-sidebar-primary !text-sidebar-primary-foreground" }}
            >
              <m.icone className="size-4 flex-none" aria-hidden />
              {m.rotulo}
            </Link>
          ))}
        </nav>

        <div className="flex flex-wrap gap-2 lg:mt-auto lg:flex-col">
          <div className="hidden text-xs text-muted-foreground lg:block">
            Conectado como <b className="text-foreground">{perfil.nome}</b>
          </div>
          {MODO_LOCAL && !soLeitura && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/gerente">Área do gerente (teste local)</Link>
            </Button>
          )}
          <BotaoTema />
          <Button variant="outline" size="sm" asChild>
            <Link to="/trocar-senha">
              <KeyRound /> Trocar senha
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={aoSair}>
            <LogOut /> Sair
          </Button>
        </div>
      </aside>

      <main className="min-w-0 px-4 pt-6 pb-12 lg:px-6">
        <AvisoBases ciclo={ciclo ?? null} soLeitura={soLeitura} />
        {children}
      </main>
    </div>
  );
}
