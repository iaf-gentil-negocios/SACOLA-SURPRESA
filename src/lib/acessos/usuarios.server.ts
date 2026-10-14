// Só servidor: usa a service_role (supabaseAdmin), que ignora a RLS.
// Importar apenas de dentro dos handlers em usuarios.functions.ts.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import type { Vinculo } from "@/lib/acessos/hierarquia";
import { bloqueioDeAdmin } from "@/lib/auth/regras";
import { emailDoUsuario, usuarioValido } from "@/lib/auth/usuario";
import type { Resultado } from "@/lib/resultado";

/** Inclui "gerente" (parte C, SQL editor), que ainda não está no types.ts. */
export type PerfilTipo = Database["public"]["Enums"]["perfil_tipo"] | "gerente" | "acompanhamento";

/** Bloqueio "permanente" no Supabase Auth para usuário desativado (100 anos). */
const BLOQUEIO_LOGIN = "876000h";

export class ErroDeNegocio extends Error {}

/** Executa o corpo do handler: erro de negócio vira mensagem; o resto é registrado e vira mensagem genérica. */
export async function executar<T extends object>(fn: () => Promise<T>): Promise<Resultado<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    if (e instanceof ErroDeNegocio) return { ok: false, erro: e.message };
    console.error(e);
    return { ok: false, erro: "Erro inesperado no servidor. Tente de novo." };
  }
}

export async function exigirAdmin(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("perfis")
    .select("perfil, ativo")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Falha ao conferir a permissão.");
  if (!data || data.perfil !== "admin" || !data.ativo) {
    throw new ErroDeNegocio("Acesso negado: apenas admin.");
  }
}

async function contarAdminsAtivos(excetoUserId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("perfis")
    .select("user_id", { count: "exact", head: true })
    .eq("perfil", "admin")
    .eq("ativo", true)
    .neq("user_id", excetoUserId);
  if (error) throw new Error("Falha ao contar admins.");
  return count ?? 0;
}

async function lerPerfil(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("perfis")
    .select("user_id, perfil, ativo")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Falha ao ler o usuário.");
  if (!data) throw new ErroDeNegocio("Usuário não encontrado.");
  return data;
}

/** Aplica a trava "nunca sem admin ativo" antes de mudar perfil ou ativo do alvo. */
export async function conferirTravaAdmin(
  solicitanteId: string,
  alvoId: string,
  novo: { perfil: PerfilTipo; ativo: boolean },
): Promise<void> {
  const atual = await lerPerfil(alvoId);
  const alvoEraAdminAtivo = atual.perfil === "admin" && atual.ativo;
  const alvoContinuaAdminAtivo = novo.perfil === "admin" && novo.ativo;
  const outros =
    alvoEraAdminAtivo && !alvoContinuaAdminAtivo ? await contarAdminsAtivos(alvoId) : 1;
  const bloqueio = bloqueioDeAdmin({
    solicitanteId,
    alvoId,
    alvoEraAdminAtivo,
    alvoContinuaAdminAtivo,
    outrosAdminsAtivos: outros,
  });
  if (bloqueio) throw new ErroDeNegocio(bloqueio);
}

/** Hierarquia de todas as lojas (gerentes_lojas), em páginas de 1.000 linhas. */
export async function lerVinculos(): Promise<Vinculo[]> {
  const r: Vinculo[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabaseAdmin
      .from("gerentes_lojas")
      .select("matricula, bcps, nivel")
      .order("matricula")
      .order("bcps")
      .range(de, de + 999);
    if (error) throw new Error("Falha ao ler a hierarquia de gerentes.");
    r.push(...data);
    if (data.length < 1000) return r;
  }
}

export async function definirBloqueioLogin(userId: string, bloqueado: boolean) {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: bloqueado ? BLOQUEIO_LOGIN : "none",
  });
  if (error) throw new Error("Falha ao atualizar o bloqueio de login.");
}

export async function definirSenha(userId: string, senha: string) {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: senha });
  if (error) throw new Error("Falha ao definir a senha.");
}

export { supabaseAdmin };

/**
 * Cria o login (Supabase Auth) e o perfil, com troca de senha obrigatória no primeiro acesso.
 * Se o perfil falhar, desfaz o login para não deixar usuário sem perfil.
 */
export async function criarLoginEPerfil(d: {
  nome: string;
  usuario: string;
  perfil: PerfilTipo;
  matricula: string | null;
  ve_todas: boolean;
  senha: string;
}): Promise<string> {
  if (!usuarioValido(d.usuario)) {
    throw new ErroDeNegocio(
      "Usuário inválido: use 3 a 40 letras minúsculas, números, ponto, hífen ou _.",
    );
  }
  const { data: existe } = await supabaseAdmin
    .from("perfis")
    .select("user_id")
    .eq("usuario", d.usuario)
    .maybeSingle();
  if (existe) throw new ErroDeNegocio(`O usuário "${d.usuario}" já existe.`);

  const criado = await supabaseAdmin.auth.admin.createUser({
    email: emailDoUsuario(d.usuario),
    password: d.senha,
    email_confirm: true,
  });
  if (criado.error || !criado.data.user) {
    throw new ErroDeNegocio(
      criado.error?.message.includes("already")
        ? `O usuário "${d.usuario}" já existe.`
        : "Falha ao criar o login.",
    );
  }
  const userId = criado.data.user.id;
  // `as never`: "gerente" e ve_todas (parte C) ainda não estão no types.ts
  const { error } = await supabaseAdmin.from("perfis").insert({
    user_id: userId,
    usuario: d.usuario,
    nome: d.nome,
    perfil: d.perfil,
    matricula: d.matricula || null,
    ve_todas: d.ve_todas,
    ativo: true,
    troca_senha: true,
  } as never);
  if (error) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    throw new Error("Falha ao gravar o perfil.");
  }
  return userId;
}
