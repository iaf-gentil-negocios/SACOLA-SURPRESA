// Implementação "local" (modo de teste): dados da pasta seed/ servidos pelo servidor de
// desenvolvimento em /__seed, e simulações/bases/parâmetros guardados neste navegador.
import { CICLOS_PADRAO, dadosDaSeed, type DadosSeed } from "@/lib/local/seed";
import { entraNoPlano } from "@/lib/lojas/regras";
import type { ResultadoSimulacao } from "@/lib/motor/gerar";
import { baseDaSimulacao, type KitsDaBase } from "@/lib/motor/kits-da-base";
import { PARAMETROS_PADRAO, type Parametros } from "@/lib/motor/parametros";
import { resumirEstoque, skusHeroiDoCiclo } from "@/lib/painel/estoque";
import type { VendaDia } from "@/lib/vendas/leitor";
import type { RuidoLoja } from "@/lib/vendas/ruido";

import { erroDoPeriodo } from "./periodo";
import type { BaseDefinida, Declaracao, EnvioVendas, Repositorio, SimulacaoSalva } from "./tipos";

// ---------------------------------------------------------------------------
// Armazenamento no navegador (IndexedDB; as simulações podem passar de 5 MB)

const BANCO = "sacola-surpresa-local";
const LOJA = "registros";

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(BANCO, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(LOJA);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
}

export async function ler<T>(chave: string, padrao: T): Promise<T> {
  const db = await abrir();
  return new Promise((ok, falha) => {
    const r = db.transaction(LOJA).objectStore(LOJA).get(chave);
    r.onsuccess = () => ok((r.result as T | undefined) ?? padrao);
    r.onerror = () => falha(r.error);
  });
}

export async function gravar(chave: string, valor: unknown): Promise<void> {
  const db = await abrir();
  return new Promise((ok, falha) => {
    const t = db.transaction(LOJA, "readwrite");
    t.objectStore(LOJA).put(valor, chave);
    t.oncomplete = () => ok();
    t.onerror = () => falha(t.error);
  });
}

// ---------------------------------------------------------------------------
// Dados da seed (lidos uma vez por carregamento da página)

let seed: Promise<DadosSeed> | null = null;

export function carregarSeed(): Promise<DadosSeed> {
  seed ??= (async () => {
    const lista = await fetch("/__seed/");
    if (!lista.ok) throw new Error("Não achei a pasta seed/ (rode com `bun run local`).");
    const nomes = (await lista.json()) as string[];
    const arquivos = await Promise.all(
      nomes.map(async (n) => {
        const r = await fetch(`/__seed/${encodeURIComponent(n)}`);
        if (!r.ok) throw new Error(`Falha ao ler seed/${n}`);
        return new File([await r.blob()], n);
      }),
    );
    return dadosDaSeed(arquivos);
  })();
  seed.catch(() => (seed = null));
  return seed;
}

// ---------------------------------------------------------------------------

export const repositorioLocal: Repositorio = {
  modo: "local",
  origem: "Modo local — pasta seed/ e este navegador",

  async ciclos() {
    const inicios = await ler<Record<string, string | null>>("inicio-campanha", {});
    return CICLOS_PADRAO.map((c) => ({ ...c, inicioCampanha: inicios[String(c.id)] ?? null }));
  },

  async parametros() {
    const salvos = await ler<Partial<Parametros>>("parametros", {});
    return { ...structuredClone(PARAMETROS_PADRAO), ...salvos };
  },

  async salvarParametros(alteracoes) {
    const salvos = await ler<Partial<Parametros>>("parametros", {});
    await gravar("parametros", { ...salvos, ...alteracoes });
  },

  async lojas() {
    // correções de cidade/UF feitas no mapa (F2b) ficam neste navegador
    const locais = await ler<Record<string, { cidade: string; uf: string }>>("localizacoes", {});
    return (await carregarSeed()).lojas.map((l) => ({ ...l, ...(locais[l.bcps] ?? {}) }));
  },

  async faturamento() {
    return (await carregarSeed()).faturamento;
  },

  async usarEstoqueDaCobertura() {
    // no modo local o estoque vem da seed
  },

  async dadosDoMotor(ciclo, pracas, aoProgredir) {
    aoProgredir?.("Lendo a pasta seed/…");
    const d = await carregarSeed();
    const lojas = new Set(
      d.lojas
        .filter((l) => entraNoPlano(l) && (!pracas || pracas.includes(l.praca)))
        .map((l) => l.bcps),
    );
    return {
      estoque: d.estoque.filter((x) => lojas.has(x.bcps)),
      produtos: d.produtos,
      promocoes: d.promocoes.filter((x) => x.ciclo === ciclo),
    };
  },

  async salvarSimulacao(r, nome) {
    const lista = await ler<SimulacaoSalva[]>("simulacoes", []);
    const id = (lista.reduce((m, s) => Math.max(m, s.id), 0) || 0) + 1;
    await gravar(`simulacao:${id}`, r);
    await gravar("simulacoes", [
      {
        id,
        nome: nome.trim(),
        ciclo: r.ciclo,
        semente: r.semente,
        pracas: r.pracas,
        resumo: r.resumo,
        criadoEm: new Date().toISOString(),
      },
      ...lista,
    ]);
    return id;
  },

  async listarSimulacoes(ciclo) {
    return (await ler<SimulacaoSalva[]>("simulacoes", [])).filter((s) => s.ciclo === ciclo);
  },

  async excluirSimulacao(id) {
    const bases = await ler<BaseDefinida[]>("bases", []);
    if (bases.some((b) => b.simulacaoId === id))
      throw new Error("Esta simulação virou base de um período e não pode ser excluída.");
    const lista = await ler<SimulacaoSalva[]>("simulacoes", []);
    await gravar(
      "simulacoes",
      lista.filter((s) => s.id !== id),
    );
    await gravar(`simulacao:${id}`, null);
  },

  async abrirSimulacao(id) {
    const r = await ler<ResultadoSimulacao | null>(`simulacao:${id}`, null);
    if (!r) throw new Error("Simulação não encontrada neste navegador.");
    return r;
  },

  async definirBase(simulacaoId, nome, inicio, fim) {
    const sim = (await ler<SimulacaoSalva[]>("simulacoes", [])).find((s) => s.id === simulacaoId);
    if (!sim) throw new Error("Simulação não encontrada ou ainda não salva.");
    const ciclo = CICLOS_PADRAO.find((c) => c.id === sim.ciclo)!;
    const bases = await ler<BaseDefinida[]>("bases", []);
    const erro = erroDoPeriodo(
      ciclo,
      inicio,
      fim,
      bases.filter((b) => b.ciclo === sim.ciclo),
    );
    if (erro) throw new Error(erro);
    const id = (bases.reduce((m, b) => Math.max(m, b.id), 0) || 0) + 1;
    await gravar("bases", [
      ...bases,
      {
        id,
        ciclo: sim.ciclo,
        nome: nome.trim(),
        inicio,
        fim,
        simulacaoId,
        definidaEm: new Date().toISOString(),
      },
    ]);
    return id;
  },

  async listarBases(ciclo) {
    return (await ler<BaseDefinida[]>("bases", []))
      .filter((b) => b.ciclo === ciclo)
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
  },

  // ----- F1b (modo local: a base fica neste navegador, criada da simulação) -----
  async coberturaAtual() {
    return (await carregarSeed()).versaoCobertura;
  },

  async kitsDaBase(planoId, ciclo) {
    // no modo local a base inteira fica no navegador: a opção "leve" não muda nada
    const salva = await ler<KitsDaBase | null>(`base-kits:${planoId}`, null);
    if (salva) return salva;
    const base = (await ler<BaseDefinida[]>("bases", [])).find((b) => b.id === planoId);
    const sim = base?.simulacaoId
      ? await ler<ResultadoSimulacao | null>(`simulacao:${base.simulacaoId}`, null)
      : null;
    if (!sim) throw new Error("Simulação da base não encontrada neste navegador.");
    const nova = { ...baseDaSimulacao(sim, planoId), ciclo };
    await gravar(`base-kits:${planoId}`, nova);
    return nova;
  },

  async gravarDisponibilidade(planoId, ref, lojas) {
    const base = await ler<KitsDaBase | null>(`base-kits:${planoId}`, null);
    if (!base) return;
    for (const l of lojas) {
      const f = base.fotos[l.bcps];
      const nova = !f || f.atualRef !== ref;
      base.fotos[l.bcps] = {
        atualRef: ref,
        atual: l.estoque,
        anteriorRef: nova ? (f?.atualRef ?? null) : f.anteriorRef,
        anterior: nova ? (f?.atual ?? {}) : f.anterior,
      };
      for (const k of l.kits) {
        const kl = base.kitLojas.find((x) => x.bcps === l.bcps && x.codigo === k.codigo);
        if (kl)
          Object.assign(kl, {
            disponivel: k.disponivel,
            capacidadeLoja: l.capacidade,
            disponivelRef: ref,
          });
      }
    }
    await gravar(`base-kits:${planoId}`, base);
  },

  async regerarKitsLoja(planoId, _bcps, _pedido, atualizada) {
    await gravar(`base-kits:${planoId}`, atualizada);
  },

  // ----- F2a (modo local: tudo calculado da seed e da simulação da base) -----
  async lojasDaBase(planoId) {
    const base = (await ler<BaseDefinida[]>("bases", [])).find((b) => b.id === planoId);
    const sim = base?.simulacaoId
      ? await ler<ResultadoSimulacao | null>(`simulacao:${base.simulacaoId}`, null)
      : null;
    if (!sim) throw new Error("Simulação da base não encontrada neste navegador.");
    const kits = await this.kitsDaBase(planoId, sim.ciclo);
    const capacidade = new Map<string, { n: number | null; ref: string | null }>();
    for (const kl of kits.kitLojas)
      if (kl.capacidadeLoja !== null)
        capacidade.set(kl.bcps, { n: kl.capacidadeLoja, ref: kl.disponivelRef });
    return sim.lojas.map((l) => ({
      bcps: l.bcps,
      meta: l.meta,
      vendedoras: l.vendedoras,
      metaSemana: l.metaSemana,
      sacolasMeta: l.sacolasMeta,
      sacolasPlanejadas: l.sacolasPlanejadas,
      receita: l.receita,
      custo: l.custo,
      capacidade: capacidade.get(l.bcps)?.n ?? null,
      disponivelRef: capacidade.get(l.bcps)?.ref ?? null,
    }));
  },

  async resumoEstoque() {
    const d = await carregarSeed();
    const parametros = await this.parametros();
    const produtos = new Map(d.produtos.map((p) => [p.sku, p]));
    const herois = new Map(
      CICLOS_PADRAO.map((c) => [
        c.id,
        skusHeroiDoCiclo(
          d.promocoes.filter((x) => x.ciclo === c.id),
          produtos,
        ),
      ]),
    );
    for (const [c, skus] of herois) if (!skus.size) herois.delete(c); // ciclo sem promoção
    return resumirEstoque(d.estoque, d.versaoCobertura ?? "seed", herois, parametros);
  },

  async gravarResumoEstoque() {
    // no modo local o resumo é calculado da seed na hora
  },

  async hierarquiaEPerfis() {
    return null;
  },

  // ----- F2b (modo local: vendas, ruído e declarações neste navegador) -----
  async salvarInicioCampanha(ciclo, data) {
    const inicios = await ler<Record<string, string | null>>("inicio-campanha", {});
    await gravar("inicio-campanha", { ...inicios, [String(ciclo)]: data });
  },

  async vendasEnvios() {
    return ler<EnvioVendas[]>("vendas-envios", []);
  },

  async vendasDiarias(inicio, fim) {
    return (await ler<VendaDia[]>("vendas", [])).filter((v) => v.dia >= inicio && v.dia <= fim);
  },

  async gravarVendas(inicio, fim, arquivo, linhas) {
    // o período do arquivo substitui; linhas repetidas (loja e dia) somam
    const por = new Map<string, VendaDia>();
    for (const l of linhas) {
      const x = por.get(`${l.bcps}|${l.dia}`);
      por.set(
        `${l.bcps}|${l.dia}`,
        x
          ? { ...x, gmv: x.gmv + l.gmv, boletos: x.boletos + l.boletos, itens: x.itens + l.itens }
          : { ...l },
      );
    }
    const resto = (await ler<VendaDia[]>("vendas", [])).filter(
      (v) => v.dia < inicio || v.dia > fim,
    );
    await gravar("vendas", [...resto, ...por.values()]);
    const envios = await ler<EnvioVendas[]>("vendas-envios", []);
    await gravar("vendas-envios", [
      {
        inicio,
        fim,
        arquivo,
        linhas: por.size,
        gmv: linhas.reduce((s, l) => s + l.gmv, 0),
        enviadoEm: new Date().toISOString(),
      },
      ...envios,
    ]);
    return por.size;
  },

  async ruidos(ciclo) {
    return ler<RuidoLoja[]>(`ruido:${ciclo}`, []);
  },

  async gravarRuido(ciclo, _inicioCampanha, linhas) {
    await gravar(
      `ruido:${ciclo}`,
      linhas.map((r) => ({ ...r, ruido: Math.max(0, r.ruido) })),
    );
  },

  async declaracoes(ciclo) {
    return (await ler<Declaracao[]>("declaracoes", [])).filter((d) => d.ciclo === ciclo);
  },

  async decidirDeclaracao(id, aprovar, motivo) {
    const lista = await ler<Declaracao[]>("declaracoes", []);
    const d = lista.find((x) => x.id === id && x.status === "pendente");
    if (!d) throw new Error("Declaração não encontrada ou já decidida.");
    Object.assign(d, {
      status: aprovar ? "aprovada" : "recusada",
      motivo: motivo?.trim() || null,
      decididoEm: new Date().toISOString(),
    });
    await gravar("declaracoes", lista);
  },

  async salvarLocalizacao(bcps, cidade, uf) {
    const locais = await ler<Record<string, { cidade: string; uf: string }>>("localizacoes", {});
    await gravar("localizacoes", {
      ...locais,
      [bcps]: { cidade: cidade.trim(), uf: uf.trim().toUpperCase() },
    });
  },
};
