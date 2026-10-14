// Área do gerente no modo local (`bun run local`): sem banco, as bases e os kits vêm das bases
// definidas neste navegador (repositório local), vendo todas as lojas. Só para conferir as telas.
import { CICLOS_PADRAO } from "@/lib/local/seed";
import { repositorioLocal } from "@/lib/dados/local";

import type { BaseGerente, DadosBase, KitGerente } from "./base";
import { montarDadosPainel, type DadosPainelGerente, type LojaPainelGerente } from "./painel";

export async function basesLocais(): Promise<BaseGerente[]> {
  const listas = await Promise.all(CICLOS_PADRAO.map((c) => repositorioLocal.listarBases(c.id)));
  return listas
    .flat()
    .map((b) => ({
      id: b.id,
      ciclo: b.ciclo,
      nome: b.nome,
      inicio: b.inicio,
      fim: b.fim,
      kitsVersao: null,
    }))
    .sort((a, b) => b.inicio.localeCompare(a.inicio));
}

export async function dadosBaseLocal(base: BaseGerente): Promise<DadosBase> {
  const definida = (await repositorioLocal.listarBases(base.ciclo)).find((b) => b.id === base.id);
  if (!definida?.simulacaoId) throw new Error("Simulação da base não encontrada neste navegador.");
  const [sim, kb] = await Promise.all([
    repositorioLocal.abrirSimulacao(definida.simulacaoId),
    repositorioLocal.kitsDaBase(base.id, base.ciclo),
  ]);
  const lojas = sim.lojas
    .map((l) => ({
      bcps: l.bcps,
      nome: l.nome,
      praca: l.praca,
      meta: l.meta,
      vendedoras: l.vendedoras,
      metaSemana: l.metaSemana,
      metaVendSemana: l.metaVendSemana,
      metasMes: l.metasMes,
    }))
    .sort((a, b) => a.praca.localeCompare(b.praca) || a.nome.localeCompare(b.nome));
  const capacidadeLoja: Record<string, number> = {};
  let disponivelRef: string | null = null;
  for (const kl of kb.kitLojas) {
    if (kl.capacidadeLoja !== null) capacidadeLoja[kl.bcps] = kl.capacidadeLoja;
    if (kl.disponivelRef && (!disponivelRef || kl.disponivelRef > disponivelRef))
      disponivelRef = kl.disponivelRef;
  }
  const kits: KitGerente[] = kb.kits.map((k) => ({
    codigo: k.codigo,
    tema: k.tema,
    preco: k.preco,
    valorCheio: k.valorCheio,
    descontoPct: k.descontoPct,
    itens: k.itens.map((i) => ({
      ordem: i.ordem,
      papel: i.papel,
      sku: i.sku,
      descricao: i.descricao,
      precoItem: i.precoItem,
    })),
    lojas: kb.kitLojas
      .filter((kl) => kl.codigo === k.codigo)
      .map((kl) => ({ bcps: kl.bcps, qtd: kl.qtd, disponivel: kl.disponivel })),
  }));
  const ciclo = CICLOS_PADRAO.find((c) => c.id === base.ciclo) ?? null;
  return {
    base,
    ciclo: ciclo && { id: ciclo.id, nome: ciclo.nome, inicio: ciclo.inicio, fim: ciclo.fim },
    lojas,
    kits,
    pracas: [...new Set(lojas.map((l) => l.praca))].filter(Boolean).sort(),
    capacidadeLoja,
    disponivelRef,
  };
}

export async function escopoLocal() {
  const d = await repositorioLocal.lojas();
  return d
    .filter((l) => l.participa && l.ativo)
    .map((l) => ({ bcps: l.bcps, nome: l.nome, praca: l.praca }))
    .sort((a, b) => a.praca.localeCompare(b.praca) || a.nome.localeCompare(b.nome));
}

export async function painelLocal(base: BaseGerente): Promise<DadosPainelGerente> {
  const definida = (await repositorioLocal.listarBases(base.ciclo)).find((b) => b.id === base.id);
  if (!definida?.simulacaoId) throw new Error("Simulação da base não encontrada neste navegador.");
  const [sim, resumo] = await Promise.all([
    repositorioLocal.abrirSimulacao(definida.simulacaoId),
    repositorioLocal.lojasDaBase(base.id),
  ]);
  const doResumo = new Map(resumo.map((r) => [r.bcps, r]));
  const cadastro = new Map((await repositorioLocal.lojas()).map((l) => [l.bcps, l]));
  let ref: string | null = null;
  const lojas = sim.lojas.map((l): LojaPainelGerente => {
    const r = doResumo.get(l.bcps);
    if (r?.disponivelRef && (!ref || r.disponivelRef > ref)) ref = r.disponivelRef;
    return {
      bcps: l.bcps,
      nome: l.nome,
      praca: l.praca,
      cidade: cadastro.get(l.bcps)?.cidade ?? null,
      uf: cadastro.get(l.bcps)?.uf ?? null,
      meta: l.meta,
      vendedoras: l.vendedoras,
      metasMes: l.metasMes,
      sacolasMeta: l.sacolasMeta,
      sacolasPlanejadas: l.sacolasPlanejadas,
      receitaPlanejada: l.receita,
      podeMontar: r?.capacidade ?? null,
    };
  });
  const ciclo = (await repositorioLocal.ciclos()).find((c) => c.id === base.ciclo) ?? null;
  return montarDadosPainel(base, ciclo, lojas, ref);
}
