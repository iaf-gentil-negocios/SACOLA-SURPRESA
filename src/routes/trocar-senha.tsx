import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { Marca } from "@/components/layout/Marca";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  destinoDoPerfil,
  esquecerSessao,
  exigirSessao,
  obterSessao,
  sair,
} from "@/lib/auth/sessao";
import { REGRA_SENHA, senhaValida } from "@/lib/auth/usuario";
import { trocarMinhaSenha } from "@/lib/acessos/usuarios.functions";

export const Route = createFileRoute("/trocar-senha")({
  ssr: false,
  head: () => ({ meta: [{ title: "Trocar senha · Sacola Surpresa" }] }),
  beforeLoad: async ({ context }) => ({
    perfil: await exigirSessao(context.queryClient, "qualquer"),
  }),
  component: TrocarSenha,
});

function TrocarSenha() {
  const { perfil } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const obrigatoria = perfil.troca_senha;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!senhaValida(nova)) return setErro(REGRA_SENHA);
    if (nova !== confirma) return setErro("As duas senhas não são iguais.");
    setEnviando(true);
    const r = await trocarMinhaSenha({ data: { novaSenha: nova } });
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);

    esquecerSessao(queryClient);
    const s = await obterSessao(queryClient);
    navigate({ to: s.estado === "ok" ? destinoDoPerfil(s.perfil) : "/login" });
  };

  const voltar = () => navigate({ to: "/" });
  const aoSair = async () => {
    await sair(queryClient, perfil.user_id);
    navigate({ to: "/login" });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={enviar}
        className="w-full max-w-sm space-y-5 rounded-2xl border bg-card p-6 shadow-sm"
      >
        <Marca subtitulo={perfil.nome} />
        <div>
          <h1 className="text-lg font-extrabold text-ink">
            {obrigatoria ? "Crie a sua senha" : "Trocar senha"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {obrigatoria
              ? "Antes de continuar, troque a senha provisória por uma senha só sua."
              : "Escolha a nova senha."}{" "}
            {REGRA_SENHA}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nova">Nova senha</Label>
          <Input
            id="nova"
            type="password"
            autoComplete="new-password"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirma">Repita a nova senha</Label>
          <Input
            id="confirma"
            type="password"
            autoComplete="new-password"
            value={confirma}
            onChange={(e) => setConfirma(e.target.value)}
            required
          />
        </div>
        {erro && (
          <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-destructive">
            {erro}
          </p>
        )}
        <Button type="submit" className="w-full font-bold" disabled={enviando}>
          {enviando ? "Salvando…" : "Salvar senha"}
        </Button>
        <div className="flex justify-between text-sm">
          {obrigatoria ? (
            <span />
          ) : (
            <button
              type="button"
              className="text-muted-foreground hover:underline"
              onClick={voltar}
            >
              Voltar
            </button>
          )}
          <button type="button" className="text-muted-foreground hover:underline" onClick={aoSair}>
            Sair
          </button>
        </div>
      </form>
    </main>
  );
}
