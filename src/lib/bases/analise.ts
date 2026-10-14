// Análise dos arquivos de cada base: detecta o layout, converte, valida e monta a prévia.
// Tudo puro (sem banco): o contexto traz as lojas já cadastradas.
import {
  cidadeDoEndereco,
  formasDoCodigo,
  indiceDeCodigos,
  lojaRelevante,
  tipoDCentros,
} from "@/lib/lojas/regras";

import type {
  BaseId,
  Estoque,
  Faturamento,
  InfoLoja,
  Loja,
  Parte,
  Produto,
  Promocao,
  SkuCobertura,
  Vendedoras,
  Vinculo,
} from "./esquemas";
import type { Planilha } from "./leitor";
import { nichoInferido } from "./nicho";
import {
  booleano,
  codigo,
  dataDoNomeDoArquivo,
  mes,
  normalizarCabecalho,
  numero,
  texto,
} from "./valores";

export interface LojaContexto {
  bcps: string;
  tipo: string;
  divisao: string | null;
  /** Código SAP (dCentros): a lista de vendedoras pode vir por ele (4118 ou A118). */
  sap?: string | null | undefined;
  /** Ausente (ex.: modo local, sem a coluna) = só o tipo decide. */
  participa?: boolean | undefined;
}

export interface Contexto {
  nomeArquivo: string;
  lojas: LojaContexto[];
  /** Data de referência da base (cobertura). */
  versaoRef: string | null;
  /** Ciclo da promoção. */
  ciclo: number | null;
  /** Mês escolhido na base de gerentes (AAAA-MM). */
  mes: string | null;
  /** SKUs com fornecedor BOT no cadastro (para filtrar a cobertura antes de enviar). */
  skusBot?: Set<string> | null;
  /** Primeiras palavras das descrições BOT (SKU fora do cadastro entra se a 1ª palavra for BOT). */
  palavrasBot?: Set<string> | null;
}

export interface ErroLinha {
  linha: number;
  mensagem: string;
}

export interface Analise {
  base: BaseId;
  layout: string;
  linhasLidas: number;
  partes: { parte: Parte; linhas: unknown[] }[];
  erros: ErroLinha[];
  avisos: string[];
  resumo: { rotulo: string; valor: string }[];
  amostra: { colunas: string[]; linhas: (string | number | boolean | null)[][] };
  /** Meses encontrados (base de gerentes), do mais recente ao mais antigo. */
  meses?: { mes: string; linhas: number }[] | undefined;
  /** Valores efetivamente usados. */
  versaoRef?: string | null | undefined;
  ciclo?: number | null | undefined;
  mes?: string | null | undefined;
}

export class ErroDeLayout extends Error {}

/** Linhas sem o código principal (ex.: linha de total no fim da planilha) são puladas e só contadas. */
function avisoSemCodigo(avisos: string[], n: number, campo: string) {
  if (n)
    avisos.push(
      `${n.toLocaleString("pt-BR")} linha(s) sem ${campo} foram puladas (ex.: linha de total ou rodapé).`,
    );
}

// ---------------------------------------------------------------------------
// utilitários

type Mapa<K extends string> = Record<K, string[]>;

function indices<K extends string>(p: Planilha, mapa: Mapa<K>) {
  const idx = {} as Record<K, number>;
  const faltando: K[] = [];
  for (const campo of Object.keys(mapa) as K[]) {
    const i = p.chaves.findIndex((c) => mapa[campo].some((a) => normalizarCabecalho(a) === c));
    if (i < 0) faltando.push(campo);
    idx[campo] = i;
  }
  return { idx, faltando };
}

function tem(p: Planilha, ...nomes: string[]) {
  return nomes.every((n) => p.chaves.includes(normalizarCabecalho(n)));
}

const fmt = (n: number) => n.toLocaleString("pt-BR");

function linhaDoArquivo(p: Planilha, i: number) {
  return p.linhaCabecalho + 1 + i;
}

function celula(l: unknown[], i: number): unknown {
  return i >= 0 ? l[i] : undefined;
}

function amostraDe<T extends object>(registros: T[], colunas: (keyof T & string)[], n = 8) {
  return {
    colunas,
    linhas: registros.slice(0, n).map((r) =>
      colunas.map((c) => {
        const v = (r as Record<string, unknown>)[c];
        if (Array.isArray(v)) return v.join(", ");
        return v === undefined ? null : (v as string | number | boolean | null);
      }),
    ),
  };
}

function lojasPorBcps(ctx: Contexto) {
  return new Map(ctx.lojas.map((l) => [l.bcps, l]));
}

function exigirLojas(ctx: Contexto) {
  if (ctx.lojas.length === 0) {
    throw new ErroDeLayout(
      "Envie primeiro a base de Lojas: esta base depende das lojas cadastradas.",
    );
  }
}

function listaCurta(itens: string[], max = 10) {
  return itens.length > max
    ? `${itens.slice(0, max).join(", ")} e mais ${itens.length - max}`
    : itens.join(", ");
}

function nichoDoProduto(subcategoria: string | null, marca: string | null, descricao: string) {
  const r = nichoInferido(subcategoria, marca, descricao);
  return { nicho: r.nicho, origem_nicho: r.origem };
}

const regularPelaDescricao = (descricao: string) =>
  !/\b(PRM|AMOST|AMOSTRA|MINI)\b/i.test(descricao);

function semPlanilha(descricao: string): never {
  throw new ErroDeLayout(`Não encontrei as colunas esperadas. ${descricao}`);
}

// ---------------------------------------------------------------------------
// LOJAS (layout tratado: lojas.csv)

const MAPA_LOJAS = {
  bcps: ["bcps"],
  divisao: ["divisao"],
  nome: ["loja", "nome"],
  praca: ["praca"],
  tipo: ["tipo"],
  canal_geral: ["canal geral"],
  canais: ["canais"],
  vendedoras: ["vendedoras"],
};

function analisarLojas(planilhas: Planilha[], ctx: Contexto): Analise {
  const dcentros = planilhas.find(
    (x) => tem(x, "bcps", "tipo") && (tem(x, "nome abreviado") || tem(x, "centro de custo")),
  );
  if (dcentros) return analisarDCentros(dcentros, ctx);
  const p = planilhas.find(
    (x) => tem(x, "bcps", "praca", "tipo") && (tem(x, "loja") || tem(x, "nome")),
  );
  if (!p)
    semPlanilha(
      "Lojas: bcps, divisao, loja, praca, tipo (loja/hub/er), canal_geral, canais, vendedoras.",
    );
  const { idx } = indices(p, MAPA_LOJAS);
  const comVendedoras = idx.vendedoras >= 0;
  const erros: ErroLinha[] = [];
  const registros = new Map<string, Loja>();
  let duplicadas = 0;

  p.linhas.forEach((l, i) => {
    const n = linhaDoArquivo(p, i);
    const bcps = codigo(celula(l, idx.bcps));
    const nome = texto(celula(l, idx.nome));
    const praca = texto(celula(l, idx.praca));
    const tipo = normalizarCabecalho(celula(l, idx.tipo));
    if (!bcps || !nome || !praca)
      return void erros.push({ linha: n, mensagem: "BCPS, loja e praça são obrigatórios." });
    if (tipo !== "loja" && tipo !== "hub" && tipo !== "er") {
      return void erros.push({
        linha: n,
        mensagem: `Tipo "${String(celula(l, idx.tipo) ?? "")}" inválido (use loja, hub ou er).`,
      });
    }
    const canais = (texto(celula(l, idx.canais)) ?? "")
      .split(/[|;,]/)
      .map((c) => c.trim())
      .filter(Boolean);
    const reg: Loja = {
      bcps,
      divisao: codigo(celula(l, idx.divisao)),
      nome,
      praca,
      tipo,
      canal_geral: texto(celula(l, idx.canal_geral)),
      canais,
    };
    if (comVendedoras) {
      const v = numero(celula(l, idx.vendedoras));
      if (v !== null && (Number.isNaN(v) || v < 0 || !Number.isInteger(v))) {
        return void erros.push({ linha: n, mensagem: "Vendedoras deve ser um número inteiro." });
      }
      reg.vendedoras = v ?? 0;
    }
    if (registros.has(bcps)) duplicadas++;
    registros.set(bcps, reg);
  });

  const lista = [...registros.values()];
  const porTipo = (t: string) => lista.filter((r) => r.tipo === t).length;
  const avisos = [
    "Lojas que já estão no banco e não vierem neste arquivo ficam inativas (não são apagadas).",
  ];
  if (duplicadas) avisos.push(`${fmt(duplicadas)} BCPS repetidos: vale a última linha.`);
  if (!comVendedoras)
    avisos.push("Sem coluna de vendedoras: a quantidade atual de cada loja é mantida.");

  return {
    base: "lojas",
    layout: "Lojas (layout tratado)",
    linhasLidas: p.linhas.length,
    partes: [{ parte: "registros", linhas: lista }],
    erros,
    avisos,
    resumo: [
      { rotulo: "Lojas", valor: fmt(porTipo("loja")) },
      { rotulo: "HUBs / galpão", valor: fmt(porTipo("hub")) },
      { rotulo: "ERs", valor: fmt(porTipo("er")) },
      { rotulo: "Praças", valor: fmt(new Set(lista.map((r) => r.praca)).size) },
      ...(comVendedoras
        ? [{ rotulo: "Vendedoras", valor: fmt(lista.reduce((s, r) => s + (r.vendedoras ?? 0), 0)) }]
        : []),
    ],
    amostra: amostraDe(lista, ["bcps", "nome", "praca", "tipo", "canal_geral", "canais"]),
  };
}

// LOJAS pela dCentros (parte B, 10/10/2026): todas as linhas, de todos os tipos.
// Tipo mostrado = exatamente a coluna "Tipo" (11/10/2026: sem as exceções ER e QDB; a QDB se acha pela Marca).
// "Participa" não vem do arquivo: loja nova entra como "não participa" (tela Lojas).
function tipoTecnico(t: string): Loja["tipo"] {
  if (t === "varejo" || t === "hibrida") return "loja";
  if (t === "hub" || t === "estoque") return "hub";
  return "outro";
}

function analisarDCentros(p: Planilha, ctx: Contexto): Analise {
  const { idx } = indices(p, {
    bcps: ["bcps"],
    abrev: ["nome abreviado"],
    nome: ["nome"],
    praca: ["praca"],
    tipo: ["tipo"],
    sap: ["sap"],
    centro_custo: ["centro de custo"],
    marca: ["marca"],
    uf: ["uf"],
    endereco: ["endereco"],
  });
  const erros: ErroLinha[] = [];
  const registros = new Map<string, Loja>();
  let semCidade = 0;
  let semCodigo = 0;
  p.linhas.forEach((l, i) => {
    const bcps = codigo(celula(l, idx.bcps));
    if (!bcps) return void semCodigo++;
    const tipoArquivo = texto(celula(l, idx.tipo));
    // 12/10/2026: o nome é o "Nome" completo (o "Nome Abreviado" atrapalhava a busca); abreviado só se faltar
    const nome = texto(celula(l, idx.nome)) ?? texto(celula(l, idx.abrev));
    const praca = texto(celula(l, idx.praca));
    if (!tipoArquivo || !nome || !praca) {
      return void erros.push({
        linha: linhaDoArquivo(p, i),
        mensagem: "Tipo, nome e praça são obrigatórios.",
      });
    }
    const marca = texto(celula(l, idx.marca));
    const uf = texto(celula(l, idx.uf))?.toUpperCase() ?? null;
    const cidade = cidadeDoEndereco(texto(celula(l, idx.endereco)), uf);
    if (idx.endereco >= 0 && !cidade) semCidade++;
    const exibido = tipoDCentros(tipoArquivo);
    const t = normalizarCabecalho(tipoArquivo);
    const vendaDireta = t === "venda direta";
    registros.set(bcps, {
      bcps,
      nome,
      praca,
      tipo: tipoTecnico(t),
      canal_geral:
        t === "hibrida"
          ? "Híbrida"
          : t === "varejo"
            ? "Varejo"
            : vendaDireta
              ? "Venda Direta"
              : null,
      canais:
        t === "hibrida"
          ? ["Varejo", "Venda Direta"]
          : t === "varejo"
            ? ["Varejo"]
            : vendaDireta
              ? ["Venda Direta"]
              : [],
      tipo_dcentros: exibido,
      ...(idx.sap >= 0 ? { sap: codigo(celula(l, idx.sap)) } : {}),
      ...(idx.centro_custo >= 0 ? { centro_custo: codigo(celula(l, idx.centro_custo)) } : {}),
      ...(idx.marca >= 0 ? { marca } : {}),
      ...(idx.uf >= 0 ? { uf } : {}),
      ...(idx.endereco >= 0 ? { cidade } : {}),
      ...(idx.nome >= 0 ? { nome_completo: texto(celula(l, idx.nome)) } : {}),
    });
  });
  const lista = [...registros.values()];
  const existentes = new Set(ctx.lojas.map((x) => x.bcps));
  const novas = lista.filter((r) => !existentes.has(r.bcps)).length;
  const porTipo = new Map<string, number>();
  for (const r of lista) porTipo.set(r.tipo_dcentros!, (porTipo.get(r.tipo_dcentros!) ?? 0) + 1);
  const avisos = [
    "dCentros: entram todas as lojas, de todos os tipos. Quem recebe kits e meta é definido na tela Lojas (participa).",
    `${fmt(novas)} loja(s) nova(s) entram como "não participa". As que já existem mantêm a escolha.`,
    "Lojas que já estão no banco e não vierem no arquivo ficam inativas. Divisão e vendedoras atuais são mantidas.",
  ];
  avisoSemCodigo(avisos, semCodigo, "BCPS");
  if (idx.sap < 0 || idx.centro_custo < 0)
    avisos.push("Não achei as colunas SAP e/ou Centro de custo: ficam como estão no banco.");
  if (semCidade)
    avisos.push(
      `${fmt(semCidade)} loja(s) sem cidade reconhecida no Endereço (ficam fora do mapa até a correção).`,
    );
  return {
    base: "lojas",
    layout: "dCentros (pela coluna Tipo)",
    linhasLidas: p.linhas.length,
    partes: [{ parte: "registros", linhas: lista }],
    erros,
    avisos,
    resumo: [
      { rotulo: "Lojas", valor: fmt(lista.length) },
      ...[...porTipo.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => ({ rotulo: k, valor: fmt(n) })),
      { rotulo: "Novas", valor: fmt(novas) },
    ],
    amostra: amostraDe(lista, ["bcps", "nome", "praca", "tipo_dcentros", "cidade", "uf"]),
  };
}

// ---------------------------------------------------------------------------
// GERENTES (dGerentes original, ou lojas.csv com as colunas de gerentes)

const MAPA_DGERENTES = {
  mes: ["mes ano"],
  bcps: ["bcps"],
  divisao: ["divisao"],
  canal_geral: ["canal geral"],
  canal: ["canal"],
  gvo_nome: ["nome completo gvo"],
  gvo_mat: ["matricula gvo"],
  gc_nome: ["nome completo gcvo gpvo"],
  gc_mat: ["matricula gcvo gpvo"],
  gr_nome: ["nome completo grvo"],
  gr_mat: ["matricula grvo"],
};

const MAPA_GERENTES_TRATADO = {
  bcps: ["bcps"],
  divisao: ["divisao"],
  canal_geral: ["canal geral"],
  canais: ["canais"],
  gvo_nome: ["gvo"],
  gvo_mat: ["gvo matricula"],
  gc_nome: ["gcvo gpvo"],
  gc_mat: ["gcvo gpvo matricula"],
  gr_nome: ["grvo"],
  gr_mat: ["grvo matricula"],
};

function analisarGerentes(planilhas: Planilha[], ctx: Contexto): Analise {
  exigirLojas(ctx);
  const original = planilhas.find((x) => tem(x, "mes ano", "bcps", "matricula grvo"));
  const tratado = original
    ? undefined
    : planilhas.find((x) => tem(x, "bcps", "grvo matricula", "gcvo gpvo matricula"));
  const p = original ?? tratado;
  if (!p) {
    semPlanilha(
      "Gerentes: MÊS/ANO, BCPS, DIVISÃO, Canal Geral, Canal, Nome/Matrícula GVO, GCVO/GPVO e GRVO (dGerentes), " +
        "ou o lojas.csv com as colunas de gerentes.",
    );
  }
  // índices das colunas (-1 = coluna que não existe neste layout)
  const im: Record<keyof typeof MAPA_DGERENTES | keyof typeof MAPA_GERENTES_TRATADO, number> = {
    mes: -1,
    canal: -1,
    canais: -1,
    ...(original ? indices(p, MAPA_DGERENTES).idx : indices(p, MAPA_GERENTES_TRATADO).idx),
  };
  const lojas = lojasPorBcps(ctx);
  const avisos: string[] = [];
  const erros: ErroLinha[] = [];

  // meses (só no original)
  let meses: { mes: string; linhas: number }[] | undefined;
  let mesUsado: string | null = null;
  let linhas = p.linhas.map((l, i) => ({ l, n: linhaDoArquivo(p, i) }));
  if (original) {
    const cont = new Map<string, number>();
    for (const { l } of linhas) {
      const m = mes(celula(l, im.mes));
      if (m) cont.set(m, (cont.get(m) ?? 0) + 1);
    }
    meses = [...cont.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([m, n]) => ({ mes: m, linhas: n }));
    if (meses.length === 0)
      throw new ErroDeLayout("Não encontrei datas válidas na coluna MÊS/ANO.");
    // padrão: o mês mais recente "completo" (com pelo menos metade das linhas do maior mês)
    const maior = Math.max(...meses.map((m) => m.linhas));
    const padrao = meses.find((m) => m.linhas >= maior * 0.5)!.mes;
    mesUsado = ctx.mes && cont.has(ctx.mes) ? ctx.mes : padrao;
    const pulados = meses.filter((m) => m.mes > padrao);
    if (!ctx.mes && pulados.length) {
      avisos.push(
        `Usei ${padrao}, o mês mais recente completo. ` +
          pulados.map((m) => `${m.mes} tem só ${fmt(m.linhas)} linha(s)`).join("; ") +
          ". Dá para trocar o mês acima.",
      );
    }
    const atual = cont.get(mesUsado) ?? 0;
    if (atual < maior * 0.5) {
      avisos.push(
        `O mês ${mesUsado} tem só ${fmt(atual)} linhas (o maior mês tem ${fmt(maior)}). Confira se é o mês certo.`,
      );
    }
    linhas = linhas.filter(({ l }) => mes(celula(l, im.mes)) === mesUsado);
  }

  // Hierarquia (parte C): vem só das colunas do arquivo, loja por loja — GVO, GCVO/GPVO e GRVO.
  // A matrícula só identifica a pessoa; o número nunca define quem está acima.
  // Uma pessoa por nível em cada loja: a híbrida vem em duas linhas (uma por canal) e vale a primeira.
  const vinculos = new Map<string, Vinculo>();
  const porNivelDaLoja = new Map<string, string>(); // "bcps|nivel" → matrícula
  const conflitos = new Set<string>();
  const nomes = new Map<string, string>();
  const info = new Map<string, InfoLoja>();
  const ignoradas = new Set<string>();
  let nomesDiferentes = 0;

  const niveis = [
    ["gvo", im.gvo_nome, im.gvo_mat],
    ["gcvo_gpvo", im.gc_nome, im.gc_mat],
    ["grvo", im.gr_nome, im.gr_mat],
  ] as const;

  for (const { l, n } of linhas) {
    const bcps = codigo(celula(l, im.bcps));
    if (!bcps) {
      erros.push({ linha: n, mensagem: "BCPS vazio." });
      continue;
    }
    // a hierarquia vale para todas as lojas cadastradas (participar ou não é escolha da tela Lojas)
    if (!lojas.has(bcps)) {
      ignoradas.add(bcps);
      continue;
    }
    for (const [nivel, iNome, iMat] of niveis) {
      const matricula = codigo(celula(l, iMat));
      const nome = texto(celula(l, iNome));
      if (!matricula || matricula === "0") continue;
      const chaveNivel = `${bcps}|${nivel}`;
      const primeira = porNivelDaLoja.get(chaveNivel);
      if (primeira && primeira !== matricula) {
        conflitos.add(bcps);
        continue;
      }
      porNivelDaLoja.set(chaveNivel, matricula);
      const anterior = nomes.get(matricula);
      if (anterior && nome && anterior !== nome) nomesDiferentes++;
      if (nome) nomes.set(matricula, nome);
      vinculos.set(`${matricula}|${bcps}|${nivel}`, {
        bcps,
        nivel,
        matricula,
        nome: nome ?? matricula,
      });
    }
    const atual = info.get(bcps) ?? { bcps, divisao: null, canal_geral: null, canais: [] };
    atual.divisao = codigo(celula(l, im.divisao)) ?? atual.divisao;
    atual.canal_geral = texto(celula(l, im.canal_geral)) ?? atual.canal_geral;
    const canaisLinha = original
      ? [texto(celula(l, im.canal))]
      : (texto(celula(l, im.canais)) ?? "").split(/[|;,]/).map((c) => c.trim());
    for (const c of canaisLinha) if (c && !atual.canais.includes(c)) atual.canais.push(c);
    info.set(bcps, atual);
  }

  // o nome final de cada matrícula é o último lido
  const lista = [...vinculos.values()].map((v) => ({
    ...v,
    nome: nomes.get(v.matricula) ?? v.nome,
  }));
  if (ignoradas.size) {
    avisos.push(
      `${fmt(ignoradas.size)} BCPS fora da base de lojas foram ignorados: ${listaCurta([...ignoradas])}.`,
    );
  }
  if (conflitos.size) {
    avisos.push(
      `${fmt(conflitos.size)} loja(s) com gerentes diferentes entre as linhas do mesmo BCPS (ex.: híbrida): vale a primeira linha. ${listaCurta([...conflitos])}.`,
    );
  }
  if (nomesDiferentes)
    avisos.push(
      `${fmt(nomesDiferentes)} matrículas com nomes diferentes no arquivo: vale o último.`,
    );
  avisos.push(
    "A hierarquia de todas as lojas é substituída pela deste arquivo, e o acesso dos gerentes muda junto (cada um vê as lojas onde é GVO, GCVO/GPVO ou GRVO).",
  );

  const porNivel = (nv: string) =>
    new Set(lista.filter((v) => v.nivel === nv).map((v) => v.matricula)).size;
  return {
    base: "gerentes",
    layout: original ? "dGerentes (original)" : "Gerentes a partir do lojas.csv",
    linhasLidas: p.linhas.length,
    partes: [
      { parte: "registros", linhas: lista },
      { parte: "lojas", linhas: [...info.values()] },
    ],
    erros,
    avisos,
    resumo: [
      ...(mesUsado ? [{ rotulo: "Mês usado", valor: mesUsado }] : []),
      { rotulo: "Lojas com gerentes", valor: fmt(info.size) },
      { rotulo: "GRVO", valor: fmt(porNivel("grvo")) },
      { rotulo: "GCVO/GPVO", valor: fmt(porNivel("gcvo_gpvo")) },
      { rotulo: "GVO", valor: fmt(porNivel("gvo")) },
    ],
    amostra: amostraDe(lista, ["bcps", "nivel", "matricula", "nome"]),
    meses,
    mes: mesUsado,
  };
}

// ---------------------------------------------------------------------------
// VENDEDORAS (bcps + vendedoras, ou uma linha por vendedora com o código da filial)

function analisarVendedoras(planilhas: Planilha[], ctx: Contexto): Analise {
  exigirLojas(ctx);
  const lojas = lojasPorBcps(ctx);
  // a loja pode vir pelo BCPS, pela DIVISÃO ou pelo SAP (nas duas formas: 4118 = A118)
  const porCodigo = indiceDeCodigos(ctx.lojas);
  const lojaDoCodigo = (c: string | null) =>
    formasDoCodigo(c)
      .map((k) => porCodigo.get(k))
      .find(Boolean);
  const erros: ErroLinha[] = [];
  const avisos: string[] = [];
  const contagem = new Map<string, number>();
  let layout: string;
  let lidas: number;

  const ALIASES_FILIAL = [
    "divisao",
    "filial",
    "codigo filial",
    "cod filial",
    "codigo da filial",
    "codigo de filial",
    "sap",
    "codigo sap",
    "cod sap",
    "centro sap",
  ];
  const porLoja = planilhas.find(
    (x) =>
      tem(x, "vendedoras") && (tem(x, "bcps") || x.chaves.some((c) => ALIASES_FILIAL.includes(c))),
  );
  const lista = porLoja
    ? undefined
    : planilhas.find((x) => x.chaves.some((c) => ALIASES_FILIAL.includes(c)));

  if (porLoja) {
    layout = "Quantidade por loja (código da loja, vendedoras)";
    lidas = porLoja.linhas.length;
    const { idx } = indices(porLoja, {
      bcps: ["bcps", ...ALIASES_FILIAL],
      vendedoras: ["vendedoras"],
    });
    const desconhecidas = new Set<string>();
    porLoja.linhas.forEach((l, i) => {
      const cod = codigo(celula(l, idx.bcps));
      const v = numero(celula(l, idx.vendedoras));
      if (!cod || v === null || Number.isNaN(v) || v < 0 || !Number.isInteger(v)) {
        return void erros.push({
          linha: linhaDoArquivo(porLoja, i),
          mensagem:
            "Código da loja (BCPS, DIVISÃO ou SAP) e vendedoras (inteiro) são obrigatórios.",
        });
      }
      const bcps = lojaDoCodigo(cod);
      if (!bcps) return void desconhecidas.add(cod);
      contagem.set(bcps, (contagem.get(bcps) ?? 0) + v);
    });
    if (desconhecidas.size)
      avisos.push(
        `${fmt(desconhecidas.size)} código(s) sem loja cadastrada: ${listaCurta([...desconhecidas])}.`,
      );
  } else if (lista) {
    layout = "Lista de vendedoras (uma linha por vendedora, código da filial)";
    lidas = lista.linhas.length;
    const i = lista.chaves.findIndex((c) => ALIASES_FILIAL.includes(c));
    const desconhecidas = new Set<string>();
    for (const l of lista.linhas) {
      const div = codigo(l[i]);
      if (!div) continue;
      const bcps = lojaDoCodigo(div);
      if (!bcps) {
        desconhecidas.add(div);
        continue;
      }
      contagem.set(bcps, (contagem.get(bcps) ?? 0) + 1);
    }
    if (desconhecidas.size) {
      avisos.push(
        `${fmt(desconhecidas.size)} códigos de filial sem loja cadastrada: ${listaCurta([...desconhecidas])}.`,
      );
    }
  } else {
    semPlanilha(
      "Vendedoras: colunas bcps (ou SAP/DIVISÃO) e vendedoras, ou uma coluna com o código da loja (BCPS, DIVISÃO ou SAP, ex.: 4118 ou A118) por vendedora.",
    );
  }

  const registros: Vendedoras[] = [];
  const fora: string[] = [];
  for (const [bcps, vendedoras] of contagem) {
    const loja = lojas.get(bcps);
    if (!loja || loja.tipo !== "loja") fora.push(bcps);
    else registros.push({ bcps, vendedoras });
  }
  if (fora.length)
    avisos.push(
      `${fmt(fora.length)} BCPS que não são lojas cadastradas (HUB, ER ou fora da base de lojas) foram ignorados: ${listaCurta(fora)}.`,
    );
  const semVendedora = ctx.lojas.filter((l) => l.tipo === "loja" && !contagem.has(l.bcps)).length;
  if (semVendedora)
    avisos.push(`${fmt(semVendedora)} lojas não aparecem no arquivo e ficarão com 0 vendedoras.`);

  return {
    base: "vendedoras",
    layout,
    linhasLidas: lidas,
    partes: [{ parte: "registros", linhas: registros }],
    erros,
    avisos,
    resumo: [
      { rotulo: "Lojas com vendedoras", valor: fmt(registros.length) },
      {
        rotulo: "Total de vendedoras",
        valor: fmt(registros.reduce((s, r) => s + r.vendedoras, 0)),
      },
    ],
    amostra: amostraDe(registros, ["bcps", "vendedoras"]),
  };
}

// ---------------------------------------------------------------------------
// PRODUTOS (dsku original, ou produtos.csv tratado)

const MAPA_DSKU = {
  sku: ["codigo"],
  descricao: ["descricao"],
  marca: ["marca"],
  categoria: ["categoria"],
  subcategoria: ["subcategoria"],
  venda: ["venda"],
  fornecedor: ["fornecedor"],
};

const MAPA_PRODUTOS_TRATADO = {
  sku: ["sku"],
  descricao: ["descricao"],
  marca: ["marca"],
  categoria: ["categoria"],
  subcategoria: ["subcategoria"],
  fornecedor: ["fornecedor"],
  preco_dsku: ["preco dsku"],
  origem_fornecedor: ["origem fornecedor"],
  nicho: ["nicho"],
  regular: ["regular"],
};

function origemFornecedor(v: unknown): Produto["origem_fornecedor"] {
  const t = normalizarCabecalho(v);
  if (t.startsWith("primeira")) return "primeira_palavra";
  if (t.startsWith("nao")) return "nao_encontrado";
  return "dsku";
}

function analisarProdutos(planilhas: Planilha[]): Analise {
  const original = planilhas.find(
    (x) => tem(x, "codigo", "fornecedor") && (tem(x, "familia codigo") || tem(x, "venda")),
  );
  const tratado = original
    ? undefined
    : planilhas.find((x) => tem(x, "sku", "descricao", "nicho", "regular"));
  const p = original ?? tratado;
  if (!p) {
    semPlanilha(
      "Produtos: dsku (codigo, descricao, familia, marca, categoria, subcategoria, mercado, custo, venda, ean, fornecedor) " +
        "ou produtos.csv tratado (sku, descricao, marca, categoria, subcategoria, fornecedor, preco_dsku, nicho, regular).",
    );
  }
  const avisos: string[] = [];
  const erros: ErroLinha[] = [];
  const registros = new Map<string, Produto>();
  let duplicados = 0;
  let semCodigo = 0;

  if (original) {
    const { idx } = indices(p, MAPA_DSKU);
    if (idx.descricao < 0) {
      // no dsku a coluna B (descrição) às vezes vem com um número no título
      idx.descricao = idx.sku + 1;
      avisos.push(
        `A coluna de descrição está sem o título "descricao"; usei a coluna ao lado do código ("${p.cabecalho[idx.descricao] ?? ""}").`,
      );
    }
    p.linhas.forEach((l, i) => {
      const sku = codigo(celula(l, idx.sku));
      const descricao = texto(celula(l, idx.descricao));
      if (!sku) return void semCodigo++;
      if (!descricao) {
        return void erros.push({ linha: linhaDoArquivo(p, i), mensagem: "Descrição vazia." });
      }
      const preco = numero(celula(l, idx.venda));
      if (registros.has(sku)) duplicados++;
      registros.set(sku, {
        sku,
        descricao,
        marca: texto(celula(l, idx.marca)),
        categoria: texto(celula(l, idx.categoria)),
        subcategoria: texto(celula(l, idx.subcategoria)),
        fornecedor: texto(celula(l, idx.fornecedor)),
        preco_dsku: preco !== null && Number.isFinite(preco) && preco >= 0 ? preco : null,
        regular: regularPelaDescricao(descricao),
        origem_regular: "descricao",
        origem_fornecedor: "dsku",
        origem_cadastro: "dsku",
        ...nichoDoProduto(
          texto(celula(l, idx.subcategoria)),
          texto(celula(l, idx.marca)),
          descricao,
        ),
      });
    });
    avisos.push(
      "Nicho calculado (o dsku não traz): subcategoria (FEMININ/MASCULIN/INFANT/KIDS/BABY) → marca (listas da referência) → BABY/KIDS/INFANTIL na descrição → senão U.",
      "“Regular” calculado pela descrição: não regular quando tem PRM, AMOST, AMOSTRA ou MINI (provisório).",
    );
  } else {
    const { idx } = indices(p, MAPA_PRODUTOS_TRATADO);
    p.linhas.forEach((l, i) => {
      const n = linhaDoArquivo(p, i);
      const sku = codigo(celula(l, idx.sku));
      const descricao = texto(celula(l, idx.descricao));
      if (!sku) return void semCodigo++;
      if (!descricao) return void erros.push({ linha: n, mensagem: "Descrição vazia." });
      const nichoTxt = (texto(celula(l, idx.nicho)) ?? "").toUpperCase();
      const nicho = ["F", "M", "I", "U"].includes(nichoTxt) ? (nichoTxt as Produto["nicho"]) : null;
      if (nichoTxt && !nicho)
        return void erros.push({
          linha: n,
          mensagem: `Nicho "${nichoTxt}" inválido (F, M, I ou U).`,
        });
      const regular = booleano(celula(l, idx.regular));
      const preco = numero(celula(l, idx.preco_dsku));
      const origem = origemFornecedor(celula(l, idx.origem_fornecedor));
      if (registros.has(sku)) duplicados++;
      registros.set(sku, {
        sku,
        descricao,
        marca: texto(celula(l, idx.marca)),
        categoria: texto(celula(l, idx.categoria)),
        subcategoria: texto(celula(l, idx.subcategoria)),
        fornecedor: texto(celula(l, idx.fornecedor)),
        preco_dsku: preco !== null && Number.isFinite(preco) && preco > 0 ? preco : null,
        regular: regular ?? regularPelaDescricao(descricao),
        origem_regular: regular === null ? "descricao" : "base",
        origem_fornecedor: origem,
        origem_cadastro: origem === "dsku" ? "dsku" : "cobertura",
        ...(nicho
          ? { nicho, origem_nicho: "base" as const }
          : nichoDoProduto(
              texto(celula(l, idx.subcategoria)),
              texto(celula(l, idx.marca)),
              descricao,
            )),
      });
    });
  }

  // só fornecedor BOT vai para o banco (é o que o pool usa) — upload mais rápido
  const todos = [...registros.values()];
  const lista = todos.filter((r) => (r.fornecedor ?? "").toUpperCase() === "BOT");
  if (todos.length > lista.length) {
    avisos.push(
      `${fmt(todos.length - lista.length)} produtos de outros fornecedores (não BOT) não são enviados.`,
    );
  }
  if (duplicados) avisos.push(`${fmt(duplicados)} códigos repetidos: vale a última linha.`);
  avisoSemCodigo(avisos, semCodigo, "código");
  avisos.push(
    "O cadastro de produtos é cumulativo: produtos antigos que não vierem no arquivo continuam no banco.",
  );
  const fornecedores = new Map<string, number>();
  for (const r of lista)
    fornecedores.set(
      r.fornecedor ?? "(vazio)",
      (fornecedores.get(r.fornecedor ?? "(vazio)") ?? 0) + 1,
    );

  return {
    base: "produtos",
    layout: original ? `dsku (original, aba "${p.nome}")` : "Produtos (layout tratado)",
    linhasLidas: p.linhas.length,
    partes: [{ parte: "registros", linhas: lista }],
    erros,
    avisos,
    resumo: [
      { rotulo: "Produtos", valor: fmt(lista.length) },
      { rotulo: "Fornecedor BOT", valor: fmt(fornecedores.get("BOT") ?? 0) },
      { rotulo: "Não regulares", valor: fmt(lista.filter((r) => !r.regular).length) },
      ...(["F", "M", "I", "U"] as const).map((n) => ({
        rotulo: `Nicho ${n}`,
        valor: fmt(lista.filter((r) => r.nicho === n).length),
      })),
    ],
    amostra: amostraDe(lista, ["sku", "descricao", "marca", "categoria", "fornecedor", "regular"]),
  };
}

// ---------------------------------------------------------------------------
// COBERTURA (original ; com vírgula decimal, ou seed normalizado)

const MAPA_COBERTURA = {
  sku: ["sku"],
  descricao: ["descricao"],
  bcps: ["bcps"],
  estoque: ["estoque"],
  custo: ["custo"],
  preco: ["preco de venda", "preco"],
  vmd: ["vmd"],
  situacao: ["situacao"],
};

function analisarCobertura(planilhas: Planilha[], ctx: Contexto): Analise {
  exigirLojas(ctx);
  const p = planilhas.find((x) => tem(x, "sku", "bcps", "estoque", "vmd"));
  if (!p)
    semPlanilha(
      "Cobertura: SKU; Descrição; BCPS; Loja; Praça; Estado; Estoque; Custo; Preço de Venda; VMD; …; Situação.",
    );
  const { idx, faltando } = indices(p, MAPA_COBERTURA);
  if (faltando.includes("preco"))
    semPlanilha("Cobertura: falta a coluna de preço (Preço de Venda).");
  const versaoRef = ctx.versaoRef ?? dataDoNomeDoArquivo(ctx.nomeArquivo);
  if (!versaoRef)
    throw new ErroDeLayout(
      "Informe a data de referência da cobertura (não achei no nome do arquivo).",
    );

  const lojas = lojasPorBcps(ctx);
  const erros: ErroLinha[] = [];
  const registros = new Map<string, Estoque>();
  const skus = new Map<string, string>();
  const ignoradas = new Map<string, number>();
  let duplicadas = 0;
  let semCodigo = 0;
  let semEstoque = 0;
  let naoBot = 0;
  const filtrarBot = !!ctx.skusBot && ctx.skusBot.size > 0;

  p.linhas.forEach((l, i) => {
    const n = linhaDoArquivo(p, i);
    const bcps = codigo(celula(l, idx.bcps));
    const sku = codigo(celula(l, idx.sku));
    if (!bcps && !sku) return void semCodigo++;
    if (!bcps || !sku)
      return void erros.push({ linha: n, mensagem: "BCPS e SKU são obrigatórios." });
    const loja = lojas.get(bcps);
    if (!loja || !lojaRelevante(loja)) {
      ignoradas.set(bcps, (ignoradas.get(bcps) ?? 0) + 1);
      return;
    }
    const estoque = numero(celula(l, idx.estoque));
    if (estoque !== null && Number.isFinite(estoque) && estoque <= 0) return void semEstoque++;
    if (filtrarBot && !ctx.skusBot!.has(sku)) {
      // fora do cadastro: entra se a 1ª palavra da descrição for de produto BOT
      const primeira = (texto(celula(l, idx.descricao)) ?? "").split(" ")[0]!.toUpperCase();
      if (!ctx.palavrasBot?.has(primeira)) {
        return void naoBot++;
      }
    }
    const vmd = numero(celula(l, idx.vmd));
    const preco = numero(celula(l, idx.preco));
    const custo = numero(celula(l, idx.custo));
    const ruim = (v: number | null) => v === null || !Number.isFinite(v);
    if (ruim(estoque) || ruim(vmd) || ruim(preco)) {
      return void erros.push({ linha: n, mensagem: "Estoque, VMD e preço precisam ser números." });
    }
    if (vmd! < 0 || preco! < 0)
      return void erros.push({ linha: n, mensagem: "VMD e preço não podem ser negativos." });
    const chave = `${bcps}|${sku}`;
    if (registros.has(chave)) duplicadas++;
    registros.set(chave, {
      bcps,
      sku,
      estoque: estoque!,
      vmd: vmd!,
      preco: preco!,
      custo: custo !== null && Number.isFinite(custo) && custo >= 0 ? custo : null,
      situacao: texto(celula(l, idx.situacao)),
    });
    const descricao = texto(celula(l, idx.descricao));
    if (descricao) skus.set(sku, descricao);
  });

  const lista = [...registros.values()];
  const avisos = [
    "A cobertura substitui a anterior inteira: linhas que não vierem neste arquivo saem do banco.",
  ];
  const precoZero = lista.filter((r) => r.preco === 0).length;
  if (precoZero)
    avisos.push(
      `${fmt(precoZero)} linhas com preço R$ 0,00: ficam gravadas, mas são excluídas do pool na geração dos kits (provisório).`,
    );
  if (ignoradas.size) {
    const total = [...ignoradas.values()].reduce((a, b) => a + b, 0);
    avisos.push(
      `${fmt(total)} linhas de ${fmt(ignoradas.size)} BCPS fora da base de lojas, ou que não são Varejo/Híbrida e não participam, foram ignoradas: ${listaCurta([...ignoradas.keys()])}.`,
    );
  }
  if (duplicadas) avisos.push(`${fmt(duplicadas)} pares loja+SKU repetidos: vale a última linha.`);
  avisoSemCodigo(avisos, semCodigo, "BCPS e SKU");
  if (semEstoque)
    avisos.push(`${fmt(semEstoque)} linhas com estoque 0 (ou negativo) não são enviadas.`);
  if (naoBot) avisos.push(`${fmt(naoBot)} linhas de produtos que não são BOT não são enviadas.`);
  if (!filtrarBot)
    avisos.push(
      "Envie Produtos antes: com o cadastro no banco, só os produtos BOT são enviados (upload mais rápido).",
    );
  if (idx.descricao < 0) {
    avisos.push(
      "Sem coluna de descrição: SKUs que não estão no cadastro de produtos ficarão sem descrição, fornecedor e marca.",
    );
  } else {
    avisos.push(
      "SKUs fora do cadastro (dsku) entram em Produtos com fornecedor e marca pela primeira palavra da descrição (provisório).",
    );
  }

  const skuLista: SkuCobertura[] = [...skus.entries()].map(([sku, descricao]) => ({
    sku,
    descricao,
  }));
  return {
    base: "cobertura",
    layout: idx.descricao >= 0 ? "Cobertura (original)" : "Cobertura (layout tratado)",
    linhasLidas: p.linhas.length,
    partes: [
      ...(skuLista.length ? [{ parte: "skus" as const, linhas: skuLista }] : []),
      { parte: "registros", linhas: lista },
    ],
    erros,
    avisos,
    resumo: [
      { rotulo: "Data de referência", valor: versaoRef },
      { rotulo: "Linhas válidas", valor: fmt(lista.length) },
      { rotulo: "Lojas / HUBs", valor: fmt(new Set(lista.map((r) => r.bcps)).size) },
      { rotulo: "SKUs", valor: fmt(new Set(lista.map((r) => r.sku)).size) },
      { rotulo: "Preço R$ 0,00", valor: fmt(precoZero) },
    ],
    amostra: amostraDe(lista, ["bcps", "sku", "estoque", "vmd", "preco", "custo", "situacao"]),
    versaoRef,
  };
}

// ---------------------------------------------------------------------------
// PROMOÇÃO (arquivo original ou layout tratado)

/** "35.0 | 25.0" → 35 (pendência 17: com mais de um desconto, vale o MAIOR). */
export function maiorDesconto(valor: unknown): number | null {
  if (typeof valor === "number") return valor;
  const partes = String(valor ?? "")
    .split("|")
    .map((v) => numero(v))
    .filter((v): v is number => v !== null && Number.isFinite(v));
  return partes.length ? Math.max(...partes) : null;
}

function analisarPromocao(planilhas: Planilha[], ctx: Contexto): Analise {
  if (!ctx.ciclo) throw new ErroDeLayout("Escolha o ciclo da promoção.");
  const original = planilhas.find((x) => tem(x, "sku", "desconto promocao proximo ciclo"));
  const tratado = original ? undefined : planilhas.find((x) => tem(x, "sku", "desconto pct"));
  const p = original ?? tratado;
  if (!p) {
    semPlanilha(
      "Promoção: arquivo original (Marca, SKU, Descrição, Categoria, Desconto Promoção Próximo Ciclo, " +
        "Promoção Próximo Ciclo) ou layout tratado (sku, desconto_pct, ressarcimento_bso, texto).",
    );
  }
  const { idx } = indices(p, {
    sku: ["sku"],
    desconto: ["desconto pct", "desconto promocao proximo ciclo"],
    bso: ["ressarcimento bso"],
    texto: ["texto", "promocao proximo ciclo"],
  });
  const erros: ErroLinha[] = [];
  const avisos: string[] = [];
  const registros = new Map<string, Promocao>();
  let repetidos = 0;
  let varios = 0;
  let semCodigo = 0;

  p.linhas.forEach((l, i) => {
    const n = linhaDoArquivo(p, i);
    const sku = codigo(celula(l, idx.sku));
    if (!sku) return void semCodigo++;
    const bruto = celula(l, idx.desconto);
    const d = maiorDesconto(bruto);
    if (d === null || d < 0 || d > 100) {
      return void erros.push({ linha: n, mensagem: "Desconto deve ser um número entre 0 e 100." });
    }
    if (typeof bruto === "string" && bruto.includes("|")) varios++;
    const textoPromo = texto(celula(l, idx.texto));
    const reg: Promocao = {
      sku,
      desconto_pct: d,
      ressarcimento_bso:
        booleano(celula(l, idx.bso)) ?? /ressarcimento via bso/i.test(textoPromo ?? ""),
      texto: textoPromo,
    };
    const atual = registros.get(sku);
    if (atual) repetidos++;
    // SKU repetido: fica a linha de maior desconto; BSO se QUALQUER linha do SKU tiver BSO
    const bso = reg.ressarcimento_bso || (atual?.ressarcimento_bso ?? false);
    if (!atual || reg.desconto_pct > atual.desconto_pct)
      registros.set(sku, { ...reg, ressarcimento_bso: bso });
    else atual.ressarcimento_bso = bso;
  });

  const lista = [...registros.values()];
  avisos.push(`Substitui a promoção do ciclo ${ctx.ciclo} (os outros ciclos não mudam).`);
  if (varios) avisos.push(`${fmt(varios)} linhas com mais de um desconto: usei o maior.`);
  if (repetidos)
    avisos.push(`${fmt(repetidos)} linhas de SKU repetido: ficou a de maior desconto.`);
  if (original)
    avisos.push(
      "Ressarcimento BSO: quando o texto de qualquer linha do SKU diz “Ressarcimento via BSO”.",
    );
  avisoSemCodigo(avisos, semCodigo, "SKU");
  const semDesconto = lista.filter((r) => r.desconto_pct === 0).length;
  if (semDesconto) {
    avisos.push(
      `${fmt(semDesconto)} SKUs com desconto 0%: não servem de herói (o herói exige desconto > 0).`,
    );
  }
  return {
    base: "promocao",
    layout: original ? "Promoção (arquivo original)" : "Promoção (layout tratado)",
    linhasLidas: p.linhas.length,
    partes: [{ parte: "registros", linhas: lista }],
    erros,
    avisos,
    resumo: [
      { rotulo: "Ciclo", valor: String(ctx.ciclo) },
      { rotulo: "SKUs", valor: fmt(lista.length) },
      { rotulo: "Com desconto", valor: fmt(lista.length - semDesconto) },
      { rotulo: "Ressarcimento BSO", valor: fmt(lista.filter((r) => r.ressarcimento_bso).length) },
    ],
    amostra: amostraDe(lista, ["sku", "desconto_pct", "ressarcimento_bso"]),
    ciclo: ctx.ciclo,
  };
}

// ---------------------------------------------------------------------------
// FATURAMENTO (Histórico de Vendas diário → soma por loja e mês; ou mensal tratado)

function analisarFaturamento(planilhas: Planilha[], ctx: Contexto): Analise {
  exigirLojas(ctx);
  const diario = planilhas.find(
    (x) => (tem(x, "bpcs") || tem(x, "bcps")) && tem(x, "faturamento", "boletos", "data"),
  );
  const mensal = diario
    ? undefined
    : planilhas.find((x) => tem(x, "bcps", "mes", "faturamento", "boletos"));
  const p = diario ?? mensal;
  if (!p)
    semPlanilha(
      "Faturamento: Histórico de Vendas (Praça, BPCS, Loja, Faturamento, Itens, Boletos, …, Data) ou bcps, mes, faturamento, boletos.",
    );
  const { idx } = indices(p, {
    bcps: ["bpcs", "bcps"],
    faturamento: ["faturamento"],
    boletos: ["boletos"],
    data: ["data", "mes"],
  });
  const lojas = lojasPorBcps(ctx);
  const erros: ErroLinha[] = [];
  const soma = new Map<string, Faturamento>();
  const ignoradas = new Set<string>();
  let semCodigo = 0;

  p.linhas.forEach((l, i) => {
    const n = linhaDoArquivo(p, i);
    const bcps = codigo(celula(l, idx.bcps));
    const m = mes(celula(l, idx.data));
    const f = numero(celula(l, idx.faturamento));
    const b = numero(celula(l, idx.boletos));
    if (!bcps) return void semCodigo++;
    if (!m) return void erros.push({ linha: n, mensagem: "Data/mês inválido." });
    if (f === null || !Number.isFinite(f) || (b !== null && !Number.isFinite(b))) {
      return void erros.push({ linha: n, mensagem: "Faturamento e boletos precisam ser números." });
    }
    if (!lojas.has(bcps)) {
      ignoradas.add(bcps);
      return;
    }
    const chave = `${bcps}|${m}`;
    const atual = soma.get(chave) ?? { bcps, mes: `${m}-01`, faturamento: 0, boletos: 0 };
    atual.faturamento += f;
    atual.boletos += Math.round(b ?? 0);
    soma.set(chave, atual);
  });

  const lista = [...soma.values()].map((r) => ({
    ...r,
    faturamento: Math.round(r.faturamento * 100) / 100,
  }));
  const mesesLista = [...new Set(lista.map((r) => r.mes.slice(0, 7)))].sort();
  const avisos = ["Substitui todo o faturamento mensal gravado."];
  if (diario) avisos.push("Arquivo diário: faturamento e boletos somados por loja e mês.");
  avisoSemCodigo(avisos, semCodigo, "BCPS");
  if (ignoradas.size)
    avisos.push(
      `${fmt(ignoradas.size)} BCPS que não são lojas cadastradas (HUB, ER ou fora da base de lojas) foram ignorados: ${listaCurta([...ignoradas])}.`,
    );

  return {
    base: "faturamento",
    layout: diario ? "Histórico de Vendas (diário)" : "Faturamento mensal (layout tratado)",
    linhasLidas: p.linhas.length,
    partes: [{ parte: "registros", linhas: lista }],
    erros,
    avisos,
    resumo: [
      { rotulo: "Lojas", valor: fmt(new Set(lista.map((r) => r.bcps)).size) },
      {
        rotulo: "Meses",
        valor: mesesLista.length ? `${mesesLista[0]} a ${mesesLista[mesesLista.length - 1]}` : "—",
      },
      {
        rotulo: "Faturamento total",
        valor: lista
          .reduce((s, r) => s + r.faturamento, 0)
          .toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      },
    ],
    amostra: amostraDe(lista, ["bcps", "mes", "faturamento", "boletos"]),
  };
}

// ---------------------------------------------------------------------------

/** Cabeçalho esperado (para as mensagens de erro). CSV com vírgula ou ponto e vírgula. */
export const CABECALHO_ESPERADO: Record<BaseId, string> = {
  lojas: "bcps,divisao,loja,praca,tipo,canal_geral,canais,vendedoras (lojas.csv) ou a dCentros",
  gerentes:
    "MÊS/ANO, BCPS, DIVISÃO, Canal Geral, Canal, Nome/Matrícula GVO, GCVO/GPVO e GRVO (dGerentes)",
  vendedoras:
    "bcps,vendedoras — ou uma coluna divisao (código da filial) com uma linha por vendedora",
  produtos:
    "dsku (codigo, descricao, …, fornecedor) ou sku,descricao,marca,categoria,subcategoria,fornecedor,nicho,regular",
  cobertura:
    "SKU;Descrição;BCPS;Loja;Praça;Estado;Estoque;Custo;Preço de Venda;VMD;Cob. Dias;Cob. Meses;Situação",
  promocao:
    "Marca, SKU, Descrição, Categoria, Desconto Promoção Próximo Ciclo, Promoção Próximo Ciclo — ou sku,desconto_pct,ressarcimento_bso,texto",
  faturamento:
    "Praça, BPCS, Loja, Faturamento, Itens, Boletos, …, Data — ou bcps,mes,faturamento,boletos",
};

const ANALISADORES: Record<BaseId, (p: Planilha[], ctx: Contexto) => Analise> = {
  lojas: analisarLojas,
  gerentes: analisarGerentes,
  vendedoras: analisarVendedoras,
  produtos: analisarProdutos,
  cobertura: analisarCobertura,
  promocao: analisarPromocao,
  faturamento: analisarFaturamento,
};

export function analisar(base: BaseId, planilhas: Planilha[], ctx: Contexto): Analise {
  if (planilhas.length === 0) {
    throw new ErroDeLayout(
      `O arquivo está vazio ou sem cabeçalho. Cabeçalho esperado: ${CABECALHO_ESPERADO[base]}.`,
    );
  }
  return ANALISADORES[base](planilhas, ctx);
}

export type { Estoque, Produto };
