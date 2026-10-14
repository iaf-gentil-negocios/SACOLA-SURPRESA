import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownUp, ClipboardPaste, Trash2, TriangleAlert, Upload, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ColarDialog } from "@/components/bases/ColarDialog";
import { VendasCanal } from "@/components/bases/VendasCanal";
import { DivergenciasDialog, type AlvoDivergencias } from "@/components/kits/DivergenciasDialog";
import { PreviaEnvio } from "@/components/bases/PreviaEnvio";
import { PreviaGravada } from "@/components/bases/PreviaGravada";
import { CabecalhoPagina } from "@/components/layout/CabecalhoPagina";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { soAdmin } from "@/lib/auth/leitura";
import type { Analise, LojaContexto } from "@/lib/bases/analise";
import { excluirBase } from "@/lib/bases/bases.functions";
import { disponibilidadeAposCobertura } from "@/lib/bases/disponibilidade";
import { analiseAposCobertura } from "@/lib/bases/divergencias-apos-cobertura";
import { resumoAposCobertura } from "@/lib/bases/resumo-estoque";
import { CARTOES, type Cartao } from "@/lib/bases/cartoes";
import type { BaseId, Estoque } from "@/lib/bases/esquemas";
import { envioVencido, ultimoEnvio, type Classe } from "@/lib/bases/situacao";
import {
  CHAVE_CLASSIF,
  CHAVE_ENVIOS,
  CHAVE_ENVIOS_RESUMO,
  salvarClasse,
  useClassificacao,
  useEnviosBases,
} from "@/lib/bases/useSituacao";
import { useCicloSelecionado, useCiclos } from "@/lib/ciclo";
import { CHAVES, repositorio } from "@/lib/dados";
import { CHAVE_LOJAS_COMPLETAS, lerLojasCompletas } from "@/lib/lojas/lojas";

export const Route = createFileRoute("/admin/bases")({
  beforeLoad: soAdmin,
  component: Bases,
});

type Envio = Tables<"bases_envios">;

const CICLOS_PROMO = [15, 16, 17];

const DESTAQUES: Record<string, string> = {
  preco_zero: "preço R$ 0,00",
  skus_sem_cadastro: "SKUs sem cadastro",
  inferidos_primeira_palavra: "fornecedor pela 1ª palavra",
  sem_par_no_dsku: "sem par no dsku",
  removidas: "removidas",
  mes: "mês",
};

function dataHora(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "—";
}

function dataCurta(iso: string | null) {
  return iso ? iso.split("-").reverse().join("/") : null;
}

const excluida = (e: Envio | undefined) =>
  !!(e?.detalhes as Record<string, unknown> | null)?.["excluida_em"];

function Bases() {
  const queryClient = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const [escolhendo, setEscolhendo] = useState<Cartao | null>(null);
  const [colando, setColando] = useState<Cartao | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [excluindo, setExcluindo] = useState<{ cartao: Cartao; ciclo: number | null } | null>(null);
  const [aberto, setAberto] = useState<BaseId | null>(null);
  const [trocando, setTrocando] = useState(false);
  const [divergencias, setDivergencias] = useState<AlvoDivergencias | null>(null);
  const { data: ciclos } = useCiclos();
  const [cicloMenu] = useCicloSelecionado(ciclos);
  const [cicloPromo, setCicloPromo] = useState<number | null>(null);
  const cicloAtivo = cicloPromo ?? cicloMenu ?? 15;

  // SKUs BOT do cadastro: a cobertura só envia produtos BOT (upload mais rápido)
  const { data: bot } = useQuery({
    queryKey: ["bases-skus-bot"],
    enabled: escolhendo?.base === "cobertura",
    queryFn: async () => {
      const skus = new Set<string>();
      const palavras = new Set<string>();
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase
          .from("produtos")
          .select("sku, descricao")
          .eq("fornecedor", "BOT")
          .order("sku")
          .range(de, de + 999);
        if (error) throw error;
        for (const p of data) {
          skus.add(p.sku);
          palavras.add((p.descricao.split(" ")[0] ?? "").toUpperCase());
        }
        if (data.length < 1000) return { skus, palavras };
      }
    },
  });
  const extras = useMemo(
    () => (bot ? { skusBot: bot.skus, palavrasBot: bot.palavras } : undefined),
    [bot],
  );

  // a mesma leitura (e o mesmo cache) da tela Lojas; aqui valem só as ativas
  const { data: todasLojas } = useQuery({
    queryKey: CHAVE_LOJAS_COMPLETAS,
    queryFn: lerLojasCompletas,
  });
  const lojas = useMemo(
    () =>
      todasLojas
        ?.filter((l) => l.ativo)
        .map((l): LojaContexto => ({
          bcps: l.bcps,
          tipo: l.tipo,
          divisao: l.divisao,
          sap: l.sap,
          participa: l.participa,
        })),
    [todasLojas],
  );

  const { data: envios } = useEnviosBases();
  const { data: classificacao } = useClassificacao();

  const { data: nomes } = useQuery({
    queryKey: ["bases-nomes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("perfis").select("user_id, nome");
      if (error) throw error;
      return new Map(data.map((p) => [p.user_id, p.nome]));
    },
  });

  const recarregar = () => {
    void queryClient.invalidateQueries({ queryKey: CHAVE_ENVIOS });
    void queryClient.invalidateQueries({ queryKey: CHAVE_ENVIOS_RESUMO });
    void queryClient.invalidateQueries({ queryKey: ["bases-previa-gravada"] });
    void queryClient.invalidateQueries({ queryKey: ["lojas-todas"] });
    void queryClient.invalidateQueries({ queryKey: CHAVE_LOJAS_COMPLETAS });
    void queryClient.invalidateQueries({ queryKey: CHAVES.hierarquia });
    void queryClient.invalidateQueries({ queryKey: ["usuarios"] });
    void queryClient.invalidateQueries({ queryKey: ["lote-hierarquia"] });
  };

  // F1b: com a Cobertura nova, "pode montar N" e a capacidade de cada loja nas bases em andamento
  const atualizarDisponibilidade = async (a: Analise) => {
    const id = toast.loading("Atualizando a disponibilidade dos kits nas bases…");
    // ajuste da F1b: o estoque do arquivo fica na memória (análise e próxima simulação não relêem)
    const linhas = (a.partes.find((p) => p.parte === "registros")?.linhas ?? []) as Estoque[];
    await repositorio.usarEstoqueDaCobertura(linhas).catch(() => undefined);
    try {
      const r = await disponibilidadeAposCobertura(
        a,
        (ciclos ?? []).map((c) => c.id),
      );
      toast.success(
        r.bases
          ? `Disponibilidade dos kits atualizada: ${r.lojas} loja(s) em ${r.bases} base(s).`
          : "Nenhuma base em andamento para atualizar a disponibilidade.",
        { id },
      );
    } catch (e) {
      toast.error(`Não foi possível atualizar a disponibilidade: ${(e as Error).message}`, { id });
    }
    // F2a: resumo de estoque por loja para o dashboard
    try {
      await resumoAposCobertura(a, ciclos ?? []);
      void queryClient.invalidateQueries({ queryKey: ["painel"] });
    } catch (e) {
      toast.error(`Não foi possível gravar o resumo de estoque: ${(e as Error).message}`);
    }
    // ajuste da F1b: divergências da base atual com a Cobertura que acabou de entrar
    if (!ciclos) return;
    const aviso = toast.loading("Analisando divergências de estoque…");
    try {
      const r = await analiseAposCobertura(queryClient, ciclos, cicloMenu ?? null);
      if (!r) return void toast.dismiss(aviso);
      if (r.divergentes + r.atencao > 0) {
        toast.dismiss(aviso);
        setDivergencias(r.alvo);
      } else {
        toast.success(`Nenhuma divergência de estoque em ${r.lojas} loja(s).`, {
          id: aviso,
          duration: 20_000,
          action: { label: "Ver análise", onClick: () => setDivergencias(r.alvo) },
        });
      }
    } catch (e) {
      toast.error(`Não foi possível analisar as divergências: ${(e as Error).message}`, {
        id: aviso,
      });
    }
  };

  const enviarArquivo = (c: Cartao) => {
    setEscolhendo(c);
    if (entrada.current) {
      entrada.current.value = "";
      entrada.current.click();
    }
  };
  const colar = (c: Cartao) => {
    setEscolhendo(c);
    setColando(c);
  };

  const trocarClasse = async (base: BaseId, classe: Classe) => {
    if (!classificacao) return;
    setTrocando(true);
    try {
      await salvarClasse(classificacao, base, classe);
      await queryClient.invalidateQueries({ queryKey: CHAVE_CLASSIF });
    } catch (e) {
      toast.error(`Não consegui salvar: ${(e as Error).message}`);
    } finally {
      setTrocando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!excluindo) return;
    const { cartao, ciclo } = excluindo;
    setExcluindo(null);
    const r = await excluirBase({ data: { base: cartao.base, ciclo } });
    if (!r.ok) {
      toast.error(r.erro);
      return;
    }
    toast.success(
      cartao.base === "lojas" ? "Lojas inativadas." : "Base excluída. Já dá para subir outra.",
    );
    recarregar();
  };

  const agora = Date.now();
  const situacao = (c: Cartao) => {
    const envio = ultimoEnvio(envios ?? [], c.base, cicloAtivo);
    const variavel = classificacao?.[c.base] === "variavel";
    return {
      envio,
      desatualizada: !!envios && variavel && envioVencido(envio, agora),
      andamento: envios?.some((e) => e.base === c.base && e.status === "em_andamento"),
    };
  };

  const secao = (classe: Classe, titulo: string, descricao: string) => {
    const cartoes = CARTOES.filter((c) => (classificacao?.[c.base] ?? "fixa") === classe);
    const detalhe = cartoes.find((c) => c.base === aberto);
    return (
      <section className="space-y-3">
        <div>
          <h2 className="font-extrabold text-ink">{titulo}</h2>
          <p className="text-sm text-muted-foreground">{descricao}</p>
        </div>
        {!cartoes.length && (
          <p className="rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            Nenhuma base aqui. Use o botão do card para mudar uma base de lista.
          </p>
        )}
        <div className="flex gap-3 overflow-x-auto pb-1">
          {cartoes.map((c) => {
            const s = situacao(c);
            const ativo = aberto === c.base;
            return (
              <div
                key={c.base}
                className={`flex w-52 flex-none flex-col gap-2 rounded-xl border bg-card p-3 ${
                  ativo ? "ring-2 ring-primary" : ""
                }`}
              >
                <button
                  type="button"
                  className="text-left"
                  aria-expanded={ativo}
                  onClick={() => setAberto(ativo ? null : c.base)}
                >
                  <div className="font-bold leading-tight text-ink">{c.titulo}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{c.frase}</div>
                </button>
                <div className="flex flex-wrap gap-1">
                  {s.desatualizada && (
                    <Badge className="bg-warn-soft text-warn hover:bg-warn-soft">
                      <TriangleAlert className="mr-1 size-3" /> Desatualizada
                    </Badge>
                  )}
                  {s.andamento && (
                    <Badge className="bg-warn-soft text-warn hover:bg-warn-soft">Enviando</Badge>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-auto h-7 justify-start px-1 text-xs"
                  disabled={trocando || !classificacao}
                  onClick={() => void trocarClasse(c.base, classe === "fixa" ? "variavel" : "fixa")}
                  title="Mudar de lista"
                >
                  <ArrowDownUp className="size-3" />
                  {classe === "fixa" ? "Fixa · tornar variável" : "Variável · tornar fixa"}
                </Button>
              </div>
            );
          })}
        </div>
        {detalhe && (
          <Detalhe
            cartao={detalhe}
            envio={situacao(detalhe).envio}
            desatualizada={situacao(detalhe).desatualizada}
            envios={envios ?? []}
            nomes={nomes}
            semLojas={!!detalhe.dependeDeLojas && !lojas?.length}
            ciclo={cicloAtivo}
            aoEscolherCiclo={setCicloPromo}
            aoFechar={() => setAberto(null)}
            aoEnviar={() => enviarArquivo(detalhe)}
            aoColar={() => colar(detalhe)}
            aoExcluir={(ciclo) => setExcluindo({ cartao: detalhe, ciclo })}
          />
        )}
      </section>
    );
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Bases"
        descricao="Clique num card para ver o detalhe, enviar arquivo ou colar do Excel. Cada envio mostra uma prévia antes de gravar."
      />

      <input
        ref={entrada}
        type="file"
        accept=".csv,.xlsx,.xls,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setArquivo(f);
        }}
      />

      <div className="space-y-6">
        {/* F2b: vendas do canal App Delivery (fora dos cards: grava só o resumo por loja e dia) */}
        <VendasCanal ciclos={ciclos ?? []} />
        {secao("fixa", "Bases fixas", "Mudam pouco. Atualize quando houver mudança.")}
        <hr className="border-border" />
        {secao(
          "variavel",
          "Bases variáveis",
          "Precisam de atualização frequente: sem envio há mais de 24 h, aparece o aviso.",
        )}
      </div>

      <ColarDialog
        cartao={colando}
        aoFechar={() => setColando(null)}
        aoAnalisar={(f) => {
          setColando(null);
          setArquivo(f);
        }}
      />

      <PreviaEnvio
        base={escolhendo?.base ?? "lojas"}
        titulo={escolhendo?.titulo ?? ""}
        arquivo={arquivo}
        lojas={lojas ?? []}
        extras={escolhendo?.base === "cobertura" ? extras : undefined}
        aoFechar={() => setArquivo(null)}
        aoConcluir={(a) => {
          recarregar();
          if (a.base === "cobertura") void atualizarDisponibilidade(a);
        }}
      />

      <DivergenciasDialog alvo={divergencias} aoFechar={() => setDivergencias(null)} />

      <AlertDialog open={excluindo !== null} onOpenChange={(a) => !a && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {excluindo?.cartao.base === "lojas"
                ? "Inativar todas as lojas?"
                : `Excluir ${excluindo?.cartao.titulo}${excluindo?.ciclo ? ` do ciclo ${excluindo.ciclo}` : ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {excluindo?.cartao.base === "lojas"
                ? "As lojas não são apagadas: ficam inativas até o próximo envio da base de lojas."
                : excluindo?.cartao.base === "vendedoras"
                  ? "Todas as lojas ficam com 0 vendedoras até o próximo envio."
                  : "Os dados desta base saem do banco. Simulações e bases já salvas não mudam."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExclusao}>
              {excluindo?.cartao.base === "lojas" ? "Inativar" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Card aberto: linhas, última atualização, quem subiu, prévia do que está gravado e ações. */
function Detalhe({
  cartao: c,
  envio,
  desatualizada,
  envios,
  nomes,
  semLojas,
  ciclo,
  aoEscolherCiclo,
  aoFechar,
  aoEnviar,
  aoColar,
  aoExcluir,
}: {
  cartao: Cartao;
  envio: Envio | undefined;
  desatualizada: boolean;
  envios: Envio[];
  nomes: Map<string, string> | undefined;
  semLojas: boolean;
  ciclo: number;
  aoEscolherCiclo: (c: number) => void;
  aoFechar: () => void;
  aoEnviar: () => void;
  aoColar: () => void;
  aoExcluir: (ciclo: number | null) => void;
}) {
  const promo = c.base === "promocao";
  const podeExcluir = envio && !excluida(envio);
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-extrabold text-ink">{c.titulo}</h3>
          <p className="text-sm text-muted-foreground">{c.texto}</p>
          <p className="text-xs text-muted-foreground">Arquivo: {c.arquivos}</p>
        </div>
        <Button size="icon" variant="ghost" onClick={aoFechar} aria-label="Fechar detalhe">
          <X />
        </Button>
      </div>

      {desatualizada && (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          Base variável sem atualização há mais de 24 h{promo ? ` (ciclo ${ciclo})` : ""}.
        </p>
      )}

      {promo && (
        <div className="flex flex-wrap gap-2">
          {CICLOS_PROMO.map((n) => {
            const e = ultimoEnvio(envios, "promocao", n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => aoEscolherCiclo(n)}
                className={`rounded-lg border px-3 py-1.5 text-left text-sm ${
                  n === ciclo ? "border-primary bg-primary/10" : "bg-card"
                }`}
              >
                <span className="font-semibold">Ciclo {n}</span>{" "}
                <span className="text-muted-foreground">
                  {!e
                    ? "não enviada"
                    : excluida(e)
                      ? "excluída"
                      : `${e.linhas.toLocaleString("pt-BR")} SKUs`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <ResumoEnvio
          envio={envio}
          nome={envio?.enviado_por ? nomes?.get(envio.enviado_por) : undefined}
        />
        <div className="min-w-0 space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Prévia do que está gravado{promo ? ` (ciclo ${ciclo})` : ""}
          </div>
          <PreviaGravada base={c.base} ciclo={promo ? ciclo : null} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={aoEnviar} disabled={semLojas}>
          <Upload /> Enviar arquivo
        </Button>
        <Button variant="outline" onClick={aoColar} disabled={semLojas}>
          <ClipboardPaste /> Colar do Excel
        </Button>
        {podeExcluir && (
          <Button
            variant="outline"
            onClick={() => aoExcluir(promo ? ciclo : null)}
            title={c.base === "lojas" ? "Inativar todas as lojas" : "Excluir esta base"}
          >
            <Trash2 />{" "}
            {c.base === "lojas" ? "Inativar" : promo ? `Excluir ciclo ${ciclo}` : "Excluir"}
          </Button>
        )}
      </div>
      {semLojas && <p className="text-xs text-muted-foreground">Envie primeiro a base de Lojas.</p>}
      {c.grande && (
        <p className="text-xs text-muted-foreground">
          Base grande: para ela, use o envio de arquivo (colar só serve para recortes pequenos).
        </p>
      )}
    </div>
  );
}

function ResumoEnvio({ envio, nome }: { envio: Envio | undefined; nome: string | undefined }) {
  if (!envio) {
    return (
      <div className="self-start rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
        Ainda não enviada.
      </div>
    );
  }
  const detalhes = (envio.detalhes ?? {}) as Record<string, unknown>;
  if (detalhes["excluida_em"]) {
    return (
      <div className="self-start rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
        Excluída em {dataHora(String(detalhes["excluida_em"]))}. Envie um arquivo novo.
      </div>
    );
  }
  const destaques = Object.entries(DESTAQUES)
    .filter(([k]) => detalhes[k] !== undefined && detalhes[k] !== 0)
    .map(
      ([k, rotulo]) =>
        `${rotulo}: ${typeof detalhes[k] === "number" ? (detalhes[k] as number).toLocaleString("pt-BR") : String(detalhes[k])}`,
    );
  return (
    <dl className="space-y-1 self-start rounded-lg bg-muted px-3 py-2 text-sm">
      <div className="flex justify-between gap-2">
        <dt className="text-muted-foreground">Última atualização</dt>
        <dd className="font-semibold">{dataHora(envio.concluido_em)}</dd>
      </div>
      {nome && (
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Quem subiu</dt>
          <dd>{nome}</dd>
        </div>
      )}
      <div className="flex justify-between gap-2">
        <dt className="text-muted-foreground">Linhas</dt>
        <dd className="tabular-nums">{envio.linhas.toLocaleString("pt-BR")}</dd>
      </div>
      {envio.versao_ref && (
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Data de referência</dt>
          <dd>{dataCurta(envio.versao_ref)}</dd>
        </div>
      )}
      {destaques.length > 0 && (
        <dd className="pt-1 text-xs text-muted-foreground">{destaques.join(" · ")}</dd>
      )}
    </dl>
  );
}
