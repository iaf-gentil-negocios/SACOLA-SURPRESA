// Resumo de estoque por loja (F2a): logo depois de uma Cobertura concluída, o navegador do admin —
// que acabou de ler o arquivo — calcula SKUs, unidades, valor a custo, parados e heróis disponíveis
// de cada loja e grava só esse resumo (resumo_estoque_lojas). O dashboard lê o resumo.
import { supabase } from "@/integrations/supabase/client";
import { repositorio } from "@/lib/dados";
import { hojeEmSaoPaulo } from "@/lib/dados/periodo";
import { resumirEstoque, skusHeroiDoCiclo } from "@/lib/painel/estoque";

import type { Analise } from "./analise";
import type { Estoque } from "./esquemas";

/** SKUs em promoção no ciclo (consulta pequena: só a promoção do ciclo). */
async function promocaoDoCiclo(ciclo: number) {
  const r: { sku: string; desconto_pct: number }[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from("promocoes")
      .select("sku, desconto_pct")
      .eq("ciclo", ciclo)
      .gt("desconto_pct", 0)
      .order("sku")
      .range(de, de + 999);
    if (error) throw new Error(error.message);
    r.push(...data.map((x) => ({ sku: x.sku, desconto_pct: Number(x.desconto_pct) })));
    if (data.length < 1000) return r;
  }
}

/** Regular e fornecedor só dos SKUs pedidos (os da promoção), em grupos de 300. */
async function produtosDe(skus: string[]) {
  const m = new Map<string, { regular: boolean; fornecedor: string | null }>();
  for (let i = 0; i < skus.length; i += 300) {
    const { data, error } = await supabase
      .from("produtos")
      .select("sku, regular, fornecedor")
      .in("sku", skus.slice(i, i + 300));
    if (error) throw new Error(error.message);
    for (const p of data) m.set(p.sku, { regular: p.regular, fornecedor: p.fornecedor });
  }
  return m;
}

export async function resumoAposCobertura(
  a: Analise,
  ciclos: { id: number; fim: string }[],
): Promise<number> {
  const ref = a.versaoRef;
  if (a.base !== "cobertura" || !ref) return 0;
  const linhas = (a.partes.find((p) => p.parte === "registros")?.linhas ?? []) as Estoque[];
  const parametros = await repositorio.parametros();
  const hoje = hojeEmSaoPaulo();
  const herois = new Map<number, Set<string>>();
  for (const c of ciclos.filter((c) => c.fim >= hoje)) {
    const promo = await promocaoDoCiclo(c.id);
    if (!promo.length) continue; // ciclo sem promoção: sem contagem de heróis
    herois.set(c.id, skusHeroiDoCiclo(promo, await produtosDe(promo.map((x) => x.sku))));
  }
  const resumo = resumirEstoque(linhas, ref, herois, parametros);
  await repositorio.gravarResumoEstoque(resumo);
  return resumo.length;
}
