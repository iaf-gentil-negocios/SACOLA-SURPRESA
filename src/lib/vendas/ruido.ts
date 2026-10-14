// Ruído e venda da Sacola estimada (F2b) — regras puras, rodam no navegador.
//
// Ruído = o que o canal App Delivery vende sem a Sacola. Por loja e dia da semana: mediana das vendas
// do canal nas 8 semanas (56 dias) antes do início da campanha. Antes da mediana saem os dias muito
// acima do normal da loja (outliers), pela regra de Tukey: acima de Q3 + 1,5 × (Q3 − Q1), com os
// quartis dos 56 dias da loja (dia sem venda = 0). Durante a campanha nada é tirado (pode ser Sacola).
// Loja sem venda no histórico (ou nova no canal) = ruído 0.
// Venda da Sacola estimada = venda do canal − ruído do dia da semana (nunca abaixo de 0).
import type { VendaDia } from "./leitor";

export const DIAS_HISTORICO = 56;
export const FATOR_IQR = 1.5;

export interface RuidoLoja {
  bcps: string;
  dow: number; // 0 = domingo … 6 = sábado
  ruido: number;
  dias_historico: number;
  outliers: number;
}

const dia = (iso: string) => new Date(`${iso}T12:00:00Z`);
export const somarDias = (iso: string, n: number) =>
  new Date(dia(iso).getTime() + n * 86_400_000).toISOString().slice(0, 10);
export const diaDaSemana = (iso: string) => dia(iso).getUTCDay();

/** Quantil com interpolação linear (o mesmo do Excel QUARTIL.INC). */
export function quantil(ordenados: number[], q: number): number {
  if (!ordenados.length) return 0;
  const pos = (ordenados.length - 1) * q;
  const base = Math.floor(pos);
  const resto = pos - base;
  const prox = ordenados[base + 1];
  return prox === undefined
    ? ordenados[base]!
    : ordenados[base]! + resto * (prox - ordenados[base]!);
}

export function mediana(valores: number[]): number {
  return quantil(
    [...valores].sort((a, b) => a - b),
    0.5,
  );
}

/** Janela do histórico: os 56 dias antes do início da campanha. */
export function janelaDoHistorico(inicioCampanha: string) {
  return { inicio: somarDias(inicioCampanha, -DIAS_HISTORICO), fim: somarDias(inicioCampanha, -1) };
}

/**
 * Ruído de cada loja com venda no histórico. `cobertos` = dias da janela que algum envio cobriu
 * (dia coberto sem linha = venda 0; dia não coberto não entra na conta).
 */
export function calcularRuido(
  vendas: VendaDia[],
  inicioCampanha: string,
  cobertos: Set<string>,
): RuidoLoja[] {
  const { inicio } = janelaDoHistorico(inicioCampanha);
  const dias = Array.from({ length: DIAS_HISTORICO }, (_, i) => somarDias(inicio, i)).filter((d) =>
    cobertos.has(d),
  );
  if (!dias.length) return [];
  const porLoja = new Map<string, Map<string, number>>();
  for (const v of vendas) {
    if (!cobertos.has(v.dia) || v.dia < inicio || v.dia >= inicioCampanha) continue;
    const m = porLoja.get(v.bcps) ?? new Map<string, number>();
    m.set(v.dia, (m.get(v.dia) ?? 0) + Math.max(0, v.gmv));
    porLoja.set(v.bcps, m);
  }
  const r: RuidoLoja[] = [];
  for (const [bcps, m] of porLoja) {
    const serie = dias.map((d) => ({ d, v: m.get(d) ?? 0 }));
    const ordenados = serie.map((x) => x.v).sort((a, b) => a - b);
    const q1 = quantil(ordenados, 0.25);
    const q3 = quantil(ordenados, 0.75);
    const limite = q3 + FATOR_IQR * (q3 - q1);
    const fora = serie.filter((x) => x.v > limite);
    const ficam = serie.filter((x) => x.v <= limite);
    for (let dow = 0; dow < 7; dow++) {
      const valores = ficam.filter((x) => diaDaSemana(x.d) === dow).map((x) => x.v);
      r.push({
        bcps,
        dow,
        ruido: Math.round(mediana(valores) * 100) / 100,
        dias_historico: dias.length,
        outliers: fora.filter((x) => diaDaSemana(x.d) === dow).length,
      });
    }
  }
  return r.sort((a, b) => a.bcps.localeCompare(b.bcps) || a.dow - b.dow);
}

/** Dias cobertos por algum envio (o período do arquivo, mesmo os dias sem linha). */
export function diasCobertos(envios: { inicio: string; fim: string }[]): Set<string> {
  const s = new Set<string>();
  for (const e of envios)
    for (let d = e.inicio; d <= e.fim; d = somarDias(d, 1)) {
      s.add(d);
      if (s.size > 5000) break; // proteção contra período absurdo
    }
  return s;
}

export interface VendaLoja {
  bcps: string;
  /** Venda do canal no período (GMV). */
  canal: number;
  boletos: number;
  /** Ruído descontado (soma do que foi tirado em cada dia). */
  ruido: number;
  /** Venda da Sacola estimada (R$). */
  estimado: number;
}

/** Venda da Sacola estimada por loja no período [inicio, fim]. */
export function vendasPorLoja(
  vendas: VendaDia[],
  ruidos: RuidoLoja[],
  inicio: string,
  fim: string,
): Map<string, VendaLoja> {
  const ruidoDe = new Map(ruidos.map((x) => [`${x.bcps}|${x.dow}`, x.ruido]));
  const r = new Map<string, VendaLoja>();
  for (const v of vendas) {
    if (v.dia < inicio || v.dia > fim) continue;
    const ruido = ruidoDe.get(`${v.bcps}|${diaDaSemana(v.dia)}`) ?? 0;
    const estimado = Math.max(0, v.gmv - ruido);
    const x = r.get(v.bcps) ?? { bcps: v.bcps, canal: 0, boletos: 0, ruido: 0, estimado: 0 };
    x.canal += v.gmv;
    x.boletos += v.boletos;
    x.ruido += v.gmv - estimado;
    x.estimado += estimado;
    r.set(v.bcps, x);
  }
  return r;
}

/** Venda estimada de uma loja num período (para a comparação com a declaração do GVO). */
export function estimadoNoPeriodo(
  vendas: VendaDia[],
  ruidos: RuidoLoja[],
  bcps: string,
  inicio: string,
  fim: string,
): number {
  return (
    vendasPorLoja(
      vendas.filter((v) => v.bcps === bcps),
      ruidos,
      inicio,
      fim,
    ).get(bcps)?.estimado ?? 0
  );
}

export interface AvisoArquivo {
  suspeito: boolean;
  motivos: string[];
}

/**
 * Arquivo suspeito (outro canal ou nenhum selecionado): média diária mais de 5× a do histórico, ou
 * muitas lojas que nunca venderam no canal. Só avisa; não bloqueia.
 */
export function avisarArquivo(
  arquivo: { linhas: VendaDia[]; inicio: string | null; fim: string | null },
  historico: { linhas: VendaDia[]; diasCobertos: number },
): AvisoArquivo {
  const motivos: string[] = [];
  if (!arquivo.inicio || !arquivo.fim || !historico.diasCobertos)
    return { suspeito: false, motivos };
  const diasArquivo = (dia(arquivo.fim).getTime() - dia(arquivo.inicio).getTime()) / 86_400_000 + 1;
  const mediaArquivo = arquivo.linhas.reduce((s, l) => s + l.gmv, 0) / diasArquivo;
  const mediaHist = historico.linhas.reduce((s, l) => s + l.gmv, 0) / historico.diasCobertos;
  if (mediaHist > 0 && mediaArquivo > 5 * mediaHist)
    motivos.push(
      `Média diária do arquivo (R$ ${Math.round(mediaArquivo).toLocaleString("pt-BR")}) é ${(mediaArquivo / mediaHist).toFixed(1)}× a do histórico do canal (R$ ${Math.round(mediaHist).toLocaleString("pt-BR")}).`,
    );
  const jaVenderam = new Set(historico.linhas.filter((l) => l.gmv > 0).map((l) => l.bcps));
  const novas = new Set(
    arquivo.linhas.filter((l) => l.gmv > 0 && !jaVenderam.has(l.bcps)).map((l) => l.bcps),
  );
  const comVenda = new Set(arquivo.linhas.filter((l) => l.gmv > 0).map((l) => l.bcps)).size;
  if (jaVenderam.size > 0 && novas.size >= 5 && novas.size > 0.3 * comVenda)
    motivos.push(`${novas.size} de ${comVenda} lojas com venda nunca venderam no canal antes.`);
  return { suspeito: motivos.length > 0, motivos };
}
