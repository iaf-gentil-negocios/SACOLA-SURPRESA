// Conversão de valores lidos das planilhas (puras, testáveis).

/** Cabeçalho comparável: minúsculas, sem acento, só letras/números separados por espaço. */
export function normalizarCabecalho(valor: unknown): string {
  return String(valor ?? "")
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Texto limpo ou `null` quando vazio. */
export function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const t = String(valor).replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
}

/** Código (SKU, BCPS, matrícula): número vira texto sem casas decimais. */
export function codigo(valor: unknown): string | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return String(Math.trunc(valor));
  const t = texto(valor);
  if (t === null) return null;
  return /^\d+\.0+$/.test(t) ? t.replace(/\.0+$/, "") : t;
}

/**
 * Número em formato brasileiro ou internacional.
 * "1.234,56" → 1234.56 · "58,06" → 58.06 · "174.9" → 174.9 · "∞" → Infinity · "" → null.
 * Retorna NaN quando não dá para ler.
 */
export function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return valor;
  let t = String(valor)
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/%$/, "")
    .replace(/\s/g, "");
  if (t === "") return null;
  if (t === "∞" || /^inf/i.test(t)) return Infinity;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function booleano(valor: unknown): boolean | null {
  if (typeof valor === "boolean") return valor;
  const t = normalizarCabecalho(valor);
  if (["true", "sim", "s", "1", "verdadeiro", "x"].includes(t)) return true;
  if (["false", "nao", "n", "0", "falso", ""].includes(t)) return t === "" ? null : false;
  return null;
}

function doisDigitos(n: number) {
  return String(n).padStart(2, "0");
}

/** Número de série de data do Excel (1 = 01/01/1900) para AAAA-MM-DD. */
function serialExcel(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  const ms = Math.round((serial - 25569) * 86_400_000); // 25569 = 01/01/1970
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${doisDigitos(d.getUTCMonth() + 1)}-${doisDigitos(d.getUTCDate())}`;
}

/** Data em AAAA-MM-DD a partir de serial do Excel, Date, "dd/mm/aaaa" ou "aaaa-mm-dd". */
export function data(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return serialExcel(valor);
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    // meio-dia evita virar o dia por fuso horário
    const d = new Date(valor.getTime() + 12 * 3_600_000);
    return `${d.getUTCFullYear()}-${doisDigitos(d.getUTCMonth() + 1)}-${doisDigitos(d.getUTCDate())}`;
  }
  const t = String(valor).trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (m) return `${m[3]}-${doisDigitos(Number(m[2]))}-${doisDigitos(Number(m[1]))}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{4})-(\d{2})$/.exec(t);
  if (m) return `${m[1]}-${m[2]}-01`;
  return null;
}

/** Mês (AAAA-MM) de uma data. */
export function mes(valor: unknown): string | null {
  return data(valor)?.slice(0, 7) ?? null;
}

/** Data AAAA-MM-DD no nome do arquivo (ex.: cobertura_2026-10-07.csv). */
export function dataDoNomeDoArquivo(nome: string): string | null {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(nome) ?? /(\d{2})[._-](\d{2})[._-](\d{4})/.exec(nome);
  if (!m) return null;
  return m[1]!.length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2]}-${m[1]}`;
}
