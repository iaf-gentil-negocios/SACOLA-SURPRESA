// Só servidor: grava simulações e define bases com a service_role.
// Importar apenas de dentro dos handlers em simulacoes.functions.ts.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { ErroDeNegocio } from "@/lib/acessos/usuarios.server";

export { executar, exigirAdmin } from "@/lib/acessos/usuarios.server";

function falhou(acao: string, error: { message: string } | null) {
  if (error) {
    console.error(acao, error);
    throw new Error(`${acao}: ${error.message}`);
  }
}

export async function iniciarSimulacao(
  userId: string,
  d: {
    nome: string;
    ciclo: number;
    semente: number;
    pracas: string[] | null;
    parametros: Json;
    resumo: Json;
  },
) {
  const { data, error } = await supabaseAdmin
    .from("simulacoes")
    .insert({ ...d, nome: d.nome.trim(), status: "gravando", criado_por: userId })
    .select("id")
    .single();
  falhou("Falha ao registrar a simulação", error);
  return { id: data!.id };
}

async function emGravacao(id: number) {
  const { data, error } = await supabaseAdmin
    .from("simulacoes")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  falhou("Falha ao ler a simulação", error);
  if (!data) throw new ErroDeNegocio("Simulação não encontrada.");
  if (data.status !== "gravando") throw new ErroDeNegocio("Esta simulação já foi concluída.");
}

export async function concluirSimulacao(id: number) {
  await emGravacao(id);
  const { error } = await supabaseAdmin.from("simulacoes").update({ status: "salva" }).eq("id", id);
  falhou("Falha ao concluir a simulação", error);
  return {};
}

export async function definirBase(
  userId: string,
  d: { simulacaoId: number; nome: string; inicio: string; fim: string },
) {
  const { data, error } = await supabaseAdmin.rpc("definir_base", {
    p_simulacao: d.simulacaoId,
    p_nome: d.nome,
    p_inicio: d.inicio,
    p_fim: d.fim,
    p_usuario: userId,
  });
  // erros de regra (período, sobreposição) vêm do banco com mensagem em português
  if (error) {
    if (/período|sobrep|não encontrada|ciclo/i.test(error.message))
      throw new ErroDeNegocio(error.message);
    falhou("Falha ao definir a base", error);
  }
  return { planoId: data as number };
}
