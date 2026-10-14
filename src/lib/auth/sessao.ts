// Sessão no navegador: login, perfil do usuário logado e registro de acessos.
// A sessão do Supabase fica no navegador; por isso as rotas protegidas usam `ssr: false`.
// A proteção real dos dados é a RLS e as funções de servidor.
import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import type { Database, Json, Tables } from "@/integrations/supabase/types";
import { MODO_LOCAL, perfilLocal } from "@/lib/modo-local";

import { emailDoUsuario } from "./usuario";

export type Perfil = Tables<"perfis">;
/** "abriu_dashboard" (F2a, SQL editor) ainda não está no types.ts. */
export type EventoAcesso = Database["public"]["Enums"]["acesso_evento"] | "abriu_dashboard";

export type EstadoSessao =
  | { estado: "anonimo" }
  | { estado: "bloqueado"; motivo: string }
  | { estado: "ok"; perfil: Perfil };

const CHAVE = ["sessao"] as const;

async function lerSessao(): Promise<EstadoSessao> {
  // modo de teste local (só no servidor de desenvolvimento): entra direto como admin
  if (MODO_LOCAL) return { estado: "ok", perfil: perfilLocal() };
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return { estado: "anonimo" };

  const { data: perfil, error } = await supabase
    .from("perfis")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!perfil) {
    await supabase.auth.signOut();
    return {
      estado: "bloqueado",
      motivo: "Usuário sem perfil cadastrado. Fale com o administrador.",
    };
  }
  if (!perfil.ativo) {
    await supabase.auth.signOut();
    return { estado: "bloqueado", motivo: "Usuário desativado. Fale com o administrador." };
  }
  return { estado: "ok", perfil };
}

export function obterSessao(queryClient: QueryClient): Promise<EstadoSessao> {
  // perfil relido a cada 5 min (a RLS já barra na hora quem for desativado)
  return queryClient.fetchQuery({ queryKey: CHAVE, queryFn: lerSessao, staleTime: 5 * 60_000 });
}

export function esquecerSessao(queryClient: QueryClient) {
  queryClient.removeQueries({ queryKey: CHAVE });
}

/** Acompanhamento (F2a): o time do Matheus — área do admin só leitura, com custo e margem. */
export function ehAcompanhamento(perfil: Pick<Perfil, "perfil">): boolean {
  return (perfil.perfil as string) === "acompanhamento";
}

export function destinoDoPerfil(perfil: Perfil): "/trocar-senha" | "/admin" | "/gerente" {
  if (perfil.troca_senha) return "/trocar-senha";
  return perfil.perfil === "admin" || ehAcompanhamento(perfil) ? "/admin" : "/gerente";
}

/** Para `beforeLoad`: exige sessão válida e (opcionalmente) um tipo de área. */
export async function exigirSessao(
  queryClient: QueryClient,
  area: "admin" | "gerente" | "qualquer",
): Promise<Perfil> {
  const s = await obterSessao(queryClient);
  if (s.estado !== "ok") throw redirect({ to: "/login" });
  const destino = destinoDoPerfil(s.perfil);
  if (area === "qualquer") return s.perfil;
  if (destino !== `/${area}`) throw redirect({ to: destino });
  return s.perfil;
}

export async function registrarAcesso(userId: string, evento: EventoAcesso, detalhe?: Json) {
  if (MODO_LOCAL) return;
  // Falha no registro não pode impedir o uso; fica só no console.
  const { error } = await supabase
    .from("acessos_log")
    .insert({ user_id: userId, evento, detalhe: detalhe ?? null } as never);
  if (error) console.error("Falha ao registrar acesso", error);
}

function mensagemDeErroLogin(codigo: string | undefined, mensagem: string): string {
  if (codigo === "user_banned" || /banned/i.test(mensagem)) {
    return "Usuário desativado. Fale com o administrador.";
  }
  if (codigo === "invalid_credentials" || /invalid login credentials/i.test(mensagem)) {
    return "Usuário ou senha incorretos.";
  }
  if (/rate limit|too many/i.test(mensagem)) return "Muitas tentativas. Aguarde alguns minutos.";
  return "Não foi possível entrar. Tente de novo.";
}

export async function entrar(
  queryClient: QueryClient,
  usuario: string,
  senha: string,
): Promise<{ ok: true; perfil: Perfil } | { ok: false; erro: string }> {
  // o login é só pelo nickname (nome.sobrenome); o e-mail interno nunca é digitado
  if (usuario.includes("@")) {
    return { ok: false, erro: "Use o seu usuário (nome.sobrenome), não o e-mail." };
  }
  const { error } = await supabase.auth.signInWithPassword({
    email: emailDoUsuario(usuario),
    password: senha,
  });
  if (error) return { ok: false, erro: mensagemDeErroLogin(error.code, error.message) };

  esquecerSessao(queryClient);
  const s = await obterSessao(queryClient);
  if (s.estado === "bloqueado") return { ok: false, erro: s.motivo };
  if (s.estado !== "ok") return { ok: false, erro: "Não foi possível entrar. Tente de novo." };
  await registrarAcesso(s.perfil.user_id, "login");
  return { ok: true, perfil: s.perfil };
}

export async function sair(queryClient: QueryClient, userId?: string) {
  if (MODO_LOCAL) return;
  if (userId) await registrarAcesso(userId, "logout");
  await supabase.auth.signOut();
  queryClient.clear();
}
