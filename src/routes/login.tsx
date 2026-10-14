import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { Marca } from "@/components/layout/Marca";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { destinoDoPerfil, entrar, obterSessao } from "@/lib/auth/sessao";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({ meta: [{ title: "Entrar · Sacola Surpresa" }] }),
  beforeLoad: async ({ context }) => {
    const s = await obterSessao(context.queryClient);
    if (s.estado === "ok") throw redirect({ to: destinoDoPerfil(s.perfil) });
  },
  component: Login,
});

function Login() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const r = await entrar(queryClient, usuario, senha);
    setEnviando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    navigate({ to: destinoDoPerfil(r.perfil) });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={enviar}
        className="w-full max-w-sm space-y-5 rounded-2xl border bg-card p-6 shadow-sm"
      >
        <Marca subtitulo="Gentil Negócios" />
        <div className="space-y-1.5">
          <Label htmlFor="usuario">Usuário</Label>
          <Input
            id="usuario"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="nome.sobrenome"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="senha">Senha</Label>
          <Input
            id="senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
        </div>
        {erro && (
          <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-destructive">
            {erro}
          </p>
        )}
        <Button type="submit" className="w-full font-bold" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Esqueceu a senha? Fale com o administrador.
        </p>
      </form>
    </main>
  );
}
