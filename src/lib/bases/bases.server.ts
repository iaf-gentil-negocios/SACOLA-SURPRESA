// Só servidor: grava as bases com a service_role, em lotes.
// Importar apenas de dentro dos handlers em bases.functions.ts.
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { ErroDeNegocio } from "@/lib/acessos/usuarios.server";
import {
  ESQUEMAS,
  TAMANHO_LOTE,
  type BaseId,
  type Estoque,
  type Faturamento,
  type InfoLoja,
  type Loja,
  type Parte,
  type Produto,
  type Promocao,
  type SkuCobertura,
  type Vendedoras,
  type Vinculo,
} from "./esquemas";

export { executar, exigirAdmin } from "@/lib/acessos/usuarios.server";

const agora = () => new Date().toISOString();

/** Tira as chaves com `undefined`: campo ausente no arquivo não sobrescreve o que está no banco. */
function semIndefinidos<T extends object>(o: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}

function falhou(acao: string, error: { message: string } | null) {
  if (error) {
    console.error(acao, error);
    throw new Error(`${acao}: ${error.message}`);
  }
}

export async function iniciarEnvio(
  userId: string,
  d: {
    base: BaseId;
    ciclo: number | null;
    versaoRef: string | null;
    arquivo: string;
    detalhes: Json;
  },
) {
  if (d.base === "promocao" && !d.ciclo) throw new ErroDeNegocio("Informe o ciclo da promoção.");
  if (d.base === "cobertura" && !d.versaoRef)
    throw new ErroDeNegocio("Informe a data de referência da cobertura.");

  // um envio por base de cada vez: o anterior que ficou pela metade é abandonado
  let abandonar = supabaseAdmin
    .from("bases_envios")
    .update({ status: "abandonado" })
    .eq("base", d.base)
    .eq("status", "em_andamento");
  if (d.base === "promocao") abandonar = abandonar.eq("ciclo", d.ciclo!);
  falhou("Falha ao encerrar envio anterior", (await abandonar).error);

  const { data, error } = await supabaseAdmin
    .from("bases_envios")
    .insert({
      base: d.base,
      ciclo: d.base === "promocao" ? d.ciclo : null,
      versao_ref: d.versaoRef,
      arquivo: d.arquivo.slice(0, 200),
      enviado_por: userId,
      status: "em_andamento",
      detalhes: d.detalhes,
    })
    .select("id")
    .single();
  falhou("Falha ao registrar o envio", error);
  return { envioId: data!.id };
}

async function envioEmAndamento(envioId: number, base: BaseId) {
  const { data, error } = await supabaseAdmin
    .from("bases_envios")
    .select("id, base, ciclo, versao_ref, status")
    .eq("id", envioId)
    .maybeSingle();
  falhou("Falha ao ler o envio", error);
  if (!data || data.base !== base) throw new ErroDeNegocio("Envio não encontrado.");
  if (data.status !== "em_andamento") {
    throw new ErroDeNegocio(
      "Este envio foi encerrado (talvez outro envio da mesma base tenha começado). Envie de novo.",
    );
  }
  return data;
}

export async function gravarLote(d: {
  envioId: number;
  base: BaseId;
  parte: Parte;
  linhas: unknown[];
}) {
  const esquema = ESQUEMAS[`${d.base}:${d.parte}`];
  if (!esquema) throw new ErroDeNegocio(`Parte "${d.parte}" não existe para a base ${d.base}.`);
  if (d.linhas.length > TAMANHO_LOTE) throw new ErroDeNegocio("Lote grande demais.");
  const lido = z.array(esquema).safeParse(d.linhas);
  if (!lido.success) {
    const p = lido.error.issues[0];
    throw new ErroDeNegocio(`Linha inválida no lote (${p?.path.join(".")}: ${p?.message}).`);
  }
  const envio = await envioEmAndamento(d.envioId, d.base);
  const envio_id = envio.id;
  const db = supabaseAdmin;
  const chave = `${d.base}:${d.parte}` as const;

  switch (chave) {
    case "lojas:registros": {
      const linhas = (lido.data as Loja[]).map((l) => ({
        ...semIndefinidos(l),
        ativo: true,
        envio_id,
        atualizado_em: agora(),
      }));
      // "participa" não vai no upsert: loja nova nasce "não participa" e a existente mantém a escolha.
      // `as never`: colunas da parte B e o tipo "outro" ainda não estão no types.ts (ver src/lib/lojas/lojas.ts).
      falhou(
        "Falha ao gravar lojas",
        (await db.from("lojas").upsert(linhas as never, { onConflict: "bcps" })).error,
      );
      break;
    }
    case "gerentes:registros": {
      const vinculos = lido.data as Vinculo[];
      const nomes = new Map(vinculos.map((v) => [v.matricula, v.nome]));
      const gerentes = [...nomes].map(([matricula, nome]) => ({ matricula, nome }));
      falhou(
        "Falha ao gravar gerentes",
        (await db.from("gerentes").upsert(gerentes, { onConflict: "matricula" })).error,
      );
      const elos = vinculos.map(({ bcps, nivel, matricula }) => ({
        bcps,
        nivel,
        matricula,
        envio_id,
      }));
      falhou(
        "Falha ao gravar o escopo sugerido",
        (await db.from("gerentes_lojas").upsert(elos, { onConflict: "matricula,bcps,nivel" }))
          .error,
      );
      break;
    }
    case "gerentes:lojas": {
      const { error } = await db.rpc("aplicar_info_lojas", {
        p_dados: lido.data as InfoLoja[] as unknown as Json,
      });
      falhou("Falha ao gravar divisão e canais das lojas", error);
      break;
    }
    case "vendedoras:registros": {
      const mapa = Object.fromEntries(
        (lido.data as Vendedoras[]).map((v) => [v.bcps, v.vendedoras]),
      );
      falhou(
        "Falha ao gravar vendedoras",
        (await db.rpc("aplicar_vendedoras", { p_dados: mapa })).error,
      );
      break;
    }
    case "produtos:registros": {
      const linhas = (lido.data as Produto[]).map((p) => ({
        ...semIndefinidos(p),
        envio_id,
        atualizado_em: agora(),
      }));
      falhou(
        "Falha ao gravar produtos",
        (await db.from("produtos").upsert(linhas, { onConflict: "sku" })).error,
      );
      break;
    }
    case "cobertura:skus": {
      // SKUs da cobertura que não estão no cadastro: entram com a descrição; fornecedor/marca vêm depois
      const linhas = (lido.data as SkuCobertura[]).map((s) => ({
        ...s,
        origem_cadastro: "cobertura",
        origem_fornecedor: "nao_encontrado",
        envio_id,
      }));
      falhou(
        "Falha ao gravar SKUs da cobertura",
        (await db.from("produtos").upsert(linhas, { onConflict: "sku", ignoreDuplicates: true }))
          .error,
      );
      break;
    }
    case "cobertura:registros": {
      const linhas = (lido.data as Estoque[]).map((e) => ({
        ...e,
        base_versao: envio.versao_ref!,
        envio_id,
      }));
      falhou(
        "Falha ao gravar a cobertura",
        (await db.from("estoque").upsert(linhas, { onConflict: "bcps,sku" })).error,
      );
      break;
    }
    case "promocao:registros": {
      const linhas = (lido.data as Promocao[]).map((p) => ({
        ...p,
        ciclo: envio.ciclo!,
        envio_id,
      }));
      falhou(
        "Falha ao gravar a promoção",
        (await db.from("promocoes").upsert(linhas, { onConflict: "ciclo,sku" })).error,
      );
      break;
    }
    case "faturamento:registros": {
      const linhas = (lido.data as Faturamento[]).map((f) => ({ ...f, envio_id }));
      falhou(
        "Falha ao gravar o faturamento",
        (await db.from("faturamento_mensal").upsert(linhas, { onConflict: "bcps,mes" })).error,
      );
      break;
    }
    default:
      throw new ErroDeNegocio(`Parte "${d.parte}" não existe para a base ${d.base}.`);
  }
  return { gravadas: lido.data.length };
}

export async function concluirEnvio(envioId: number) {
  const { data, error } = await supabaseAdmin.rpc("finalizar_envio", { p_envio: envioId });
  falhou("Falha ao concluir o envio", error);
  return { resultado: data as Record<string, number> };
}

export async function cancelarEnvio(envioId: number) {
  const { error } = await supabaseAdmin
    .from("bases_envios")
    .update({ status: "abandonado" })
    .eq("id", envioId)
    .eq("status", "em_andamento");
  falhou("Falha ao cancelar o envio", error);
  return {};
}

/**
 * Exclui os dados de uma base para subir outra. Lojas não são apagadas: ficam inativas.
 * Sem mudança no banco: usa só delete/update que a service_role já pode fazer.
 * O último envio concluído da base fica marcado com `excluida_em` (aparece no cartão).
 */
export async function excluirBase(d: { base: BaseId; ciclo: number | null }) {
  const db = supabaseAdmin;
  const agoraIso = agora();
  switch (d.base) {
    case "lojas":
      falhou(
        "Falha ao inativar as lojas",
        (await db.from("lojas").update({ ativo: false, atualizado_em: agoraIso }).eq("ativo", true))
          .error,
      );
      break;
    case "gerentes":
      falhou(
        "Falha ao excluir o escopo sugerido",
        (await db.from("gerentes_lojas").delete().neq("matricula", "")).error,
      );
      falhou(
        "Falha ao excluir os gerentes",
        (await db.from("gerentes").delete().neq("matricula", "")).error,
      );
      break;
    case "vendedoras":
      falhou(
        "Falha ao zerar as vendedoras",
        (await db.rpc("aplicar_vendedoras", { p_dados: {} })).error,
      );
      break;
    case "produtos":
      falhou(
        "Falha ao excluir os produtos",
        (await db.from("produtos").delete().neq("sku", "")).error,
      );
      break;
    case "cobertura":
      falhou(
        "Falha ao excluir a cobertura",
        (await db.from("estoque").delete().neq("sku", "")).error,
      );
      break;
    case "promocao":
      if (!d.ciclo) throw new ErroDeNegocio("Informe o ciclo da promoção.");
      falhou(
        "Falha ao excluir a promoção",
        (await db.from("promocoes").delete().eq("ciclo", d.ciclo)).error,
      );
      break;
    case "faturamento":
      falhou(
        "Falha ao excluir o faturamento",
        (await db.from("faturamento_mensal").delete().neq("bcps", "")).error,
      );
      break;
  }
  let q = db
    .from("bases_envios")
    .select("id, detalhes")
    .eq("base", d.base)
    .eq("status", "concluido");
  if (d.base === "promocao") q = q.eq("ciclo", d.ciclo!);
  const { data, error } = await q.order("concluido_em", { ascending: false }).limit(1);
  falhou("Falha ao registrar a exclusão", error);
  const ultimo = data?.[0];
  if (ultimo) {
    const detalhes = {
      ...((ultimo.detalhes ?? {}) as Record<string, Json>),
      excluida_em: agoraIso,
    };
    falhou(
      "Falha ao registrar a exclusão",
      (await db.from("bases_envios").update({ detalhes }).eq("id", ultimo.id)).error,
    );
  }
  return {};
}
