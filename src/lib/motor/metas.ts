// Metas: do total da estratégia ao ciclo, à praça, à loja e ao mês (ESPECIFICACAO §7.1 e §12.3).
import { faixasDaPraca, type Parametros } from "./parametros";

export interface CicloMotor {
  id: number;
  nome: string;
  inicio: string; // AAAA-MM-DD
  fim: string;
  /** F2b (0002j): início da campanha, editado pelo admin; vazio = início do ciclo. */
  inicioCampanha?: string | null | undefined;
}

export interface LojaMeta {
  bcps: string;
  nome: string;
  praca: string;
  vendedoras: number;
}

export interface FaturamentoMes {
  bcps: string;
  mes: string; // AAAA-MM-01
  faturamento: number;
}

export interface MetaLoja {
  bcps: string;
  praca: string;
  meta: number;
  vendedoras: number;
  metaSemana: number;
  metaVendSemana: number | null;
  /** { "AAAA-MM": meta do mês } — meta do ciclo dividida pelos dias de cada mês. */
  metasMes: Record<string, number>;
  sacolasMeta: number;
}

const DIA = 86_400_000;
const utc = (d: string) =>
  Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));

/** Dias do período, contando início e fim. */
export function diasEntre(inicio: string, fim: string): number {
  return Math.round((utc(fim) - utc(inicio)) / DIA) + 1;
}

/** Quantos dias do período caem em cada mês. */
export function diasPorMes(inicio: string, fim: string): Record<string, number> {
  const r: Record<string, number> = {};
  for (let t = utc(inicio); t <= utc(fim); t += DIA) {
    const d = new Date(t);
    const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    r[m] = (r[m] ?? 0) + 1;
  }
  return r;
}

/** Meta de um ciclo conforme a divisão escolhida. */
export function metaDoCiclo(p: Parametros, ciclos: CicloMotor[], cicloId: number): number {
  const c = ciclos.find((x) => x.id === cicloId);
  if (!c) return 0;
  if (
    p.meta_divisao_ciclos === "digitada" &&
    p.meta_ciclos_digitada[String(cicloId)] !== undefined
  ) {
    return p.meta_ciclos_digitada[String(cicloId)]!;
  }
  if (p.meta_divisao_ciclos === "dias") {
    const total = ciclos.reduce((s, x) => s + diasEntre(x.inicio, x.fim), 0) || 1;
    return (p.meta_total * diasEntre(c.inicio, c.fim)) / total;
  }
  return p.meta_total * (p.meta_pesos_ciclos[String(cicloId)] ?? 0);
}

/** Divide a meta do ciclo entre os meses, proporcionalmente aos dias. */
export function metaPorMes(meta: number, ciclo: CicloMotor): Record<string, number> {
  const dias = diasPorMes(ciclo.inicio, ciclo.fim);
  const total = diasEntre(ciclo.inicio, ciclo.fim);
  return Object.fromEntries(Object.entries(dias).map(([m, d]) => [m, (meta * d) / total]));
}

/** Peso de cada loja: faturamento dos meses escolhidos, ou vendedoras. */
export function pesosDasLojas(p: Parametros, lojas: LojaMeta[], faturamento: FaturamentoMes[]) {
  const meses = new Set(p.meta_faturamento_meses);
  const fat = new Map<string, number>();
  for (const f of faturamento) {
    if (meses.has(f.mes.slice(0, 7))) fat.set(f.bcps, (fat.get(f.bcps) ?? 0) + f.faturamento);
  }
  return new Map(
    lojas.map((l) => [
      l.bcps,
      p.meta_divisao_lojas === "vendedoras" ? l.vendedoras : (fat.get(l.bcps) ?? 0),
    ]),
  );
}

export interface MetasDoCiclo {
  metaCiclo: number;
  pracas: { praca: string; meta: number; metaSugerida: number; digitada: boolean }[];
  lojas: MetaLoja[];
}

/** Metas do ciclo por praça e loja. Praça com meta digitada: as lojas dela seguem proporcionais. */
export function metasDoCiclo(
  p: Parametros,
  ciclos: CicloMotor[],
  cicloId: number,
  lojas: LojaMeta[],
  faturamento: FaturamentoMes[],
): MetasDoCiclo {
  const ciclo = ciclos.find((c) => c.id === cicloId);
  const metaCiclo = metaDoCiclo(p, ciclos, cicloId);
  const pesos = pesosDasLojas(p, lojas, faturamento);
  const pesoTotal = [...pesos.values()].reduce((a, b) => a + b, 0) || 1;
  const digitadas = p.meta_pracas_digitada[String(cicloId)] ?? {};
  const dias = ciclo ? diasEntre(ciclo.inicio, ciclo.fim) : 1;

  const nomesPracas = [...new Set(lojas.map((l) => l.praca))].sort();
  const pracas = nomesPracas.map((praca) => {
    const peso = lojas
      .filter((l) => l.praca === praca)
      .reduce((s, l) => s + (pesos.get(l.bcps) ?? 0), 0);
    const metaSugerida = (metaCiclo * peso) / pesoTotal;
    const digitada = digitadas[praca];
    return {
      praca,
      meta: digitada ?? metaSugerida,
      metaSugerida,
      digitada: digitada !== undefined,
      peso,
    };
  });
  const porPraca = new Map(pracas.map((x) => [x.praca, x]));

  const metasLojas: MetaLoja[] = lojas.map((l) => {
    const pr = porPraca.get(l.praca)!;
    const meta = pr.peso > 0 ? (pr.meta * (pesos.get(l.bcps) ?? 0)) / pr.peso : 0;
    const metaSemana = meta / (dias / 7);
    const faixa = faixasDaPraca(p, l.praca);
    return {
      bcps: l.bcps,
      praca: l.praca,
      meta,
      vendedoras: l.vendedoras,
      metaSemana,
      metaVendSemana: l.vendedoras > 0 ? metaSemana / l.vendedoras : null,
      metasMes: ciclo ? metaPorMes(meta, ciclo) : {},
      sacolasMeta: Math.ceil(meta / faixa.pMedio),
    };
  });

  return {
    metaCiclo,
    pracas: pracas.map(({ praca, meta, metaSugerida, digitada }) => ({
      praca,
      meta,
      metaSugerida,
      digitada,
    })),
    lojas: metasLojas,
  };
}
