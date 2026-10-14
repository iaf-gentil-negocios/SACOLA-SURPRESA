// Funções de servidor de usuários e acessos.
// Este arquivo também vai para o navegador (só os "stubs" das chamadas):
// o que usa a service_role fica em usuarios.server.ts, importado dentro dos handlers.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { escopoDoPerfil, type Nivel } from "@/lib/acessos/hierarquia";
import { senhaValida, usuarioValido, REGRA_SENHA } from "@/lib/auth/usuario";

// "gerente" (parte C): perfil dos usuários da hierarquia; grvo/gcvo_gpvo ficam para os antigos.
// O escopo não depende do perfil: vem da matrícula (hierarquia) ou de "vê todas as lojas".
// "acompanhamento" (F2a): área do admin só leitura, todas as lojas, com custo e margem.
const perfilSchema = z.enum(["admin", "acompanhamento", "gerente", "grvo", "gcvo_gpvo"]);
const userIdSchema = z.string().uuid();
const matriculaSchema = z.string().trim().max(30).nullable();

export type PerfilTipo = z.infer<typeof perfilSchema>;

export interface UsuarioListado {
  user_id: string;
  usuario: string;
  nome: string;
  perfil: PerfilTipo;
  ativo: boolean;
  troca_senha: boolean;
  matricula: string | null;
  /** Diretoria: perfil de gerente que vê todas as lojas. */
  ve_todas: boolean;
  /** Escopo calculado pela hierarquia (mesma regra da função lojas_de do banco). */
  todas: boolean;
  lojas: string[];
  papeis: Nivel[];
  ultimo_acesso: string | null;
}

type LinhaPerfil = Pick<
  UsuarioListado,
  "user_id" | "usuario" | "nome" | "perfil" | "ativo" | "troca_senha" | "matricula"
> & { ve_todas?: boolean | null };

/** Lista usuários com escopo (pela hierarquia) e último acesso (admin). */
export const listarUsuarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const srv = await import("./usuarios.server");
    return srv.executar(async () => {
      await srv.exigirAdmin(context.userId);
      const db = srv.supabaseAdmin;

      // "*": inclui ve_todas (parte C), que ainda não está no types.ts
      const [perfis, vinculos, auth] = await Promise.all([
        db.from("perfis").select("*").order("nome"),
        srv.lerVinculos(),
        db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      ]);
      if (perfis.error || auth.error) throw new Error("Falha ao listar usuários.");

      const ultimoPor = new Map(auth.data.users.map((u) => [u.id, u.last_sign_in_at ?? null]));
      const usuarios: UsuarioListado[] = (perfis.data as unknown as LinhaPerfil[]).map((p) => {
        const e = escopoDoPerfil(p, vinculos);
        return {
          user_id: p.user_id,
          usuario: p.usuario,
          nome: p.nome,
          perfil: p.perfil,
          ativo: p.ativo,
          troca_senha: p.troca_senha,
          matricula: p.matricula,
          ve_todas: p.ve_todas ?? false,
          todas: e.todas,
          lojas: e.lojas,
          papeis: e.papeis,
          ultimo_acesso: ultimoPor.get(p.user_id) ?? null,
        };
      });
      return { usuarios };
    });
  });

/** Cria o usuário com senha provisória (mostrada uma única vez ao admin). */
export const criarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      nome: z.string().trim().min(2).max(120),
      usuario: z.string().trim().toLowerCase(),
      perfil: perfilSchema,
      matricula: matriculaSchema,
      ve_todas: z.boolean(),
    }),
  )
  .handler(async ({ data, context }) => {
    const srv = await import("./usuarios.server");
    return srv.executar(async () => {
      await srv.exigirAdmin(context.userId);
      const { gerarSenhaProvisoria } = await import("@/lib/auth/senha");
      const senha = gerarSenhaProvisoria();
      const userId = await srv.criarLoginEPerfil({ ...data, senha });
      return { userId, usuario: data.usuario, senha };
    });
  });

/** Edita nome, perfil, matrícula e "vê todas as lojas" (o usuário não muda). */
export const editarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      userId: userIdSchema,
      nome: z.string().trim().min(2).max(120),
      perfil: perfilSchema,
      matricula: matriculaSchema,
      ve_todas: z.boolean(),
    }),
  )
  .handler(async ({ data, context }) => {
    const srv = await import("./usuarios.server");
    return srv.executar(async () => {
      await srv.exigirAdmin(context.userId);
      const { data: atual } = await srv.supabaseAdmin
        .from("perfis")
        .select("ativo")
        .eq("user_id", data.userId)
        .maybeSingle();
      if (!atual) throw new srv.ErroDeNegocio("Usuário não encontrado.");
      await srv.conferirTravaAdmin(context.userId, data.userId, {
        perfil: data.perfil,
        ativo: atual.ativo,
      });

      // `as never`: "gerente" e ve_todas ainda não estão no types.ts
      const { error } = await srv.supabaseAdmin
        .from("perfis")
        .update({
          nome: data.nome,
          perfil: data.perfil,
          matricula: data.matricula || null,
          ve_todas: data.ve_todas,
          atualizado_em: new Date().toISOString(),
        } as never)
        .eq("user_id", data.userId);
      if (error) throw new Error("Falha ao gravar o perfil.");
      return {};
    });
  });

export interface ResultadoLote {
  criados: { matricula: string; usuario: string }[];
  pulados: { matricula: string; usuario: string; motivo: string }[];
}

/**
 * Cria em lote os usuários da hierarquia, com a senha padrão digitada pelo admin
 * (troca obrigatória no primeiro acesso). Quem já existe (matrícula ou usuário) é pulado.
 * A senha só passa por aqui: não é gravada em lugar nenhum além do Supabase Auth, nem registrada.
 */
export const criarUsuariosEmLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      senha: z.string().max(72),
      pessoas: z
        .array(
          z.object({
            matricula: z.string().trim().min(1).max(30),
            nome: z.string().trim().min(2).max(120),
            usuario: z.string().trim().toLowerCase(),
            ve_todas: z.boolean(),
          }),
        )
        .min(1)
        .max(300),
    }),
  )
  .handler(async ({ data, context }) => {
    const srv = await import("./usuarios.server");
    return srv.executar(async (): Promise<ResultadoLote> => {
      await srv.exigirAdmin(context.userId);
      if (!senhaValida(data.senha)) throw new srv.ErroDeNegocio(`Senha padrão: ${REGRA_SENHA}`);

      const { data: existentes, error } = await srv.supabaseAdmin
        .from("perfis")
        .select("usuario, matricula");
      if (error) throw new Error("Falha ao ler os usuários existentes.");
      const usuarios = new Set(existentes.map((p) => p.usuario));
      const matriculas = new Set(existentes.map((p) => p.matricula).filter(Boolean));

      const r: ResultadoLote = { criados: [], pulados: [] };
      for (const p of data.pessoas) {
        const pular = (motivo: string) =>
          r.pulados.push({ matricula: p.matricula, usuario: p.usuario, motivo });
        if (matriculas.has(p.matricula)) {
          pular("já existe usuário com esta matrícula");
          continue;
        }
        if (usuarios.has(p.usuario)) {
          pular("usuário já existe");
          continue;
        }
        if (!usuarioValido(p.usuario)) {
          pular("usuário inválido");
          continue;
        }
        try {
          await srv.criarLoginEPerfil({
            nome: p.nome,
            usuario: p.usuario,
            perfil: "gerente",
            matricula: p.matricula,
            ve_todas: p.ve_todas,
            senha: data.senha,
          });
          usuarios.add(p.usuario);
          matriculas.add(p.matricula);
          r.criados.push({ matricula: p.matricula, usuario: p.usuario });
        } catch (e) {
          pular(e instanceof srv.ErroDeNegocio ? e.message : "falha ao criar");
        }
      }
      return r;
    });
  });

/** Gera nova senha provisória e obriga a troca no próximo acesso. */
export const redefinirSenha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ userId: userIdSchema }))
  .handler(async ({ data, context }) => {
    const srv = await import("./usuarios.server");
    return srv.executar(async () => {
      await srv.exigirAdmin(context.userId);
      const { data: alvo } = await srv.supabaseAdmin
        .from("perfis")
        .select("usuario")
        .eq("user_id", data.userId)
        .maybeSingle();
      if (!alvo) throw new srv.ErroDeNegocio("Usuário não encontrado.");

      const { gerarSenhaProvisoria } = await import("@/lib/auth/senha");
      const senha = gerarSenhaProvisoria();
      await srv.definirSenha(data.userId, senha);
      const { error } = await srv.supabaseAdmin
        .from("perfis")
        .update({ troca_senha: true, atualizado_em: new Date().toISOString() })
        .eq("user_id", data.userId);
      if (error) throw new Error("Falha ao marcar a troca de senha.");
      return { usuario: alvo.usuario, senha };
    });
  });

/** Ativa ou desativa. Desativado fica bloqueado no login (Supabase Auth) e sem acesso pela RLS. */
export const definirAtivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ userId: userIdSchema, ativo: z.boolean() }))
  .handler(async ({ data, context }) => {
    const srv = await import("./usuarios.server");
    return srv.executar(async () => {
      await srv.exigirAdmin(context.userId);
      const { data: atual } = await srv.supabaseAdmin
        .from("perfis")
        .select("perfil")
        .eq("user_id", data.userId)
        .maybeSingle();
      if (!atual) throw new srv.ErroDeNegocio("Usuário não encontrado.");
      await srv.conferirTravaAdmin(context.userId, data.userId, {
        perfil: atual.perfil,
        ativo: data.ativo,
      });

      // Ao desativar, bloqueia o login primeiro; ao reativar, libera o perfil primeiro.
      if (!data.ativo) await srv.definirBloqueioLogin(data.userId, true);
      const { error } = await srv.supabaseAdmin
        .from("perfis")
        .update({ ativo: data.ativo, atualizado_em: new Date().toISOString() })
        .eq("user_id", data.userId);
      if (error) throw new Error("Falha ao gravar o status.");
      if (data.ativo) await srv.definirBloqueioLogin(data.userId, false);
      return {};
    });
  });

/** O próprio usuário troca a senha (obrigatório no primeiro acesso). */
export const trocarMinhaSenha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ novaSenha: z.string().max(72) }))
  .handler(async ({ data, context }) => {
    const srv = await import("./usuarios.server");
    return srv.executar(async () => {
      if (!senhaValida(data.novaSenha)) throw new srv.ErroDeNegocio(REGRA_SENHA);
      const { data: perfil } = await srv.supabaseAdmin
        .from("perfis")
        .select("ativo")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!perfil?.ativo) throw new srv.ErroDeNegocio("Usuário sem acesso.");

      await srv.definirSenha(context.userId, data.novaSenha);
      const { error } = await srv.supabaseAdmin
        .from("perfis")
        .update({ troca_senha: false, atualizado_em: new Date().toISOString() })
        .eq("user_id", context.userId);
      if (error) throw new Error("Falha ao concluir a troca de senha.");
      return {};
    });
  });
