// Lê os arquivos da pasta seed/ com a MESMA análise do upload (etapa 3) e devolve os dados do motor.
// Usado no modo de teste local e nos testes automáticos.
import { analisar, type LojaContexto } from "@/lib/bases/analise";
import type { Estoque, Faturamento, Loja, Produto, Promocao } from "@/lib/bases/esquemas";
import { lerArquivo } from "@/lib/bases/leitor";
import { dataDoNomeDoArquivo } from "@/lib/bases/valores";
import type { EstoqueMotor, LojaMotor, ProdutoMotor } from "@/lib/motor/gerar";
import type { CicloMotor, FaturamentoMes } from "@/lib/motor/metas";

/** Os mesmos ciclos do SQL da etapa 1. */
export const CICLOS_PADRAO: CicloMotor[] = [
  { id: 15, nome: "Ciclo 15", inicio: "2026-10-16", fim: "2026-11-01" },
  { id: 16, nome: "Ciclo 16", inicio: "2026-11-02", fim: "2026-11-29" },
  { id: 17, nome: "Ciclo 17", inicio: "2026-11-30", fim: "2026-12-25" },
];

export interface LojaLocal extends LojaMotor {
  divisao: string | null;
  canal_geral: string | null;
  canais: string[];
}

export interface PromoLocal {
  ciclo: number;
  sku: string;
  desconto_pct: number;
  ressarcimento_bso: boolean;
}

export interface DadosSeed {
  lojas: LojaLocal[];
  produtos: ProdutoMotor[];
  estoque: EstoqueMotor[];
  promocoes: PromoLocal[];
  faturamento: FaturamentoMes[];
  versaoCobertura: string | null;
  arquivos: { nome: string; base: string; linhas: number }[];
}

type Tipo = "lojas" | "produtos" | "cobertura" | "promocao" | "faturamento";

function tipoDoArquivo(nome: string): { tipo: Tipo; ciclo?: number } | null {
  const n = nome.toLowerCase();
  if (n.startsWith("lojas")) return { tipo: "lojas" };
  if (n.startsWith("produtos") || n.startsWith("dsku")) return { tipo: "produtos" };
  if (n.includes("cobertura")) return { tipo: "cobertura" };
  const promo = /promo\D*(\d{2})/.exec(n);
  if (promo) return { tipo: "promocao", ciclo: Number(promo[1]) };
  if (n.startsWith("faturamento") || n.includes("historico")) return { tipo: "faturamento" };
  return null;
}

export async function dadosDaSeed(arquivos: File[]): Promise<DadosSeed> {
  const porTipo = (t: Tipo) => arquivos.filter((f) => tipoDoArquivo(f.name)?.tipo === t);
  const registros = async (
    base: Parameters<typeof analisar>[0],
    f: File,
    extra: Record<string, unknown>,
  ) => {
    const a = analisar(base, await lerArquivo(f), {
      nomeArquivo: f.name,
      lojas: [],
      versaoRef: null,
      ciclo: null,
      mes: null,
      ...extra,
    });
    return a;
  };
  const lidos: DadosSeed["arquivos"] = [];

  // 1) lojas (as outras bases dependem delas)
  const fLojas = porTipo("lojas")[0];
  if (!fLojas) throw new Error("Falta o lojas.csv na pasta seed/.");
  const aLojas = await registros("lojas", fLojas, {});
  const lojas: LojaLocal[] = (aLojas.partes[0]!.linhas as Loja[]).map((l) => ({
    bcps: l.bcps,
    nome: l.nome,
    praca: l.praca,
    tipo: l.tipo,
    ativo: true,
    // modo local: a seed não guarda a escolha; participa = loja (Varejo/Híbrida), menos QDB
    participa: l.tipo === "loja" && !/^QDB\b/i.test(l.nome),
    vendedoras: l.vendedoras ?? 0,
    divisao: l.divisao ?? null,
    canal_geral: l.canal_geral,
    canais: l.canais,
  }));
  lidos.push({ nome: fLojas.name, base: "lojas", linhas: lojas.length });
  const ctxLojas: LojaContexto[] = lojas.map((l) => ({
    bcps: l.bcps,
    tipo: l.tipo,
    divisao: l.divisao ?? null,
  }));

  // 2) produtos
  const produtos = new Map<string, ProdutoMotor>();
  for (const f of porTipo("produtos")) {
    const a = await registros("produtos", f, {});
    for (const p of a.partes[0]!.linhas as Produto[]) {
      produtos.set(p.sku, {
        sku: p.sku,
        descricao: p.descricao,
        marca: p.marca,
        categoria: p.categoria,
        nicho: p.nicho,
        regular: p.regular,
        fornecedor: p.fornecedor,
      });
    }
    lidos.push({ nome: f.name, base: "produtos", linhas: a.partes[0]!.linhas.length });
  }

  // 3) cobertura (a mais recente pelo nome do arquivo)
  const fCob = porTipo("cobertura").sort((a, b) => b.name.localeCompare(a.name))[0];
  let estoque: EstoqueMotor[] = [];
  if (fCob) {
    const a = await registros("cobertura", fCob, { lojas: ctxLojas });
    estoque = (a.partes.find((x) => x.parte === "registros")!.linhas as Estoque[]).map((x) => ({
      bcps: x.bcps,
      sku: x.sku,
      estoque: x.estoque,
      vmd: x.vmd,
      preco: x.preco,
      custo: x.custo,
    }));
    lidos.push({ nome: fCob.name, base: "cobertura", linhas: estoque.length });
  }

  // 4) promoções por ciclo
  const promocoes: PromoLocal[] = [];
  for (const f of porTipo("promocao")) {
    const ciclo = tipoDoArquivo(f.name)!.ciclo!;
    const a = await registros("promocao", f, { ciclo });
    for (const x of a.partes[0]!.linhas as Promocao[]) {
      promocoes.push({
        ciclo,
        sku: x.sku,
        desconto_pct: x.desconto_pct,
        ressarcimento_bso: x.ressarcimento_bso,
      });
    }
    lidos.push({ nome: f.name, base: `promocao C${ciclo}`, linhas: a.partes[0]!.linhas.length });
  }

  // 5) faturamento
  const faturamento: FaturamentoMes[] = [];
  for (const f of porTipo("faturamento")) {
    const a = await registros("faturamento", f, { lojas: ctxLojas });
    for (const x of a.partes[0]!.linhas as Faturamento[]) {
      faturamento.push({ bcps: x.bcps, mes: x.mes, faturamento: x.faturamento });
    }
    lidos.push({ nome: f.name, base: "faturamento", linhas: a.partes[0]!.linhas.length });
  }

  return {
    lojas,
    produtos: [...produtos.values()],
    estoque,
    promocoes,
    faturamento,
    versaoCobertura: fCob ? dataDoNomeDoArquivo(fCob.name) : null,
    arquivos: lidos,
  };
}
