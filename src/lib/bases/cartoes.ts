// Cards da tela Bases (parte D): nome, frase curta (card fechado) e detalhe (card aberto).
import type { BaseId } from "./esquemas";

export interface Cartao {
  base: BaseId;
  titulo: string;
  /** Uma frase do conteúdo, mostrada no card fechado. */
  frase: string;
  /** Detalhe, mostrado ao abrir o card. */
  texto: string;
  arquivos: string;
  dependeDeLojas?: boolean;
  /** Base grande demais para colar do Excel: a tela recomenda o arquivo. */
  grande?: boolean;
}

// Na ordem recomendada de envio.
export const CARTOES: Cartao[] = [
  {
    base: "lojas",
    titulo: "Lojas (dCentros)",
    frase: "cadastro de lojas e centros",
    texto:
      "Todas as lojas da dCentros, de todos os tipos. Quem participa (recebe kits e meta) se escolhe na tela Lojas.",
    arquivos: "dCentros (.xlsx) ou lojas.csv",
  },
  {
    base: "gerentes",
    titulo: "Gerentes (dGerentes)",
    frase: "relação de gerentes por loja",
    texto:
      "dGerentes, só o mês escolhido (padrão: o mais recente completo). Define a hierarquia de cada loja (GVO, GCVO/GPVO, GRVO), que é o acesso dos gerentes.",
    arquivos: "dGerentes_por_Lojas.xlsx (ou lojas.csv)",
    dependeDeLojas: true,
  },
  {
    base: "vendedoras",
    titulo: "Vendedoras",
    frase: "quantidade de vendedoras por loja",
    texto:
      "Quantidade por loja (bcps, vendedoras) ou uma linha por vendedora com o código da filial.",
    arquivos: ".csv ou .xlsx",
    dependeDeLojas: true,
  },
  {
    base: "produtos",
    titulo: "Produtos (dsku)",
    frase: "cadastro de produtos",
    texto: "Cadastro com marca, categoria, subcategoria e fornecedor. Cumulativo.",
    arquivos: "dsku.xlsx (ou produtos.csv)",
  },
  {
    base: "cobertura",
    titulo: "Cobertura",
    frase: "estoque, custo, preço e VMD por loja",
    texto: "Estoque, custo, preço e VMD por loja/HUB. Substitui a anterior inteira.",
    arquivos: "cobertura_AAAA-MM-DD.csv",
    dependeDeLojas: true,
    grande: true,
  },
  {
    base: "promocao",
    titulo: "Promoção do ciclo",
    frase: "descontos da promoção do ciclo",
    texto: "Desconto e ressarcimento BSO por SKU, uma base por ciclo.",
    arquivos: "PROMO (.xlsx) ou promo_cicloNN.csv",
  },
  {
    base: "faturamento",
    titulo: "Histórico de vendas",
    frase: "faturamento por loja e mês",
    texto: "Faturamento e boletos por loja. O arquivo diário é somado por mês.",
    arquivos: "Historico de Vendas.xlsx (ou faturamento_mensal.csv)",
    dependeDeLojas: true,
  },
];

export const TITULO_BASE = Object.fromEntries(CARTOES.map((c) => [c.base, c.titulo])) as Record<
  BaseId,
  string
>;
