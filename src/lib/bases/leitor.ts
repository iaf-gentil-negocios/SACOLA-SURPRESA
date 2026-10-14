// Leitura de CSV e XLSX no navegador. Devolve as planilhas como linhas de células.
import Papa from "papaparse";
import * as XLSX from "xlsx";

import { normalizarCabecalho } from "./valores";

export interface Planilha {
  nome: string;
  /** Cabeçalho como veio no arquivo. */
  cabecalho: string[];
  /** Cabeçalho normalizado (ver normalizarCabecalho). */
  chaves: string[];
  /** Linhas de dados (sem o cabeçalho). */
  linhas: unknown[][];
  /** Número da linha do cabeçalho no arquivo (1 = primeira). */
  linhaCabecalho: number;
}

function montar(nome: string, todas: unknown[][]): Planilha | null {
  // cabeçalho = primeira linha (entre as 15 primeiras) com 3+ células preenchidas
  // (ou com todas as colunas, quando o arquivo tem 1 ou 2 colunas, ex.: bcps,vendedoras)
  const cheias = (l: unknown[]) =>
    l.filter((c) => c !== null && c !== undefined && String(c).trim() !== "").length;
  const maxColunas = Math.max(0, ...todas.slice(0, 15).map(cheias));
  const minimo = Math.min(3, Math.max(1, maxColunas));
  const i = todas.slice(0, 15).findIndex((l) => cheias(l) >= minimo);
  if (i < 0) return null;
  const cabecalho = (todas[i] ?? []).map((c) =>
    String(c ?? "")
      .replace(/^\uFEFF/, "")
      .trim(),
  );
  const linhas = todas
    .slice(i + 1)
    .filter((l) => l.some((c) => c !== null && c !== undefined && String(c).trim() !== ""));
  return {
    nome,
    cabecalho,
    chaves: cabecalho.map(normalizarCabecalho),
    linhas,
    linhaCabecalho: i + 1,
  };
}

/** Texto do arquivo: tenta UTF-8; se não for válido, lê como Windows-1252 (Excel brasileiro). */
async function textoDoArquivo(arquivo: File): Promise<string> {
  const bytes = await arquivo.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export async function lerArquivo(arquivo: File): Promise<Planilha[]> {
  const nome = arquivo.name.toLowerCase();

  if (nome.endsWith(".csv") || nome.endsWith(".txt")) {
    const conteudo = await textoDoArquivo(arquivo);
    const r = Papa.parse<string[]>(conteudo, { delimiter: "", skipEmptyLines: "greedy" });
    const p = montar(arquivo.name, r.data);
    return p ? [p] : [];
  }

  if (nome.endsWith(".xlsx") || nome.endsWith(".xls") || nome.endsWith(".xlsm")) {
    const wb = XLSX.read(await arquivo.arrayBuffer(), { dense: true, cellDates: false });
    const planilhas: Planilha[] = [];
    for (const aba of wb.SheetNames) {
      const folha = wb.Sheets[aba];
      if (!folha) continue;
      const todas = XLSX.utils.sheet_to_json<unknown[]>(folha, {
        header: 1,
        raw: true,
        defval: null,
      });
      const p = montar(aba, todas);
      if (p) planilhas.push(p);
    }
    return planilhas;
  }

  throw new Error("Formato não suportado. Envie .csv ou .xlsx.");
}
