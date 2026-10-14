// Nicho do produto (F, M, I, U) quando a base não informa (ESPECIFICACAO §5.2, pendência 16).
// Ordem: subcategoria → marca (listas da referência) → palavras na descrição → U.

export type Nicho = "F" | "M" | "I" | "U";
export type OrigemNicho = "base" | "subcategoria" | "marca" | "descricao" | "padrao_u";

/** Marcas femininas e masculinas (referencia/app_atual.js: MARCA_F e MARCA_M). */
export const MARCA_F = new Set([
  "NATIVA SPA",
  "LILY",
  "ESSENCE",
  "FLORATTA",
  "ELYSEE",
  "LIZ",
  "GLAMOUR",
  "INTENSE",
  "MAKE B.",
  "HER CODE",
  "ACCORDES",
  "CELEBRE",
  "THE BLEND",
]);
export const MARCA_M = new Set([
  "MALBEC",
  "QUASAR",
  "ZAAD",
  "UOMINI",
  "ARBO",
  "BOTICARIO MEN",
  "CLASH",
  "BOTICA 214 MEN",
]);

export function nichoInferido(
  subcategoria: string | null,
  marca: string | null,
  descricao: string | null,
): { nicho: Nicho; origem: Exclude<OrigemNicho, "base"> } {
  const sub = (subcategoria ?? "").toUpperCase();
  if (sub.includes("FEMININ")) return { nicho: "F", origem: "subcategoria" };
  if (sub.includes("MASCULIN")) return { nicho: "M", origem: "subcategoria" };
  if (/INFANT|KIDS|BABY/.test(sub)) return { nicho: "I", origem: "subcategoria" };
  const m = (marca ?? "").toUpperCase().trim();
  if (MARCA_F.has(m)) return { nicho: "F", origem: "marca" };
  if (MARCA_M.has(m)) return { nicho: "M", origem: "marca" };
  if (/\b(BABY|KIDS|INFANTIL)\b/i.test(descricao ?? "")) return { nicho: "I", origem: "descricao" };
  return { nicho: "U", origem: "padrao_u" };
}
