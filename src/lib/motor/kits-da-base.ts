// Kits de uma base definida, como o admin os lê para a F1b (divergências, troca de kits por loja e
// disponibilidade diária). Estrutura comum à nuvem e ao modo local; tudo aqui é puro.
import { capacidadeConjunta, podeMontar } from "./capacidade";
import { analisarLoja, type AnaliseLoja } from "./divergencias";
import {
  composicaoDoKit,
  heroisPossiveisNaLoja,
  regerarKitsDaLoja,
  type EntradaSimulacao,
  type ItemKit,
  type ResultadoRegerar,
  type ResultadoSimulacao,
} from "./gerar";

export interface KitBase {
  codigo: string;
  tema: string;
  nicho: string | null;
  preco: number;
  valorCheio: number;
  descontoPct: number;
  heroiSku: string;
  itens: ItemKit[];
}

export interface KitLojaBase {
  codigo: string;
  bcps: string;
  qtd: number;
  custo: number;
  disponivel: number | null;
  capacidadeLoja: number | null;
  disponivelRef: string | null;
  /** Estoque de cada item quando o kit foi gerado na loja. */
  geracao: { sku: string; estoque: number }[];
}

export interface FotoEstoque {
  atualRef: string | null;
  atual: Record<string, number>;
  anteriorRef: string | null;
  anterior: Record<string, number>;
}

export interface KitsDaBase {
  planoId: number;
  ciclo: number;
  kits: KitBase[];
  kitLojas: KitLojaBase[];
  lojas: { bcps: string; sacolasMeta: number; sacolasPlanejadas: number }[];
  fotos: Record<string, FotoEstoque>;
}

/** O que vai para gravar_disponibilidade, por loja. */
export interface DisponibilidadeLoja {
  bcps: string;
  /** Só os produtos dos kits da loja. */
  estoque: Record<string, number>;
  capacidade: number;
  kits: { codigo: string; disponivel: number }[];
}

const skusDo = (k: KitBase) => k.itens.map((i) => i.sku);

/** Disponibilidade de cada loja da base com o estoque de hoje (lojas sem estoque lido ficam de fora). */
export function calcularDisponibilidade(
  base: KitsDaBase,
  estoquePorLoja: Map<string, Map<string, number>>,
  /** true = loja sem nenhuma linha conta como estoque zero (Cobertura inteira); false = fica de fora. */
  ausenteZero = false,
): DisponibilidadeLoja[] {
  const porCodigo = new Map(base.kits.map((k) => [k.codigo, k]));
  const porLoja = new Map<string, KitLojaBase[]>();
  for (const kl of base.kitLojas) porLoja.set(kl.bcps, [...(porLoja.get(kl.bcps) ?? []), kl]);
  const r: DisponibilidadeLoja[] = [];
  for (const [bcps, kls] of porLoja) {
    const estoque = estoquePorLoja.get(bcps) ?? (ausenteZero ? new Map<string, number>() : null);
    if (!estoque) continue;
    const listas = kls.map((kl) => skusDo(porCodigo.get(kl.codigo)!));
    const skus = [...new Set(listas.flat())];
    r.push({
      bcps,
      estoque: Object.fromEntries(skus.map((s) => [s, estoque.get(s) ?? 0])),
      capacidade: capacidadeConjunta(listas, estoque),
      kits: kls.map((kl, i) => ({
        codigo: kl.codigo,
        disponivel: podeMontar(listas[i]!, estoque),
      })),
    });
  }
  return r;
}

/** Estoque por loja a partir das linhas de estoque (motor ou Cobertura). */
export function estoquePorLojaDe(linhas: { bcps: string; sku: string; estoque: number }[]) {
  const m = new Map<string, Map<string, number>>();
  for (const x of linhas) {
    const l = m.get(x.bcps) ?? new Map<string, number>();
    l.set(x.sku, x.estoque);
    m.set(x.bcps, l);
  }
  return m;
}

/** Análise de divergências de todas as lojas da base que estão nos dados do motor. */
export function analisarBase(
  base: KitsDaBase,
  motor: EntradaSimulacao,
  nomes: Map<string, { nome: string; praca: string }>,
): AnaliseLoja[] {
  const p = motor.parametros;
  const porCodigo = new Map(base.kits.map((k) => [k.codigo, k]));
  const hoje = estoquePorLojaDe(motor.estoque);
  const metaDe = new Map(base.lojas.map((l) => [l.bcps, l.sacolasMeta]));
  const porLoja = new Map<string, KitLojaBase[]>();
  for (const kl of base.kitLojas) porLoja.set(kl.bcps, [...(porLoja.get(kl.bcps) ?? []), kl]);
  const r: AnaliseLoja[] = [];
  for (const [bcps, kls] of porLoja) {
    const estoqueHoje = hoje.get(bcps);
    if (!estoqueHoje) continue; // loja fora da simulação (ex.: outra praça)
    const geracao = new Map<string, number>();
    for (const kl of kls) for (const g of kl.geracao) geracao.set(g.sku, g.estoque);
    const foto = base.fotos[bcps];
    const anterior = foto?.anteriorRef ? new Map(Object.entries(foto.anterior)) : null;
    r.push(
      analisarLoja({
        bcps,
        nome: nomes.get(bcps)?.nome ?? bcps,
        praca: nomes.get(bcps)?.praca ?? "",
        kits: kls.map((kl) => {
          const k = porCodigo.get(kl.codigo)!;
          return { codigo: k.codigo, skus: skusDo(k), heroiSku: k.heroiSku };
        }),
        estoqueHoje,
        estoqueAnterior: anterior,
        estoqueGeracao: geracao,
        sacolasMeta: metaDe.get(bcps) ?? 0,
        heroisPossiveis: heroisPossiveisNaLoja(motor, bcps),
        quedaPct: p.divergencia_queda_pct,
        minKits: p.divergencia_min_kits,
      }),
    );
  }
  return r;
}

/** Próximo número livre de código na base (C15-0123 → 124). */
export function proximoNumero(base: KitsDaBase): number {
  return base.kits.reduce((m, k) => Math.max(m, Number(k.codigo.split("-").pop()) || 0), 0) + 1;
}

/** Troca os kits de uma loja: monta o pedido para o banco e devolve a base já atualizada. */
export function trocarKitsDaLoja(
  base: KitsDaBase,
  motor: EntradaSimulacao,
  bcps: string,
): { resultado: ResultadoRegerar; base: KitsDaBase } {
  const porCodigo = new Map(base.kits.map((k) => [k.codigo, k]));
  const kls = base.kitLojas.filter((kl) => kl.bcps === bcps);
  const resultado = regerarKitsDaLoja({
    motor,
    bcps,
    sacolasMeta: base.lojas.find((l) => l.bcps === bcps)?.sacolasMeta ?? 0,
    kitsAtuais: kls.map((kl) => {
      const k = porCodigo.get(kl.codigo)!;
      return {
        codigo: k.codigo,
        skus: skusDo(k),
        heroiSku: k.heroiSku,
        preco: k.preco,
        qtd: kl.qtd,
        custo: kl.custo,
      };
    }),
    codigosDaBase: new Map(base.kits.map((k) => [composicaoDoKit(skusDo(k), k.preco), k.codigo])),
    proximoNumero: proximoNumero(base),
  });

  // base atualizada em memória (para a próxima loja reaproveitar códigos e para a tela)
  const fora = new Set(resultado.remover);
  const manter = new Map(resultado.manter.map((m) => [m.codigo, m]));
  const kitLojas = base.kitLojas
    .filter((kl) => !(kl.bcps === bcps && fora.has(kl.codigo)))
    .map((kl) =>
      kl.bcps === bcps && manter.has(kl.codigo)
        ? {
            ...kl,
            qtd: manter.get(kl.codigo)!.qtd,
            disponivel: manter.get(kl.codigo)!.disponivel,
            capacidadeLoja: resultado.loja.capacidade,
          }
        : kl,
    );
  for (const n of resultado.novos)
    kitLojas.push({
      codigo: n.codigo,
      bcps,
      qtd: n.qtd,
      custo: n.custo,
      disponivel: n.disponivel,
      capacidadeLoja: resultado.loja.capacidade,
      disponivelRef: null,
      geracao: n.detalhes.map((d) => ({ sku: d.sku, estoque: d.estoque })),
    });
  const usados = new Set(kitLojas.map((kl) => kl.codigo));
  const kits = [
    ...base.kits,
    ...resultado.kitsNovos.map((k) => ({
      codigo: k.codigo,
      tema: k.tema,
      nicho: k.nicho,
      preco: k.preco,
      valorCheio: k.valorCheio,
      descontoPct: k.descontoPct,
      heroiSku: k.heroiSku,
      itens: k.itens,
    })),
  ].filter((k) => usados.has(k.codigo));
  const lojas = base.lojas.map((l) =>
    l.bcps === bcps ? { ...l, sacolasPlanejadas: resultado.loja.sacolasPlanejadas } : l,
  );
  return { resultado, base: { ...base, kits, kitLojas, lojas } };
}

/** Pedido para regerar_kits_loja (formato do SQL 0002d). */
export function pedidoRegerar(r: ResultadoRegerar, ref: string | null) {
  return {
    ref,
    remover: r.remover,
    manter: r.manter,
    kits: r.kitsNovos.map((k) => ({
      codigo: k.codigo,
      tema: k.tema,
      nicho: k.nicho,
      preco: k.preco,
      valor_cheio: k.valorCheio,
      desconto_pct: k.descontoPct,
      heroi_sku: k.heroiSku,
      itens: k.itens.map((i) => ({
        ordem: i.ordem,
        papel: i.papel,
        sku: i.sku,
        descricao: i.descricao,
        preco_item: i.precoItem,
        promo_pct: i.promoPct,
      })),
    })),
    novos: r.novos.map((n) => ({
      codigo: n.codigo,
      qtd: n.qtd,
      disponivel: n.disponivel,
      custo: n.custo,
      margem: n.margem,
      valor_cheio: n.valorCheio,
      desconto_pct: n.descontoPct,
      detalhes: n.detalhes,
    })),
    loja: {
      sacolas_possiveis: r.loja.sacolasPossiveis,
      sacolas_planejadas: r.loja.sacolasPlanejadas,
      receita: r.loja.receita,
      custo: r.loja.custo,
      capacidade: r.loja.capacidade,
    },
  };
}

/** Kits da base a partir de uma simulação (modo local e testes): só kits com sacolas, como definir_base. */
export function baseDaSimulacao(r: ResultadoSimulacao, planoId: number): KitsDaBase {
  const kitLojas: KitLojaBase[] = r.lojas.flatMap((l) =>
    l.kits
      .filter((k) => k.qtd > 0)
      .map((k) => ({
        codigo: k.codigo,
        bcps: l.bcps,
        qtd: k.qtd,
        custo: k.custo,
        disponivel: null,
        capacidadeLoja: null,
        disponivelRef: null,
        geracao: k.detalhes.map((d) => ({ sku: d.sku, estoque: d.estoque })),
      })),
  );
  const usados = new Set(kitLojas.map((kl) => kl.codigo));
  return {
    planoId,
    ciclo: r.ciclo,
    kits: r.kits
      .filter((k) => usados.has(k.codigo))
      .map((k) => ({
        codigo: k.codigo,
        tema: k.tema,
        nicho: k.nicho,
        preco: k.preco,
        valorCheio: k.valorCheio,
        descontoPct: k.descontoPct,
        heroiSku: k.heroiSku,
        itens: k.itens,
      })),
    kitLojas,
    lojas: r.lojas.map((l) => ({
      bcps: l.bcps,
      sacolasMeta: l.sacolasMeta,
      sacolasPlanejadas: l.sacolasPlanejadas,
    })),
    fotos: {},
  };
}
