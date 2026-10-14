// Regras puras das lojas (parte B, 10/10/2026): sem banco, usadas no navegador, no servidor e nos testes.

/** Loja usada pelo motor e pelas metas: só as que participam e estão ativas. */
export const entraNoPlano = (l: { participa: boolean; ativo: boolean }) => l.participa && l.ativo;

/**
 * Loja cujo estoque (cobertura) é gravado no upload: as lojas (Varejo/Híbrida) e qualquer outro
 * centro marcado como "participa". O motor não usa isto: só "participa e ativa" (entraNoPlano).
 */
export const lojaRelevante = (l: { tipo: string; participa?: boolean | undefined }) =>
  l.tipo === "loja" || l.participa === true;

/**
 * Tipo mostrado = exatamente a coluna "Tipo" da dCentros (Varejo, Híbrida, Venda Direta, HUB,
 * Escritório, Estoque). Decidido em 11/10/2026: sem exceções (a QDB se acha pelo filtro de Marca).
 * Lojas gravadas antes com "ER" ou "QDB" aparecem como vieram na dCentros: Venda Direta e Varejo.
 */
const ANTIGOS: Record<string, string> = { ER: "Venda Direta", QDB: "Varejo" };

export function tipoDCentros(tipo: string): string {
  const t = tipo.trim();
  return ANTIGOS[t] ?? t;
}

/** Tipo exibido de uma loja do banco (lojas vindas do lojas.csv não têm tipo da dCentros). */
export function tipoExibido(l: { tipo: string; tipo_dcentros: string | null }): string {
  if (l.tipo_dcentros) return tipoDCentros(l.tipo_dcentros);
  return { loja: "Loja", hub: "HUB", er: "Venda Direta", outro: "Outro" }[l.tipo] ?? l.tipo;
}

/**
 * Cidade a partir do Endereço da dCentros (12/10/2026: a dCentros tem UF, mas não tem coluna de
 * cidade). Formatos vistos: "…, Acaraú - CE, 62580-000, Brazil" e "… - Amontada, CE, 62540-000,
 * Brazil". Devolve null quando não reconhece (a loja vai para a lista de correção do mapa, F2b).
 */
export function cidadeDoEndereco(endereco: string | null, uf: string | null): string | null {
  if (!endereco) return null;
  const partes = endereco.split(",").map((p) => p.trim());
  const ufs = uf ? [uf.toUpperCase()] : null;
  const ehUf = (s: string) => /^[A-Z]{2}$/.test(s) && (!ufs || ufs.includes(s));
  for (let i = 0; i < partes.length; i++) {
    const p = partes[i]!;
    // "Cidade - UF"
    const m = /^(.+?)\s+-\s+([A-Z]{2})$/.exec(p);
    if (m && ehUf(m[2]!)) return limparCidade(m[1]!);
    // "… - Cidade", "UF"
    if (ehUf(p) && i > 0) {
      const antes = partes[i - 1]!;
      const pedacos = antes.split(" - ");
      return limparCidade(pedacos[pedacos.length - 1]!);
    }
  }
  return null;
}

function limparCidade(c: string): string | null {
  const t = c.trim();
  // número de rua ou CEP não é cidade
  return t && !/\d/.test(t) ? t : null;
}

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const CONECTORES_BUSCA = new Set(["de", "da", "do", "das", "dos", "e"]);

/**
 * Busca de loja (12/10/2026): sem acento nem maiúsculas, no nome abreviado, no nome completo da
 * dCentros, no BCPS e na cidade. Vale o texto inteiro ("santa luzia do tide") ou palavra por
 * palavra, cada uma no começo de uma palavra dos nomes, nos dois sentidos ("c mi" → "C Mirim";
 * "santa luzia" → "S Luzia Tide").
 */
export function casaBusca(termo: string, ...textos: (string | null | undefined)[]): boolean {
  const t = normalizar(termo);
  if (!t) return true;
  const alvo = normalizar(textos.filter(Boolean).join(" "));
  if (alvo.includes(t)) return true;
  const palavras = alvo.split(" ");
  return t
    .split(" ")
    .filter((p) => !CONECTORES_BUSCA.has(p))
    .every((p) => palavras.some((w) => w.startsWith(p) || p.startsWith(w)));
}

/**
 * Formas de escrever o código de uma loja (12/10/2026). O SAP vai de 4001 a 4099 só em números;
 * de 4100 em diante aparece de duas formas, 4100… ou A100… (o "4" vira "A"). Devolve todas as formas
 * equivalentes, em maiúsculas, para casar o código com o BCPS, a DIVISÃO ou o SAP da loja.
 */
export function formasDoCodigo(codigo: string | null | undefined): string[] {
  const c = String(codigo ?? "")
    .trim()
    .toUpperCase();
  if (!c) return [];
  const a = /^A(\d{3,})$/.exec(c);
  if (a && Number(a[1]) >= 100) return [c, `4${a[1]}`];
  const n = /^4(\d{3,})$/.exec(c);
  if (n && Number(n[1]) >= 100) return [c, `A${n[1]}`];
  return [c];
}

/** Índice código → BCPS, por BCPS, DIVISÃO e SAP (nas duas formas). */
export function indiceDeCodigos(
  lojas: { bcps: string; divisao?: string | null | undefined; sap?: string | null | undefined }[],
): Map<string, string> {
  const m = new Map<string, string>();
  // o BCPS vale primeiro; depois DIVISÃO e SAP (sem sobrescrever um código já usado)
  for (const l of lojas) for (const k of formasDoCodigo(l.bcps)) m.set(k, l.bcps);
  for (const l of lojas)
    for (const k of [...formasDoCodigo(l.divisao), ...formasDoCodigo(l.sap)])
      if (!m.has(k)) m.set(k, l.bcps);
  return m;
}
