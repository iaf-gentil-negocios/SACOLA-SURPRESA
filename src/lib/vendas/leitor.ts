// Leitor do relatório "Gerencial de Vendas" do canal App Delivery (F2b) — regra pura.
// Só vale o export com "Quebrar Por Data" (uma linha por loja e dia): o export sem data traz o total
// do período inteiro, não o do dia do nome do arquivo. Valor da venda = GMV (já sem as trocas).
import type { Planilha } from "@/lib/bases/leitor";
import { data, normalizarCabecalho, numero } from "@/lib/bases/valores";

export interface VendaDia {
  bcps: string;
  dia: string; // AAAA-MM-DD
  gmv: number;
  boletos: number;
  /** boletos × itens por boleto */
  itens: number;
}

export interface LeituraVendas {
  linhas: VendaDia[];
  /** Período detectado (menor e maior data do arquivo). */
  inicio: string | null;
  fim: string | null;
  /** BCPS que não estão no cadastro de lojas (ignorados). */
  ignoradas: string[];
  erros: string[];
  total: { gmv: number; boletos: number; lojas: number; dias: number };
}

const COLUNAS = {
  loja: "listar por lojas",
  data: "quebrar por data",
  gmv: "gmv gmv",
  boletos: "gmv qtd de boletos",
  itensPorBoleto: "gmv itens por boleto",
} as const;

export class ArquivoSemData extends Error {}

export function lerVendas(p: Planilha, lojasCadastradas: Set<string>): LeituraVendas {
  const idx = Object.fromEntries(
    Object.entries(COLUNAS).map(([k, nome]) => [k, p.chaves.indexOf(normalizarCabecalho(nome))]),
  ) as Record<keyof typeof COLUNAS, number>;
  if (idx.loja < 0 || idx.gmv < 0)
    throw new Error(
      'Não parece o relatório Gerencial de Vendas: faltam as colunas "Listar Por Lojas" e "GMV-GMV".',
    );
  if (idx.data < 0)
    throw new ArquivoSemData(
      'O arquivo não tem a coluna "Quebrar Por Data". Sem ela o relatório traz o total do período inteiro (não o do dia). Exporte de novo com "Quebrar Por Data".',
    );

  const por = new Map<string, VendaDia>();
  const ignoradas = new Set<string>();
  const erros: string[] = [];
  p.linhas.forEach((l, i) => {
    const loja = String(l[idx.loja] ?? "").trim();
    if (!loja) return;
    const bcps = loja.split(" - ")[0]!.trim();
    const dia = data(l[idx.data]);
    const gmv = numero(l[idx.gmv]);
    if (!dia || gmv === null || Number.isNaN(gmv)) {
      erros.push(`Linha ${p.linhaCabecalho + 1 + i}: data ou GMV inválido.`);
      return;
    }
    if (!lojasCadastradas.has(bcps)) {
      ignoradas.add(bcps);
      return;
    }
    const boletos = Math.max(0, Math.round(numero(l[idx.boletos]) || 0));
    const ipb = Math.max(0, numero(l[idx.itensPorBoleto]) || 0);
    const chave = `${bcps}|${dia}`;
    const atual = por.get(chave);
    por.set(chave, {
      bcps,
      dia,
      gmv: Math.round(((atual?.gmv ?? 0) + gmv) * 100) / 100,
      boletos: (atual?.boletos ?? 0) + boletos,
      itens: Math.round(((atual?.itens ?? 0) + boletos * ipb) * 100) / 100,
    });
  });
  const linhas = [...por.values()].sort(
    (a, b) => a.dia.localeCompare(b.dia) || a.bcps.localeCompare(b.bcps),
  );
  const dias = [...new Set(linhas.map((l) => l.dia))].sort();
  return {
    linhas,
    inicio: dias[0] ?? null,
    fim: dias[dias.length - 1] ?? null,
    ignoradas: [...ignoradas].sort(),
    erros,
    total: {
      gmv: Math.round(linhas.reduce((s, l) => s + l.gmv, 0) * 100) / 100,
      boletos: linhas.reduce((s, l) => s + l.boletos, 0),
      lojas: new Set(linhas.map((l) => l.bcps)).size,
      dias: dias.length,
    },
  };
}
