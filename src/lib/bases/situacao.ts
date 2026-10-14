// Situação das bases na tela Bases (parte D, 10/10/2026) — regras puras.
// - Cada base é "fixa" ou "variável" (escolha do admin, salva em parametros.bases_classificacao).
// - Base variável sem envio concluído há mais de 24 h (ou sem envio) está desatualizada:
//   aviso na faixa do topo das telas do admin e no card.
import { BASES, type BaseId } from "./esquemas";

export type Classe = "fixa" | "variavel";
export type Classificacao = Record<BaseId, Classe>;

/** Chave na tabela parametros (só admin). O motor ignora chaves que não são dele. */
export const CHAVE_CLASSIFICACAO = "bases_classificacao";

/** Divisão inicial (decidida em 10/10/2026): só a Cobertura é variável. */
export const CLASSIFICACAO_PADRAO: Classificacao = {
  lojas: "fixa",
  gerentes: "fixa",
  vendedoras: "fixa",
  produtos: "fixa",
  cobertura: "variavel",
  promocao: "fixa",
  faturamento: "fixa",
};

/** Lê o valor salvo; o que faltar ou vier errado fica com o padrão. */
export function classificacaoDe(valor: unknown): Classificacao {
  const r = { ...CLASSIFICACAO_PADRAO };
  if (valor && typeof valor === "object") {
    for (const b of BASES) {
      const v = (valor as Record<string, unknown>)[b];
      if (v === "fixa" || v === "variavel") r[b] = v;
    }
  }
  return r;
}

export const PRAZO_VARIAVEL_MS = 24 * 60 * 60 * 1000;

export interface EnvioResumo {
  base: string;
  ciclo: number | null;
  status: string;
  concluido_em: string | null;
  detalhes: unknown;
}

const excluida = (e: EnvioResumo) =>
  !!(
    e.detalhes &&
    typeof e.detalhes === "object" &&
    (e.detalhes as Record<string, unknown>)["excluida_em"]
  );

/** Último envio concluído da base (promoção: do ciclo indicado). `envios` do mais novo ao mais antigo. */
export function ultimoEnvio<E extends EnvioResumo>(
  envios: E[],
  base: BaseId,
  ciclo?: number | null,
): E | undefined {
  return envios.find(
    (e) =>
      e.base === base &&
      e.status === "concluido" &&
      (base !== "promocao" || ciclo === undefined || e.ciclo === ciclo),
  );
}

/** Sem envio, excluída ou concluída há mais de 24 h. */
export function envioVencido(e: EnvioResumo | undefined, agora: number): boolean {
  if (!e || excluida(e) || !e.concluido_em) return true;
  return agora - new Date(e.concluido_em).getTime() > PRAZO_VARIAVEL_MS;
}

export interface Desatualizada {
  base: BaseId;
  /** Data do último envio válido (null = nunca enviada ou excluída). */
  desde: string | null;
}

/** Bases variáveis desatualizadas. A promoção usa o ciclo escolhido no menu. */
export function basesDesatualizadas(
  envios: EnvioResumo[],
  classificacao: Classificacao,
  cicloPromocao: number | null,
  agora: number,
): Desatualizada[] {
  return BASES.filter((b) => classificacao[b] === "variavel").flatMap((b) => {
    const e = ultimoEnvio(envios, b, cicloPromocao);
    if (!envioVencido(e, agora)) return [];
    return [{ base: b, desde: e && !excluida(e) ? e.concluido_em : null }];
  });
}

/** "há 3 dias", "há 26 horas" — para o aviso. */
export function haQuanto(iso: string, agora: number): string {
  const horas = Math.floor((agora - new Date(iso).getTime()) / 3_600_000);
  if (horas < 48) return `há ${horas} horas`;
  return `há ${Math.floor(horas / 24)} dias`;
}
