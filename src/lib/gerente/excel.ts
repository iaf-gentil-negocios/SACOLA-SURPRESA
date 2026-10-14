// Exportação para Excel do gerente (ESPECIFICACAO §9.5): aba Kits (uma linha por item) + aba Metas.
import * as XLSX from "xlsx";

import { NOME_TEMA } from "@/lib/motor/temas";

import type { DadosBase } from "./base";

const PAPEL: Record<string, string> = { heroi: "Herói", surpresa: "Surpresa", mimo: "Mimo" };

export function linhasExcel(d: DadosBase) {
  const loja = new Map(d.lojas.map((l) => [l.bcps, l]));
  const kits = d.kits.flatMap((k) =>
    k.lojas.flatMap((kl) =>
      k.itens.map((i) => ({
        Praça: loja.get(kl.bcps)?.praca ?? "",
        Loja: loja.get(kl.bcps)?.nome ?? kl.bcps,
        Kit: k.codigo,
        Tema: NOME_TEMA[k.tema] ?? k.tema,
        Preço: k.preco,
        "Valor cheio": k.valorCheio,
        "Desconto %": k.descontoPct,
        "Qtd na loja": kl.qtd,
        // F1b: com o estoque do dia (vazio = ainda sem disponibilidade)
        "Pode montar hoje": kl.disponivel ?? "",
        Papel: PAPEL[i.papel] ?? i.papel,
        SKU: i.sku,
        Produto: i.descricao,
        "Preço do item": i.precoItem,
      })),
    ),
  );
  const meses = [...new Set(d.lojas.flatMap((l) => Object.keys(l.metasMes)))].sort();
  const metas = d.lojas.map((l) => ({
    Praça: l.praca,
    Loja: l.nome,
    BCPS: l.bcps,
    "Meta do ciclo": Math.round(l.meta * 100) / 100,
    ...Object.fromEntries(
      meses.map((m) => [`Meta ${m}`, Math.round((l.metasMes[m] ?? 0) * 100) / 100]),
    ),
    "Meta por semana": Math.round(l.metaSemana * 100) / 100,
    Vendedoras: l.vendedoras,
    "Meta por vendedora/semana":
      l.metaVendSemana === null ? "" : Math.round(l.metaVendSemana * 100) / 100,
  }));
  return { kits, metas };
}

export function baixarExcel(d: DadosBase) {
  const { kits, metas } = linhasExcel(d);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kits), "Kits");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metas), "Metas");
  const nome = `sacola-surpresa_${d.base.nome.replace(/[^\w-]+/g, "_")}.xlsx`;
  XLSX.writeFile(wb, nome);
}
