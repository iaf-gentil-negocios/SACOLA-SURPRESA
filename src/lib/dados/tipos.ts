// Interface única de dados das telas do admin (etapa 5). Duas implementações:
// - nuvem: Supabase + funções de servidor (vale depois da etapa 5.2);
// - local: pasta seed/ + armazenamento do navegador (modo de teste local).
import type {
  EstoqueMotor,
  LojaMotor,
  ProdutoMotor,
  PromoMotor,
  ResultadoSimulacao,
} from "@/lib/motor/gerar";
import type { CicloMotor, FaturamentoMes } from "@/lib/motor/metas";
import type { DisponibilidadeLoja, KitsDaBase, pedidoRegerar } from "@/lib/motor/kits-da-base";
import type { Parametros } from "@/lib/motor/parametros";
import type { Vinculo } from "@/lib/acessos/hierarquia";
import type { ResumoEstoqueLoja } from "@/lib/painel/estoque";
import type { VendaDia } from "@/lib/vendas/leitor";
import type { RuidoLoja } from "@/lib/vendas/ruido";

export interface SimulacaoSalva {
  id: number;
  nome: string;
  ciclo: number;
  semente: number;
  pracas: string[] | null;
  resumo: ResultadoSimulacao["resumo"] | null;
  criadoEm: string;
}

export interface BaseDefinida {
  id: number;
  ciclo: number;
  nome: string;
  inicio: string;
  fim: string;
  simulacaoId: number | null;
  definidaEm: string;
}

export interface DadosDoMotor {
  estoque: EstoqueMotor[];
  produtos: ProdutoMotor[];
  promocoes: PromoMotor[];
}

export type AoProgredir = (mensagem: string) => void;

/** Um envio do relatório de vendas (F2b): o período do arquivo substitui o que havia nesses dias. */
export interface EnvioVendas {
  inicio: string;
  fim: string;
  arquivo: string | null;
  linhas: number;
  gmv: number;
  enviadoEm: string;
}

/** Declaração de vendas do GVO (F2b). */
export interface Declaracao {
  id: number;
  userId: string;
  bcps: string;
  ciclo: number;
  tipo: "dia" | "semana";
  inicio: string;
  fim: string;
  sacolas: number;
  /** Preço médio dos kits da praça (calculado pelo banco na hora da declaração). */
  precoMedio: number;
  status: "pendente" | "aprovada" | "recusada";
  motivo: string | null;
  criadoEm: string;
  decididoEm: string | null;
}

/**
 * Meta e números planejados de cada loja numa base, já somados por loja (função
 * resumo_lojas_da_base, 0002f): dashboard do admin e Painel do gerente. Nada de kits ou itens.
 */
export interface LojaDaBase {
  bcps: string;
  meta: number;
  vendedoras: number;
  metaSemana: number;
  sacolasMeta: number;
  sacolasPlanejadas: number;
  receita: number;
  /** null para o gerente (o banco não entrega custo a ele). */
  custo: number | null;
  /** "Pode montar hoje" da loja (null = disponibilidade ainda não gravada). */
  capacidade: number | null;
  disponivelRef: string | null;
}

/** Hierarquia e perfis, para os avisos de acesso do dashboard (null = indisponível no modo local). */
export interface HierarquiaEPerfis {
  vinculos: Vinculo[];
  nomes: Map<string, string>;
  perfis: {
    nome: string;
    usuario: string;
    perfil: string;
    ativo: boolean;
    matricula: string | null;
    ve_todas?: boolean | null;
  }[];
}

export interface Repositorio {
  modo: "local" | "nuvem";
  /** Texto curto para a tela (ex.: de onde vêm os dados). */
  origem: string;
  ciclos(): Promise<CicloMotor[]>;
  parametros(): Promise<Parametros>;
  salvarParametros(alteracoes: Partial<Parametros>): Promise<void>;
  lojas(): Promise<LojaMotor[]>;
  faturamento(): Promise<FaturamentoMes[]>;
  /**
   * F1b: guarda na memória o estoque da Cobertura recém-enviada (o arquivo já lido no navegador),
   * para a análise de divergências e a próxima simulação não baixarem a Cobertura de novo.
   */
  usarEstoqueDaCobertura(linhas: EstoqueMotor[]): Promise<void>;
  /** Estoque (só lojas das praças pedidas), produtos e promoção do ciclo. */
  dadosDoMotor(
    ciclo: number,
    pracas: string[] | null,
    aoProgredir?: AoProgredir,
  ): Promise<DadosDoMotor>;
  salvarSimulacao(r: ResultadoSimulacao, nome: string, aoProgredir?: AoProgredir): Promise<number>;
  listarSimulacoes(ciclo: number): Promise<SimulacaoSalva[]>;
  /** Apaga uma simulação salva (e seus kits). Recusa se ela virou base de algum período. */
  excluirSimulacao(id: number): Promise<void>;
  abrirSimulacao(id: number, aoProgredir?: AoProgredir): Promise<ResultadoSimulacao>;
  definirBase(simulacaoId: number, nome: string, inicio: string, fim: string): Promise<number>;
  listarBases(ciclo: number): Promise<BaseDefinida[]>;
  // F1b
  /** Data de referência da Cobertura em uso (AAAA-MM-DD). */
  coberturaAtual(): Promise<string | null>;
  /** Kits de uma base, com estoque da geração, disponibilidade e fotos do estoque (admin). */
  kitsDaBase(planoId: number, ciclo: number, opcoes?: { leve?: boolean }): Promise<KitsDaBase>;
  gravarDisponibilidade(planoId: number, ref: string, lojas: DisponibilidadeLoja[]): Promise<void>;
  /** Troca os kits de uma loja na base (`atualizada` = a base já com a troca, para o modo local). */
  regerarKitsLoja(
    planoId: number,
    bcps: string,
    pedido: ReturnType<typeof pedidoRegerar>,
    atualizada: KitsDaBase,
  ): Promise<void>;
  // F2a (dashboards)
  /** Meta, sacolas, receita, custo (só admin) e pode montar de cada loja da base. */
  lojasDaBase(planoId: number): Promise<LojaDaBase[]>;
  /** Resumo de estoque por loja (gravado a cada Cobertura). */
  resumoEstoque(): Promise<ResumoEstoqueLoja[]>;
  gravarResumoEstoque(linhas: ResumoEstoqueLoja[]): Promise<void>;
  hierarquiaEPerfis(): Promise<HierarquiaEPerfis | null>;
  // F2b (vendas do canal App Delivery)
  salvarInicioCampanha(ciclo: number, data: string | null): Promise<void>;
  vendasEnvios(): Promise<EnvioVendas[]>;
  vendasDiarias(inicio: string, fim: string): Promise<VendaDia[]>;
  gravarVendas(inicio: string, fim: string, arquivo: string, linhas: VendaDia[]): Promise<number>;
  ruidos(ciclo: number): Promise<RuidoLoja[]>;
  gravarRuido(ciclo: number, inicioCampanha: string, linhas: RuidoLoja[]): Promise<void>;
  declaracoes(ciclo: number): Promise<Declaracao[]>;
  decidirDeclaracao(id: number, aprovar: boolean, motivo: string | null): Promise<void>;
  /** Correção manual da cidade/UF de uma loja (lojas fora do mapa). */
  salvarLocalizacao(bcps: string, cidade: string, uf: string): Promise<void>;
}
