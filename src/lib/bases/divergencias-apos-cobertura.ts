// Divergências logo depois da Cobertura (ajuste da F1b): o navegador do admin já tem o arquivo na
// memória; com ele (e a disponibilidade de hoje já gravada) analisa a base atual. Se houver loja 🔴
// ou 🟡, a tela de divergências abre; senão, só um aviso com "Ver análise".
import type { QueryClient } from "@tanstack/react-query";

import type { AlvoDivergencias } from "@/components/kits/DivergenciasDialog";
import { basesDeTodosOsCiclos, repositorio } from "@/lib/dados";
import { basesParaAnalise } from "@/lib/dados/periodo";
import { entradaDoMotor } from "@/lib/motor/entrada";
import { analisarBase } from "@/lib/motor/kits-da-base";
import type { CicloMotor } from "@/lib/motor/metas";

export interface AnaliseAposCobertura {
  alvo: AlvoDivergencias;
  /** Lojas 🔴 e 🟡 da base que abre primeiro (a com divergência, se houver). */
  divergentes: number;
  atencao: number;
  lojas: number;
}

export async function analiseAposCobertura(
  queryClient: QueryClient,
  ciclos: CicloMotor[],
  cicloMenu: number | null,
): Promise<AnaliseAposCobertura | null> {
  // a lista de bases e os kits podem ter mudado: relê (kits já com a disponibilidade de hoje)
  await queryClient.invalidateQueries({ queryKey: ["dados", "bases"] });
  const bases = basesParaAnalise(await basesDeTodosOsCiclos(queryClient, ciclos), cicloMenu);
  if (!bases.length) return null;
  const id = Date.now();
  let primeira: AnaliseAposCobertura | null = null;
  for (const b of bases) {
    const ciclo = ciclos.find((c) => c.id === b.ciclo);
    if (!ciclo) continue;
    // a tela reaproveita o que for lido aqui (mesmas chaves): nada é lido duas vezes
    const entrada = await queryClient.fetchQuery({
      queryKey: ["f1b-entrada", id, ciclo.id],
      queryFn: () => entradaDoMotor(ciclo, ciclos),
      staleTime: Infinity,
    });
    const kits = await queryClient.fetchQuery({
      queryKey: ["f1b-base", b.id],
      queryFn: () => repositorio.kitsDaBase(b.id, b.ciclo),
      staleTime: 0,
    });
    const nomes = new Map(entrada.lojas.map((l) => [l.bcps, { nome: l.nome, praca: l.praca }]));
    const analises = analisarBase(kits, entrada, nomes);
    const r: AnaliseAposCobertura = {
      // a base com divergência abre primeiro; as outras ficam no seletor
      alvo: { bases: [b, ...bases.filter((x) => x.id !== b.id)], ciclos, id },
      divergentes: analises.filter((a) => a.nivel === "divergente").length,
      atencao: analises.filter((a) => a.nivel === "atencao").length,
      lojas: analises.length,
    };
    if (r.divergentes + r.atencao > 0) return r;
    primeira ??= r;
  }
  return primeira && { ...primeira, alvo: { bases, ciclos, id } };
}
