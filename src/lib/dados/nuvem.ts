// Implementação "nuvem": lê com o cliente do navegador (RLS de admin) e grava pelas funções de servidor.
// Só funciona depois da etapa 5.2 (tabelas novas aplicadas no Lovable).
import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import type { Nivel } from "@/lib/acessos/hierarquia";
import type { Nicho } from "@/lib/bases/nicho";
import { entraNoPlano } from "@/lib/lojas/regras";
import type { EstoqueMotor, LojaMotor, ProdutoMotor, ResultadoSimulacao } from "@/lib/motor/gerar";
import type { CicloMotor, FaturamentoMes } from "@/lib/motor/metas";
import type { ItemKit } from "@/lib/motor/gerar";
import type { FotoEstoque, KitLojaBase, KitsDaBase } from "@/lib/motor/kits-da-base";
import { parametrosDasLinhas, type Parametros } from "@/lib/motor/parametros";
import type { ResumoEstoqueLoja } from "@/lib/painel/estoque";
import type { VendaDia } from "@/lib/vendas/leitor";
import type { RuidoLoja } from "@/lib/vendas/ruido";
import {
  linhasDaSimulacao,
  simulacaoDasLinhas,
  type LinhasSimulacao,
} from "@/lib/simulacoes/linhas";
import {
  concluirSimulacao,
  definirBase as definirBaseFn,
  iniciarSimulacao,
} from "@/lib/simulacoes/simulacoes.functions";

import type { AoProgredir, BaseDefinida, Declaracao, Repositorio, SimulacaoSalva } from "./tipos";

const PAGINA = 1000;
const LOTE = 2000;

/** Lê todas as linhas de uma consulta, de 1000 em 1000 (limite do PostgREST). */
async function todas<T>(
  consulta: (
    de: number,
    ate: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const r: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    r.push(...(data ?? []));
    if (!data || data.length < PAGINA) return r;
  }
}

function pedacos<T>(itens: T[], n: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < itens.length; i += n) r.push(itens.slice(i, i + n));
  return r;
}

const ok = <T extends object>(r: ({ ok: true } & T) | { ok: false; erro: string }): T => {
  if (!r.ok) throw new Error(r.erro);
  return r;
};

// ---------------------------------------------------------------------------
// Cache da leitura do motor (parte F1a): o navegador do admin guarda o estoque, os produtos e a
// promoção enquanto o app está aberto e só baixa de novo o que mudou — uma Cobertura ou dsku nova
// (ou excluída), uma promoção nova do ciclo, ou lojas que ainda não tinham sido lidas (participação).

interface CacheMotor {
  /** Versão da cobertura + produtos (id e exclusão do último envio de cada uma). */
  versao: string;
  estoquePorLoja: Map<string, EstoqueMotor[]>;
  produtos: Map<string, ProdutoMotor>;
  /** Por ciclo: versão (último envio da promoção) e linhas. */
  promocoes: Map<number, { versao: string; linhas: { sku: string; desconto_pct: number }[] }>;
}

const cache: CacheMotor = {
  versao: "",
  estoquePorLoja: new Map(),
  produtos: new Map(),
  promocoes: new Map(),
};

/** Versão de cada base pelo último envio concluído (consulta pequena: só ids e datas). */
async function versoesDasBases(ciclo: number) {
  const { data, error } = await supabase
    .from("bases_envios")
    .select("id, base, ciclo, concluido_em, detalhes")
    .eq("status", "concluido")
    .in("base", ["cobertura", "produtos", "promocao"])
    .order("id", { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);
  const versao = (base: string, c?: number) => {
    const e = data.find((x) => x.base === base && (c === undefined || x.ciclo === c));
    if (!e) return "nenhum";
    const excluida = (e.detalhes as Record<string, unknown> | null)?.["excluida_em"];
    return `${e.id}${excluida ? `-excluida-${String(excluida)}` : ""}`;
  };
  return {
    estoque: `${versao("cobertura")}|${versao("produtos")}`,
    promocao: versao("promocao", ciclo),
  };
}

/** Para os testes e para quem quiser forçar a releitura. */
export function limparCacheDoMotor() {
  cache.versao = "";
  cache.estoquePorLoja.clear();
  cache.produtos.clear();
  cache.promocoes.clear();
}

export const repositorioNuvem: Repositorio = {
  modo: "nuvem",
  origem: "Banco do Lovable Cloud",

  async ciclos() {
    const { data, error } = await supabase.from("ciclos").select("*").order("id");
    if (error) throw new Error(error.message);
    // inicio_campanha (F2b, 0002j) ainda não está no types.ts
    return (data as (CicloMotor & { inicio_campanha?: string | null })[]).map((c) => ({
      id: c.id,
      nome: c.nome,
      inicio: c.inicio,
      fim: c.fim,
      inicioCampanha: c.inicio_campanha ?? null,
    }));
  },

  async parametros() {
    const { data, error } = await supabase.from("parametros").select("chave, valor");
    if (error) throw new Error(error.message);
    return parametrosDasLinhas(data);
  },

  async salvarParametros(alteracoes: Partial<Parametros>) {
    const linhas = Object.entries(alteracoes).map(([chave, valor]) => ({
      chave,
      valor: valor as Json,
      atualizado_em: new Date().toISOString(),
    }));
    if (!linhas.length) return;
    const { error } = await supabase.from("parametros").upsert(linhas, { onConflict: "chave" });
    if (error) throw new Error(error.message);
  },

  async lojas() {
    // só as colunas do motor; "participa" (parte B) ainda não está no types.ts
    const [lojas, grvo] = await Promise.all([
      supabase
        .from("lojas")
        .select(
          "bcps, nome, nome_completo, praca, tipo, vendedoras, ativo, participa, cidade, uf" as "*",
        )
        .order("bcps"),
      // regional = GRVO de cada loja (dGerentes), para a Divisão por Regional
      supabase.from("gerentes_lojas").select("bcps, matricula").eq("nivel", "grvo"),
    ]);
    if (lojas.error) throw new Error(lojas.error.message);
    if (grvo.error) throw new Error(grvo.error.message);
    const regionalDe = new Map(grvo.data.map((g) => [g.bcps, g.matricula]));
    type Linha = LojaMotor & {
      participa?: boolean;
      nome_completo?: string | null;
      cidade?: string | null;
      uf?: string | null;
    };
    return (lojas.data as unknown as Linha[]).map((l) => ({
      bcps: l.bcps,
      nome: l.nome,
      nomeCompleto: l.nome_completo ?? null,
      cidade: l.cidade ?? null,
      uf: l.uf ?? null,
      praca: l.praca,
      tipo: l.tipo,
      vendedoras: l.vendedoras,
      ativo: l.ativo,
      participa: l.participa ?? false,
      regional: regionalDe.get(l.bcps) ?? null,
    }));
  },

  async faturamento() {
    const linhas = await todas((de, ate) =>
      supabase
        .from("faturamento_mensal")
        .select("bcps, mes, faturamento")
        .order("bcps")
        .order("mes")
        .range(de, ate),
    );
    return linhas.map((f) => ({ ...f, faturamento: Number(f.faturamento) })) as FaturamentoMes[];
  },

  async usarEstoqueDaCobertura(linhas) {
    const [versoes, lojas] = await Promise.all([versoesDasBases(0), this.lojas()]);
    // dsku mudou junto? então os produtos da memória também saem
    if (cache.versao.split("|")[1] !== versoes.estoque.split("|")[1]) cache.produtos.clear();
    cache.versao = versoes.estoque;
    cache.estoquePorLoja.clear();
    // a Cobertura traz só estoque > 0: loja que participa e não veio = sem estoque
    for (const l of lojas) if (entraNoPlano(l)) cache.estoquePorLoja.set(l.bcps, []);
    for (const x of linhas) {
      const l = cache.estoquePorLoja.get(x.bcps) ?? [];
      l.push({
        bcps: x.bcps,
        sku: x.sku,
        estoque: x.estoque,
        vmd: x.vmd,
        preco: x.preco,
        custo: x.custo,
      });
      cache.estoquePorLoja.set(x.bcps, l);
    }
  },

  async dadosDoMotor(ciclo, pracas, aoProgredir) {
    const lojas = (await this.lojas()).filter(
      (l) => entraNoPlano(l) && (!pracas || pracas.includes(l.praca)),
    );
    const versoes = await versoesDasBases(ciclo);
    if (cache.versao !== versoes.estoque) {
      // cobertura ou dsku mudou: descarta o que estava na memória
      cache.versao = versoes.estoque;
      cache.estoquePorLoja.clear();
      cache.produtos.clear();
    }

    // estoque: só das lojas que ainda não estão na memória
    const faltam = lojas.map((l) => l.bcps).filter((b) => !cache.estoquePorLoja.has(b));
    const grupos = pedacos(faltam, 4);
    for (const [i, grupo] of grupos.entries()) {
      aoProgredir?.(`Lendo estoque das lojas (${i + 1}/${grupos.length})…`);
      const linhas = await todas((de, ate) =>
        supabase
          .from("estoque")
          .select("bcps, sku, estoque, vmd, preco, custo")
          .in("bcps", grupo)
          .order("bcps")
          .order("sku")
          .range(de, ate),
      );
      for (const b of grupo) cache.estoquePorLoja.set(b, []);
      for (const x of linhas) {
        cache.estoquePorLoja.get(x.bcps)!.push({
          bcps: x.bcps,
          sku: x.sku,
          estoque: Number(x.estoque),
          vmd: Number(x.vmd),
          preco: Number(x.preco),
          custo: x.custo === null ? null : Number(x.custo),
        });
      }
    }
    const estoque = lojas.flatMap((l) => cache.estoquePorLoja.get(l.bcps) ?? []);

    // produtos: só os SKUs que ainda não estão na memória. Muitos faltando (1ª leitura da sessão):
    // lê o cadastro BOT inteiro de 1000 em 1000 (~15 chamadas, no lugar de ~50 grupos de 300 SKUs);
    // o que ainda faltar (SKU fora do BOT) vai pelos grupos de SKUs.
    const faltando = () =>
      [...new Set(estoque.map((x) => x.sku))].filter((sku) => !cache.produtos.has(sku));
    let skusFaltando = faltando();
    if (skusFaltando.length) aoProgredir?.("Lendo produtos…");
    if (skusFaltando.length > 3000) {
      const bot = await todas((de, ate) =>
        supabase
          .from("produtos")
          .select("sku, descricao, marca, categoria, nicho, regular, fornecedor")
          .eq("fornecedor", "BOT")
          .order("sku")
          .range(de, ate),
      );
      for (const p of bot) cache.produtos.set(p.sku, { ...p, nicho: p.nicho as Nicho | null });
      skusFaltando = faltando();
    }
    for (const grupo of pedacos(skusFaltando, 300)) {
      const { data, error } = await supabase
        .from("produtos")
        .select("sku, descricao, marca, categoria, nicho, regular, fornecedor")
        .in("sku", grupo);
      if (error) throw new Error(error.message);
      for (const p of data) cache.produtos.set(p.sku, { ...p, nicho: p.nicho as Nicho | null });
    }
    const skus = new Set(estoque.map((x) => x.sku));
    const produtos = [...cache.produtos.values()].filter((p) => skus.has(p.sku));

    // promoção do ciclo: de novo só se houve envio novo
    let promo = cache.promocoes.get(ciclo);
    if (!promo || promo.versao !== versoes.promocao) {
      aoProgredir?.("Lendo a promoção do ciclo…");
      const linhas = await todas((de, ate) =>
        supabase
          .from("promocoes")
          .select("sku, desconto_pct")
          .eq("ciclo", ciclo)
          .order("sku")
          .range(de, ate),
      );
      promo = {
        versao: versoes.promocao,
        linhas: linhas.map((x) => ({ sku: x.sku, desconto_pct: Number(x.desconto_pct) })),
      };
      cache.promocoes.set(ciclo, promo);
    }
    return { estoque, produtos, promocoes: promo.linhas };
  },

  async salvarSimulacao(r, nome, aoProgredir) {
    aoProgredir?.("Registrando a simulação…");
    const { id } = ok(
      await iniciarSimulacao({
        data: {
          nome,
          ciclo: r.ciclo,
          semente: r.semente,
          pracas: r.pracas,
          parametros: r.parametros as unknown as Json,
          resumo: {
            ...r.resumo,
            metaCiclo: r.metaCiclo,
            metasPracas: r.metasPracas,
          } as unknown as Json,
        },
      }),
    );
    const linhas = linhasDaSimulacao(r);
    const partes: [keyof LinhasSimulacao, "kits" | "itens" | "kit_lojas" | "lojas"][] = [
      ["kits", "kits"],
      ["itens", "itens"],
      ["kitLojas", "kit_lojas"],
      ["lojas", "lojas"],
    ];
    for (const [campo, parte] of partes) {
      for (const lote of pedacos(linhas[campo] as unknown[], LOTE)) {
        aoProgredir?.(`Gravando ${parte}…`);
        // direto no banco (0002h): mesma validação do servidor, só admin, simulação "gravando"
        const { error } = await supabase.rpc(
          "gravar_parte_simulacao" as never,
          { p_id: id, p_parte: parte, p_linhas: lote } as never,
        );
        if (error) throw new Error(error.message);
      }
    }
    ok(await concluirSimulacao({ data: { id } }));
    return id;
  },

  async listarSimulacoes(ciclo) {
    const { data, error } = await supabase
      .from("simulacoes")
      .select("id, nome, ciclo, semente, pracas, resumo, criado_em")
      .eq("ciclo", ciclo)
      .eq("status", "salva")
      .order("criado_em", { ascending: false });
    if (error) throw new Error(error.message);
    return data.map((s): SimulacaoSalva => ({
      id: s.id,
      nome: s.nome,
      ciclo: s.ciclo,
      semente: s.semente,
      pracas: s.pracas,
      resumo: s.resumo as unknown as SimulacaoSalva["resumo"],
      criadoEm: s.criado_em,
    }));
  },

  async excluirSimulacao(id) {
    // a simulação que virou base fica (é a origem do que os gerentes veem)
    const { count, error } = await supabase
      .from("planos")
      .select("id", { count: "exact", head: true })
      .eq("simulacao_id", id);
    if (error) throw new Error(error.message);
    if (count) throw new Error("Esta simulação virou base de um período e não pode ser excluída.");
    // kits, itens, kits por loja e lojas saem junto (on delete cascade); só admin (RLS)
    const { error: erro } = await supabase.from("simulacoes").delete().eq("id", id);
    if (erro) throw new Error(erro.message);
  },

  async abrirSimulacao(id, aoProgredir) {
    aoProgredir?.("Abrindo a simulação…");
    const { data: s, error } = await supabase.from("simulacoes").select("*").eq("id", id).single();
    if (error) throw new Error(error.message);
    const ler = <T>(
      tabela: "simulacao_kits" | "simulacao_kit_itens" | "simulacao_kit_lojas" | "simulacao_lojas",
    ) =>
      todas<T>(
        (de, ate) =>
          supabase.from(tabela).select("*").eq("simulacao_id", id).range(de, ate) as never,
      );
    const [kits, itens, kitLojas, lojas, cadastro] = await Promise.all([
      ler<LinhasSimulacao["kits"][number]>("simulacao_kits"),
      ler<LinhasSimulacao["itens"][number]>("simulacao_kit_itens"),
      ler<LinhasSimulacao["kitLojas"][number]>("simulacao_kit_lojas"),
      ler<LinhasSimulacao["lojas"][number]>("simulacao_lojas"),
      this.lojas(),
    ]);
    const resumo = s.resumo as unknown as ResultadoSimulacao["resumo"] & {
      metaCiclo: number;
      metasPracas: ResultadoSimulacao["metasPracas"];
    };
    return simulacaoDasLinhas(
      {
        ciclo: s.ciclo,
        semente: s.semente,
        pracas: s.pracas,
        parametros: s.parametros as unknown as Parametros,
        resumo,
        criadoEm: s.criado_em,
        metaCiclo: resumo.metaCiclo,
        metasPracas: resumo.metasPracas,
      },
      { kits, itens, kitLojas, lojas },
      new Map(cadastro.map((l) => [l.bcps, l.nome])),
    );
  },

  async definirBase(simulacaoId, nome, inicio, fim) {
    return ok(await definirBaseFn({ data: { simulacaoId, nome, inicio, fim } })).planoId;
  },

  async listarBases(ciclo) {
    const { data, error } = await supabase
      .from("planos")
      .select("id, ciclo, nome, inicio, fim, simulacao_id, publicado_em")
      .eq("ciclo", ciclo)
      .not("inicio", "is", null)
      .order("inicio");
    if (error) throw new Error(error.message);
    return data.map((b): BaseDefinida => ({
      id: b.id,
      ciclo: b.ciclo,
      nome: b.nome ?? `Base ${b.id}`,
      inicio: b.inicio!,
      fim: b.fim!,
      simulacaoId: b.simulacao_id,
      definidaEm: b.publicado_em,
    }));
  },

  // ----- F1b -----
  async coberturaAtual() {
    const { data, error } = await supabase
      .from("bases_envios")
      .select("versao_ref")
      .eq("base", "cobertura")
      .eq("status", "concluido")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.versao_ref ?? null;
  },

  async kitsDaBase(planoId, ciclo, opcoes) {
    // leve (revisão de consumo, item 2): só kits, itens e kits por loja — o bastante para a
    // disponibilidade. Sem custo/estoque da geração (a parte pesada), metas nem fotos.
    const leve = opcoes?.leve === true;
    const vazio = <T>() => Promise.resolve([] as T[]);
    // colunas da F1b (0002d) ainda não estão no types.ts: "*" e conversão
    const [kits, itens, kitLojas, admin, lojas, fotos] = await Promise.all([
      todas((de, ate) =>
        supabase
          .from("base_kits")
          .select("codigo, tema, nicho, preco, valor_cheio, desconto_pct, heroi_sku")
          .eq("plano_id", planoId)
          .order("codigo")
          .range(de, ate),
      ),
      todas((de, ate) =>
        supabase
          .from("base_kit_itens")
          .select("codigo, ordem, papel, sku, descricao, preco_item, promo_pct")
          .eq("plano_id", planoId)
          .order("codigo")
          .order("ordem")
          .range(de, ate),
      ),
      todas((de, ate) =>
        supabase
          .from("base_kit_lojas")
          .select("*")
          .eq("plano_id", planoId)
          .order("codigo")
          .order("bcps")
          .range(de, ate),
      ),
      leve
        ? vazio<{ codigo: string; bcps: string; custo: number; detalhes: unknown }>()
        : todas((de, ate) =>
            supabase
              .from("base_kit_lojas_admin")
              .select("codigo, bcps, custo, detalhes")
              .eq("plano_id", planoId)
              .order("codigo")
              .order("bcps")
              .range(de, ate),
          ),
      todas((de, ate) =>
        supabase
          .from("base_lojas")
          .select("bcps, sacolas_meta, sacolas_planejadas")
          .eq("plano_id", planoId)
          .order("bcps")
          .range(de, ate),
      ),
      leve
        ? vazio<never>()
        : todas((de, ate) =>
            supabase
              .from("base_lojas_estoque" as never)
              .select("*")
              .eq("plano_id" as never, planoId as never)
              .order("bcps" as never)
              .range(de, ate),
          ),
    ]);
    const itensPor = new Map<string, ItemKit[]>();
    for (const i of itens)
      itensPor.set(i.codigo, [
        ...(itensPor.get(i.codigo) ?? []),
        {
          ordem: i.ordem,
          papel: i.papel,
          sku: i.sku,
          descricao: i.descricao,
          precoItem: Number(i.preco_item),
          promoPct: i.promo_pct === null ? null : Number(i.promo_pct),
        },
      ]);
    const adminPor = new Map(admin.map((a) => [`${a.codigo}|${a.bcps}`, a]));
    type LinhaKitLoja = {
      codigo: string;
      bcps: string;
      qtd: number;
      disponivel?: number | null;
      capacidade_loja?: number | null;
      disponivel_ref?: string | null;
    };
    type LinhaFoto = {
      bcps: string;
      atual_ref: string | null;
      atual: Record<string, number>;
      anterior_ref: string | null;
      anterior: Record<string, number>;
    };
    return {
      planoId,
      ciclo,
      kits: kits.map((k) => ({
        codigo: k.codigo,
        tema: k.tema,
        nicho: k.nicho,
        preco: Number(k.preco),
        valorCheio: Number(k.valor_cheio),
        descontoPct: Number(k.desconto_pct),
        heroiSku: k.heroi_sku,
        itens: itensPor.get(k.codigo) ?? [],
      })),
      kitLojas: (kitLojas as unknown as LinhaKitLoja[]).map((kl): KitLojaBase => {
        const a = adminPor.get(`${kl.codigo}|${kl.bcps}`);
        const detalhes = (a?.detalhes ?? []) as { sku: string; estoque: number }[];
        return {
          codigo: kl.codigo,
          bcps: kl.bcps,
          qtd: kl.qtd,
          custo: Number(a?.custo ?? 0),
          disponivel: kl.disponivel ?? null,
          capacidadeLoja: kl.capacidade_loja ?? null,
          disponivelRef: kl.disponivel_ref ?? null,
          geracao: detalhes.map((d) => ({ sku: d.sku, estoque: Number(d.estoque) })),
        };
      }),
      lojas: lojas.map((l) => ({
        bcps: l.bcps,
        sacolasMeta: l.sacolas_meta,
        sacolasPlanejadas: l.sacolas_planejadas,
      })),
      fotos: Object.fromEntries(
        (fotos as unknown as LinhaFoto[]).map((f): [string, FotoEstoque] => [
          f.bcps,
          {
            atualRef: f.atual_ref,
            atual: f.atual ?? {},
            anteriorRef: f.anterior_ref,
            anterior: f.anterior ?? {},
          },
        ]),
      ),
    } satisfies KitsDaBase;
  },

  async gravarDisponibilidade(planoId, ref, lojas) {
    // função da F1b (0002d), ainda fora do types.ts; em lotes de 40 lojas
    for (const grupo of pedacos(lojas, 40)) {
      const { error } = await supabase.rpc(
        "gravar_disponibilidade" as never,
        { p_plano: planoId, p_ref: ref, p_dados: { lojas: grupo } } as never,
      );
      if (error) throw new Error(error.message);
    }
  },

  async regerarKitsLoja(planoId, bcps, pedido) {
    const { error } = await supabase.rpc(
      "regerar_kits_loja" as never,
      { p_plano: planoId, p_bcps: bcps, p_dados: pedido } as never,
    );
    if (error) throw new Error(error.message);
  },

  // ----- F2a (dashboards) -----
  async lojasDaBase(planoId) {
    // função do 0002f (fora do types.ts): uma linha por loja, custo só para admin/acompanhamento
    type Resumo = {
      bcps: string;
      sacolas_meta: number;
      sacolas_planejadas: number;
      receita: number;
      custo: number | null;
      capacidade: number | null;
      disponivel_ref: string | null;
    };
    const [lojas, metas] = await Promise.all([
      todas<Resumo>(
        (de, ate) =>
          supabase
            .rpc("resumo_lojas_da_base" as never, { p_plano: planoId } as never)
            .order("bcps" as never)
            .range(de, ate) as never,
      ),
      todas((de, ate) =>
        supabase
          .from("plano_metas")
          .select("bcps, meta, vendedoras, meta_semana")
          .eq("plano_id", planoId)
          .order("bcps")
          .range(de, ate),
      ),
    ]);
    const metaDe = new Map(metas.map((m) => [m.bcps, m]));
    return lojas.map((l) => {
      const m = metaDe.get(l.bcps);
      return {
        bcps: l.bcps,
        meta: Number(m?.meta ?? 0),
        vendedoras: m?.vendedoras ?? 0,
        metaSemana: Number(m?.meta_semana ?? 0),
        sacolasMeta: l.sacolas_meta,
        sacolasPlanejadas: l.sacolas_planejadas,
        receita: Number(l.receita),
        custo: l.custo === null ? null : Number(l.custo),
        capacidade: l.capacidade,
        disponivelRef: l.disponivel_ref,
      };
    });
  },

  async resumoEstoque() {
    // tabela da F2a (0002e), ainda fora do types.ts
    type Linha = {
      bcps: string;
      ref: string;
      skus: number;
      unidades: number;
      valor_custo: number;
      parados_skus: number;
      parados_custo: number;
      herois: Record<string, number> | null;
    };
    const linhas = await todas<Linha>(
      (de, ate) =>
        supabase
          .from("resumo_estoque_lojas" as never)
          .select("bcps, ref, skus, unidades, valor_custo, parados_skus, parados_custo, herois")
          .order("bcps" as never)
          .range(de, ate) as never,
    );
    return linhas.map((l): ResumoEstoqueLoja => ({
      bcps: l.bcps,
      ref: l.ref,
      skus: l.skus,
      unidades: Number(l.unidades),
      valorCusto: Number(l.valor_custo),
      paradosSkus: l.parados_skus,
      paradosCusto: Number(l.parados_custo),
      herois: l.herois ?? {},
    }));
  },

  async gravarResumoEstoque(linhas) {
    const agora = new Date().toISOString();
    for (const grupo of pedacos(linhas, 500)) {
      const { error } = await supabase.from("resumo_estoque_lojas" as never).upsert(
        grupo.map((l) => ({
          bcps: l.bcps,
          ref: l.ref,
          skus: l.skus,
          unidades: l.unidades,
          valor_custo: l.valorCusto,
          parados_skus: l.paradosSkus,
          parados_custo: l.paradosCusto,
          herois: l.herois,
          atualizado_em: agora,
        })) as never,
        { onConflict: "bcps" },
      );
      if (error) throw new Error(error.message);
    }
  },

  async hierarquiaEPerfis() {
    const [vinculos, nomes, perfis] = await Promise.all([
      todas((de, ate) =>
        supabase
          .from("gerentes_lojas")
          .select("matricula, bcps, nivel")
          .order("bcps")
          .order("nivel")
          .range(de, ate),
      ),
      todas((de, ate) =>
        supabase.from("gerentes").select("matricula, nome").order("matricula").range(de, ate),
      ),
      // só as colunas dos avisos; ve_todas (parte C) ainda não está no types.ts
      todas((de, ate) =>
        supabase
          .from("perfis")
          .select("user_id, nome, usuario, perfil, ativo, matricula, ve_todas" as "*")
          .order("user_id")
          .range(de, ate),
      ),
    ]);
    return {
      vinculos: vinculos.map((v) => ({ ...v, nivel: v.nivel as Nivel })),
      nomes: new Map(nomes.map((n) => [n.matricula, n.nome])),
      perfis: perfis.map((p) => ({
        nome: p.nome,
        usuario: p.usuario,
        perfil: p.perfil as string,
        ativo: p.ativo,
        matricula: p.matricula,
        ve_todas: (p as { ve_todas?: boolean | null }).ve_todas ?? null,
      })),
    };
  },

  async salvarInicioCampanha(ciclo: number, data: string | null) {
    const { error } = await supabase
      .from("ciclos")
      .update({ inicio_campanha: data } as never)
      .eq("id", ciclo);
    if (error) throw new Error(error.message);
  },

  async vendasEnvios() {
    type Linha = {
      inicio: string;
      fim: string;
      arquivo: string | null;
      linhas: number;
      gmv: number;
      enviado_em: string;
    };
    const linhas = await todas<Linha>(
      (de, ate) =>
        supabase
          .from("vendas_envios" as never)
          .select("inicio, fim, arquivo, linhas, gmv, enviado_em")
          .order("enviado_em" as never, { ascending: false })
          .range(de, ate) as never,
    );
    return linhas.map((e) => ({
      inicio: e.inicio,
      fim: e.fim,
      arquivo: e.arquivo,
      linhas: e.linhas,
      gmv: Number(e.gmv),
      enviadoEm: e.enviado_em,
    }));
  },

  async vendasDiarias(inicio: string, fim: string) {
    type Linha = { bcps: string; dia: string; gmv: number; boletos: number; itens: number };
    const linhas = await todas<Linha>(
      (de, ate) =>
        supabase
          .from("vendas_canal_dia" as never)
          .select("bcps, dia, gmv, boletos, itens")
          .gte("dia" as never, inicio as never)
          .lte("dia" as never, fim as never)
          .order("dia" as never)
          .order("bcps" as never)
          .range(de, ate) as never,
    );
    return linhas.map((l): VendaDia => ({
      bcps: l.bcps,
      dia: l.dia,
      gmv: Number(l.gmv),
      boletos: l.boletos,
      itens: Number(l.itens),
    }));
  },

  async gravarVendas(inicio: string, fim: string, arquivo: string, linhas: VendaDia[]) {
    return rpc<number>("gravar_vendas_canal", {
      p_inicio: inicio,
      p_fim: fim,
      p_arquivo: arquivo,
      p_linhas: linhas,
    });
  },

  async ruidos(ciclo: number) {
    type Linha = RuidoLoja;
    const linhas = await todas<Linha>(
      (de, ate) =>
        supabase
          .from("ruido_lojas" as never)
          .select("bcps, dow, ruido, dias_historico, outliers")
          .eq("ciclo" as never, ciclo as never)
          .order("bcps" as never)
          .range(de, ate) as never,
    );
    return linhas.map((r) => ({ ...r, ruido: Number(r.ruido) }));
  },

  async gravarRuido(ciclo: number, inicioCampanha: string, linhas: RuidoLoja[]) {
    await rpc("gravar_ruido", {
      p_ciclo: ciclo,
      p_inicio_campanha: inicioCampanha,
      p_linhas: linhas,
    });
  },

  async declaracoes(ciclo: number) {
    return lerDeclaracoes(ciclo);
  },

  async decidirDeclaracao(id: number, aprovar: boolean, motivo: string | null) {
    await rpc("decidir_declaracao", { p_id: id, p_aprovar: aprovar, p_motivo: motivo });
  },

  async salvarLocalizacao(bcps: string, cidade: string, uf: string) {
    const { error } = await supabase
      .from("lojas")
      .update({ cidade: cidade.trim(), uf: uf.trim().toUpperCase() } as never)
      .eq("bcps", bcps);
    if (error) throw new Error(error.message);
  },
};

/** Chamada a uma função do banco que ainda não está no types.ts. */
async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

// ----- F2b (vendas do canal App Delivery; tabelas do 0002j, ainda fora do types.ts) -----

/** Declarações do ciclo (a RLS filtra: admin/acompanhamento todas, gerente as do escopo). */
export async function lerDeclaracoes(ciclo: number): Promise<Declaracao[]> {
  type Linha = {
    id: number;
    user_id: string;
    bcps: string;
    ciclo: number;
    tipo: "dia" | "semana";
    inicio: string;
    fim: string;
    sacolas: number;
    preco_medio: number;
    status: Declaracao["status"];
    motivo: string | null;
    criado_em: string;
    decidido_em: string | null;
  };
  const linhas = await todas<Linha>(
    (de, ate) =>
      supabase
        .from("declaracoes_vendas" as never)
        .select("*")
        .eq("ciclo" as never, ciclo as never)
        .order("inicio" as never, { ascending: false })
        .range(de, ate) as never,
  );
  return linhas.map((d) => ({
    id: d.id,
    userId: d.user_id,
    bcps: d.bcps,
    ciclo: d.ciclo,
    tipo: d.tipo,
    inicio: d.inicio,
    fim: d.fim,
    sacolas: d.sacolas,
    precoMedio: Number(d.preco_medio),
    status: d.status,
    motivo: d.motivo,
    criadoEm: d.criado_em,
    decididoEm: d.decidido_em,
  }));
}

export type { AoProgredir };
