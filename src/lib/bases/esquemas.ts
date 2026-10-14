// Formato das linhas enviadas ao servidor, por base. Usado no navegador (montagem)
// e no servidor (validação de novo antes de gravar).
import { z } from "zod";

export const BASES = [
  "lojas",
  "gerentes",
  "vendedoras",
  "produtos",
  "cobertura",
  "promocao",
  "faturamento",
] as const;
export type BaseId = (typeof BASES)[number];

export const PARTES = ["registros", "skus", "lojas"] as const;
export type Parte = (typeof PARTES)[number];

/** Linhas por chamada ao servidor. */
export const TAMANHO_LOTE = 5000;

const cod = z.string().trim().min(1).max(40);
/** Texto longo demais é cortado (termina em "…"), em vez de recusar a linha. */
export const cortar = (max: number) => (s: string) =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s;
const txt = (max: number) => z.string().transform(cortar(max)).nullable();
const obrig = (max: number) => z.string().min(1).transform(cortar(max));

export const lojaSchema = z.object({
  bcps: cod,
  // a dCentros não traz a divisão: ausente = mantém a que está no banco
  divisao: txt(40).optional(),
  nome: obrig(200),
  praca: z.string().min(1).max(100),
  tipo: z.enum(["loja", "hub", "er", "outro"]),
  canal_geral: txt(60),
  canais: z.array(z.string().max(60)).max(5),
  vendedoras: z.number().int().min(0).max(10_000).optional(),
  // só a dCentros traz (ausente = mantém o que está no banco). "participa" nunca vem do arquivo.
  tipo_dcentros: txt(60).optional(),
  sap: txt(40).optional(),
  centro_custo: txt(60).optional(),
  marca: txt(120).optional(),
  // 0002f: UF (coluna da dCentros) e cidade (tirada do Endereço), para o mapa da F2b
  cidade: txt(100).optional(),
  // 0002i: "Nome" completo da dCentros (a tela mostra o abreviado; a busca usa os dois)
  nome_completo: txt(200).optional(),
  uf: txt(2).optional(),
});

export const vinculoSchema = z.object({
  bcps: cod,
  nivel: z.enum(["grvo", "gcvo_gpvo", "gvo"]),
  matricula: cod,
  nome: obrig(200),
});

export const infoLojaSchema = z.object({
  bcps: cod,
  divisao: txt(40),
  canal_geral: txt(60),
  canais: z.array(z.string().max(60)).max(5),
});

export const vendedorasSchema = z.object({
  bcps: cod,
  vendedoras: z.number().int().min(0).max(10_000),
});

export const produtoSchema = z.object({
  sku: cod,
  descricao: obrig(300),
  marca: txt(120),
  categoria: txt(120),
  subcategoria: txt(120),
  fornecedor: txt(60),
  preco_dsku: z.number().min(0).nullable(),
  regular: z.boolean(),
  origem_regular: z.enum(["base", "descricao"]),
  origem_fornecedor: z.enum(["dsku", "primeira_palavra", "nao_encontrado"]),
  origem_cadastro: z.enum(["dsku", "cobertura"]),
  nicho: z.enum(["F", "M", "I", "U"]),
  origem_nicho: z.enum(["base", "subcategoria", "marca", "descricao", "padrao_u"]),
});

export const skuCoberturaSchema = z.object({
  sku: cod,
  descricao: obrig(300),
});

export const estoqueSchema = z.object({
  bcps: cod,
  sku: cod,
  estoque: z.number().finite(),
  vmd: z.number().finite().min(0),
  preco: z.number().finite().min(0),
  custo: z.number().finite().min(0).nullable(),
  situacao: txt(60),
});

export const promocaoSchema = z.object({
  sku: cod,
  desconto_pct: z.number().min(0).max(100),
  ressarcimento_bso: z.boolean(),
  texto: txt(2000),
});

export const faturamentoSchema = z.object({
  bcps: cod,
  mes: z.string().regex(/^\d{4}-\d{2}-01$/),
  faturamento: z.number().finite(),
  boletos: z.number().int(),
});

/** Esquema de cada (base, parte) aceita pelo servidor. */
export const ESQUEMAS: Partial<Record<`${BaseId}:${Parte}`, z.ZodTypeAny>> = {
  "lojas:registros": lojaSchema,
  "gerentes:registros": vinculoSchema,
  "gerentes:lojas": infoLojaSchema,
  "vendedoras:registros": vendedorasSchema,
  "produtos:registros": produtoSchema,
  "cobertura:registros": estoqueSchema,
  "cobertura:skus": skuCoberturaSchema,
  "promocao:registros": promocaoSchema,
  "faturamento:registros": faturamentoSchema,
};

export type Loja = z.infer<typeof lojaSchema>;
export type Vinculo = z.infer<typeof vinculoSchema>;
export type InfoLoja = z.infer<typeof infoLojaSchema>;
export type Vendedoras = z.infer<typeof vendedorasSchema>;
export type Produto = z.infer<typeof produtoSchema>;
export type SkuCobertura = z.infer<typeof skuCoberturaSchema>;
export type Estoque = z.infer<typeof estoqueSchema>;
export type Promocao = z.infer<typeof promocaoSchema>;
export type Faturamento = z.infer<typeof faturamentoSchema>;
