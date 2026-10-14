// Disponibilidade diária dos kits (F1b): logo depois de uma Cobertura concluída, o navegador do
// admin — que acabou de ler o arquivo — calcula "pode montar N" de cada kit e a capacidade total de
// cada loja nas bases em andamento, e grava só esse resumo (gravar_disponibilidade).
// Revisão de consumo (itens 2 e 3): só bases em andamento (a futura é calculada na Cobertura do dia
// em que começa) e leitura leve dos kits (sem o estoque da geração, que só a análise usa).
import { repositorio } from "@/lib/dados";
import { hojeEmSaoPaulo } from "@/lib/dados/periodo";
import { calcularDisponibilidade, estoquePorLojaDe } from "@/lib/motor/kits-da-base";

import type { Analise } from "./analise";
import type { Estoque } from "./esquemas";

export async function disponibilidadeAposCobertura(
  a: Analise,
  ciclos: number[],
): Promise<{ bases: number; lojas: number }> {
  const ref = a.versaoRef;
  if (a.base !== "cobertura" || !ref) return { bases: 0, lojas: 0 };
  const linhas = (a.partes.find((p) => p.parte === "registros")?.linhas ?? []) as Estoque[];
  const estoque = estoquePorLojaDe(linhas);
  const hoje = hojeEmSaoPaulo();
  let bases = 0;
  let lojas = 0;
  for (const ciclo of ciclos) {
    for (const b of await repositorio.listarBases(ciclo)) {
      if (b.fim < hoje || b.inicio > hoje) continue; // encerrada ou futura: não recalcula
      const kits = await repositorio.kitsDaBase(b.id, b.ciclo, { leve: true });
      // a Cobertura traz só estoque > 0: loja da base sem linha = estoque zero
      const disp = calcularDisponibilidade(kits, estoque, true);
      await repositorio.gravarDisponibilidade(b.id, ref, disp);
      bases++;
      lojas += disp.length;
    }
  }
  return { bases, lojas };
}
