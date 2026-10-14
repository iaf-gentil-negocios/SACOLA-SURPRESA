// Dados do motor para simular ou analisar divergências (F1b): parâmetros, lojas, faturamento,
// estoque, produtos e promoção do ciclo. O estoque vem da memória quando já foi lido (simulação
// anterior ou o arquivo da Cobertura recém-enviado), sem baixar a Cobertura de novo.
import { repositorio } from "@/lib/dados";
import type { AoProgredir } from "@/lib/dados/tipos";

import type { EntradaSimulacao } from "./gerar";
import type { CicloMotor } from "./metas";

export async function entradaDoMotor(
  ciclo: CicloMotor,
  ciclos: CicloMotor[],
  opcoes: { pracas?: string[] | null; semente?: number; aoProgredir?: AoProgredir } = {},
): Promise<EntradaSimulacao> {
  opcoes.aoProgredir?.("Lendo parâmetros e lojas…");
  const [parametros, lojas, faturamento] = await Promise.all([
    repositorio.parametros(),
    repositorio.lojas(),
    repositorio.faturamento(),
  ]);
  const pracas = opcoes.pracas ?? null;
  const dados = await repositorio.dadosDoMotor(ciclo.id, pracas, opcoes.aoProgredir);
  return {
    ciclo,
    ciclos,
    lojas,
    faturamento,
    ...dados,
    parametros,
    semente: opcoes.semente ?? 0,
    pracas,
  };
}
