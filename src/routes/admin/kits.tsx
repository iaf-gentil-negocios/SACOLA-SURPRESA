import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, FolderOpen, Play, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DivergenciasDialog, type AlvoDivergencias } from "@/components/kits/DivergenciasDialog";
import { CabecalhoPagina } from "@/components/layout/CabecalhoPagina";
import { AvisoSemPromocao } from "@/components/motor/AvisoSemPromocao";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSoLeitura } from "@/lib/auth/leitura";
import { useCicloSelecionado, useCiclos } from "@/lib/ciclo";
import {
  basesDeTodosOsCiclos,
  CHAVES,
  repositorio,
  useBases,
  useLojas,
  useParametros,
  useSimulacaoAtual,
  useSimulacoes,
  type SimulacaoAtual,
} from "@/lib/dados";
import type { BaseDefinida } from "@/lib/dados/tipos";
import {
  avisoDoPeriodo,
  basesParaAnalise,
  erroDoPeriodo,
  hojeEmSaoPaulo,
  situacaoDaBase,
} from "@/lib/dados/periodo";
import { entraNoPlano } from "@/lib/lojas/regras";
import {
  NOME_TEMA,
  simular,
  type EntradaSimulacao,
  type ResultadoSimulacao,
} from "@/lib/motor/gerar";
import { entradaDoMotor } from "@/lib/motor/entrada";
import { opcoesDeTema } from "@/lib/motor/temas";
import { usePromocaoDoCiclo } from "@/lib/motor/useCatalogo";

export const Route = createFileRoute("/admin/kits")({
  component: Kits,
});

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const int = (v: number) => v.toLocaleString("pt-BR");
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : "—");
const data = (d: string) => d.split("-").reverse().join("/");
const novaSemente = () => Math.floor(Math.random() * 1_000_000);

function Kits() {
  const queryClient = useQueryClient();
  // Acompanhamento (F2a): não simula; vê simulações salvas e bases, sem botões de ação
  const soLeitura = useSoLeitura();
  const { data: ciclos } = useCiclos();
  const [cicloId] = useCicloSelecionado(ciclos);
  const ciclo = ciclos?.find((c) => c.id === cicloId) ?? null;
  const { data: promoCiclo } = usePromocaoDoCiclo(cicloId ?? null);
  const { data: paramsSalvos } = useParametros();
  const { data: lojas } = useLojas();
  const pracas = useMemo(
    () => [...new Set((lojas ?? []).filter(entraNoPlano).map((l) => l.praca))].sort(),
    [lojas],
  );
  const [praca, setPraca] = useState("");
  const [semente, setSemente] = useState(novaSemente);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [atual, setAtual] = useSimulacaoAtual();
  const [salvando, setSalvando] = useState(false);
  const [baseDe, setBaseDe] = useState<{ id: number; nome: string } | null>(null);
  const { data: salvas } = useSimulacoes(cicloId);
  const { data: bases } = useBases(cicloId);
  // simulações que viraram base não podem ser excluídas
  const usadas = useMemo(() => new Set((bases ?? []).map((b) => b.simulacaoId)), [bases]);
  const [excluindo, setExcluindo] = useState<{ id: number; nome: string } | null>(null);
  const excluir = async () => {
    if (!excluindo) return;
    try {
      await repositorio.excluirSimulacao(excluindo.id);
      if (atual?.salvaId === excluindo.id) setAtual(null);
      toast.success(`Simulação "${excluindo.nome}" excluída.`);
      recarregarListas();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExcluindo(null);
    }
  };
  // F1b: divergências da base atual — só pelo botão (a análise diária abre em Bases, depois da
  // Cobertura). Usa o estoque que já está na memória; sem ele, lê uma vez (como uma simulação).
  const [divergencias, setDivergencias] = useState<AlvoDivergencias | null>(null);
  const abrirDivergencias = async () => {
    if (!ciclos) return;
    const lista = basesParaAnalise(
      await basesDeTodosOsCiclos(queryClient, ciclos),
      cicloId ?? null,
    );
    if (!lista.length) return void toast.info("Nenhuma base em andamento ou futura para analisar.");
    setDivergencias({ bases: lista, ciclos, id: Date.now() });
  };

  const sim = atual && atual.resultado.ciclo === cicloId ? atual : null;

  const rodar = async () => {
    if (!ciclo || !ciclos) return;
    try {
      const entrada = await entradaDoMotor(ciclo, ciclos, {
        pracas: praca ? [praca] : null,
        semente,
        aoProgredir: setProgresso,
      });
      setProgresso("Montando os kits…");
      await new Promise((r) => setTimeout(r, 20)); // deixa a tela mostrar o aviso
      const resultado = simular(entrada);
      setAtual({ resultado, salvaId: null, nome: null });
      toast.success(
        `Simulação pronta: ${resultado.resumo.kits} kits em ${resultado.resumo.lojas} lojas.`,
      );
    } catch (e) {
      toast.error(`Não foi possível simular: ${(e as Error).message}`);
    } finally {
      setProgresso(null);
    }
  };

  const abrir = async (id: number, nome: string) => {
    try {
      setProgresso("Abrindo a simulação salva…");
      const resultado = await repositorio.abrirSimulacao(id, setProgresso);
      setAtual({ resultado, salvaId: id, nome });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setProgresso(null);
    }
  };

  const recarregarListas = () => {
    void queryClient.invalidateQueries({ queryKey: CHAVES.simulacoes(cicloId ?? 0) });
    void queryClient.invalidateQueries({ queryKey: CHAVES.bases(cicloId ?? 0) });
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Kits"
        descricao={
          soLeitura
            ? "Só leitura: abra as simulações salvas e veja as bases do ciclo. As divergências ficam em Dados gerais."
            : `Simule, salve e defina a base de um período. ${repositorio.origem}.`
        }
      />

      {ciclo && promoCiclo?.size === 0 && paramsSalvos?.promo_heroi === "obrigatoria" && (
        <AvisoSemPromocao ciclo={ciclo.id} />
      )}

      {/* Simular */}
      {!soLeitura && (
        <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
          <div className="space-y-1.5">
            <Label htmlFor="praca">Praça</Label>
            <select
              id="praca"
              className="h-9 rounded-md border bg-card px-3 text-sm"
              value={praca}
              onChange={(e) => setPraca(e.target.value)}
            >
              <option value="">Todas</option>
              {pracas.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="semente"
              title="Número que fixa os sorteios do motor (herói e desempates). Mesma semente + mesmos dados e parâmetros = os mesmos kits. Clique em Nova para sortear outra combinação."
            >
              Semente do sorteio ⓘ
            </Label>
            <div className="flex gap-2">
              <Input
                id="semente"
                className="w-32"
                type="number"
                value={semente}
                onChange={(e) => setSemente(Number(e.target.value) || 0)}
              />
              <Button variant="outline" onClick={() => setSemente(novaSemente())}>
                Nova
              </Button>
            </div>
          </div>
          <Button onClick={rodar} disabled={!ciclo || progresso !== null}>
            <Play /> Simular {ciclo?.nome ?? ""}
          </Button>
          {progresso && <span className="text-sm text-muted-foreground">{progresso}</span>}
        </div>
      )}
      {soLeitura && progresso && <p className="mb-3 text-sm text-muted-foreground">{progresso}</p>}

      {sim ? (
        <Resultado
          sim={sim}
          soLeitura={soLeitura}
          aoSalvar={() => setSalvando(true)}
          aoDefinirBase={() => sim.salvaId && setBaseDe({ id: sim.salvaId, nome: sim.nome ?? "" })}
        />
      ) : (
        <div className="mb-5 rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          {soLeitura
            ? "Nenhuma simulação na tela. Abra uma simulação salva."
            : "Nenhuma simulação na tela. Clique em Simular ou abra uma simulação salva."}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="mb-2 font-extrabold text-ink">Simulações salvas</h2>
          {!salvas?.length && <p className="text-sm text-muted-foreground">Nenhuma ainda.</p>}
          <ul className="divide-y">
            {salvas?.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <div>
                  <b>{s.nome}</b>{" "}
                  <span className="text-muted-foreground">
                    ·{" "}
                    {new Date(s.criadoEm).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                    {s.resumo ? ` · ${int(s.resumo.kits)} kits · ${brl(s.resumo.receita)}` : ""}
                  </span>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => abrir(s.id, s.nome)}>
                    <FolderOpen /> Abrir
                  </Button>
                  {!soLeitura && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setBaseDe({ id: s.id, nome: s.nome })}
                    >
                      <CalendarCheck /> Definir como base
                    </Button>
                  )}
                  {usadas.has(s.id) ? (
                    <Badge className="bg-muted text-muted-foreground hover:bg-muted">
                      Virou base
                    </Badge>
                  ) : (
                    !soLeitura && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setExcluindo({ id: s.id, nome: s.nome })}
                      >
                        <Trash2 /> Excluir
                      </Button>
                    )
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border bg-card p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-extrabold text-ink">Bases do ciclo (o que os gerentes veem)</h2>
            {!soLeitura && (
              <Button
                size="sm"
                variant="outline"
                title="Compara os kits da base atual com o estoque da última Cobertura"
                onClick={() => void abrirDivergencias()}
              >
                Divergências de estoque
              </Button>
            )}
          </div>
          {!bases?.length && (
            <p className="text-sm text-muted-foreground">Nenhuma base definida.</p>
          )}
          <ul className="divide-y">
            {bases?.map((b) => {
              const s = situacaoDaBase(b);
              return (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span>
                    <b>{b.nome}</b> · {data(b.inicio)} a {data(b.fim)}
                  </span>
                  <Badge
                    className={
                      s === "atual"
                        ? "bg-success-soft text-success-foreground hover:bg-success-soft"
                        : "bg-muted text-muted-foreground hover:bg-muted"
                    }
                  >
                    {s === "atual"
                      ? "Atual"
                      : s === "futura"
                        ? "Futura (gerente ainda não vê)"
                        : "Encerrada (histórico)"}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <DialogoSalvar
        aberto={salvando}
        sim={sim}
        aoFechar={() => setSalvando(false)}
        aoSalvar={(s) => {
          setAtual(s);
          recarregarListas();
        }}
      />
      <DialogoBase
        alvo={baseDe}
        ciclo={ciclo}
        bases={bases ?? []}
        aoFechar={() => setBaseDe(null)}
        aoDefinir={recarregarListas}
      />
      <DivergenciasDialog alvo={divergencias} aoFechar={() => setDivergencias(null)} />
      <AlertDialog open={excluindo !== null} onOpenChange={(a) => !a && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a simulação "{excluindo?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Apaga a simulação salva e os kits dela. Não dá para desfazer. Bases definidas não
              mudam (simulação que virou base não pode ser excluída).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void excluir()}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Resultado({
  sim,
  soLeitura,
  aoSalvar,
  aoDefinirBase,
}: {
  sim: SimulacaoAtual;
  soLeitura: boolean;
  aoSalvar: () => void;
  aoDefinirBase: () => void;
}) {
  const r = sim.resultado;
  const s = r.resumo;
  const cartoes = [
    ["Meta (lojas simuladas)", brl(s.meta)],
    ["Sacolas planejadas / meta", `${int(s.sacolasPlanejadas)} / ${int(s.sacolasMeta)}`],
    [
      "Cobertura da meta pelo estoque",
      `${int(s.sacolasPossiveis)} possíveis (${pct(s.sacolasPossiveis, s.sacolasMeta)})`,
    ],
    ["Receita planejada", brl(s.receita)],
    ["Margem", `${brl(s.margem)} (${pct(s.margem, s.receita)})`],
    ["Kits diferentes", `${int(s.kits)} · ${int(s.kitsReaproveitados)} reaproveitados`],
  ];
  return (
    <section className="mb-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-extrabold text-ink">
          {sim.nome ? `Simulação salva: ${sim.nome}` : "Simulação na tela (ainda não salva)"}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            semente {r.semente} · {r.pracas?.join(", ") ?? "todas as praças"}
          </span>
        </h2>
        <div className="flex gap-2">
          {soLeitura ? null : sim.salvaId === null ? (
            <Button onClick={aoSalvar}>
              <Save /> Salvar simulação
            </Button>
          ) : (
            <Button onClick={aoDefinirBase}>
              <CalendarCheck /> Definir como base
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        {cartoes.map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-xl border bg-card px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {rotulo}
            </div>
            <div className="font-bold tabular-nums text-ink">{valor}</div>
          </div>
        ))}
      </div>
      <Tabs defaultValue="cobertura">
        <TabsList>
          <TabsTrigger value="cobertura">Cobertura por loja</TabsTrigger>
          <TabsTrigger value="kits">Kits</TabsTrigger>
        </TabsList>
        <TabsContent value="cobertura" className="mt-3">
          <CoberturaPorLoja r={r} />
        </TabsContent>
        <TabsContent value="kits" className="mt-3">
          <ListaKits r={r} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function CoberturaPorLoja({ r }: { r: ResultadoSimulacao }) {
  return (
    <div className="max-h-[480px] overflow-auto rounded-2xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Praça</TableHead>
            <TableHead>Loja</TableHead>
            <TableHead className="text-right">Meta</TableHead>
            <TableHead className="text-right">Sacolas meta</TableHead>
            <TableHead className="text-right">Possíveis</TableHead>
            <TableHead className="text-right">Cobertura</TableHead>
            <TableHead className="text-right">Planejadas</TableHead>
            <TableHead className="text-right">Kits</TableHead>
            <TableHead>Avisos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {r.lojas.map((l) => {
            const cob = l.sacolasMeta > 0 ? l.sacolasPossiveis / l.sacolasMeta : 1;
            return (
              <TableRow key={l.bcps}>
                <TableCell>{l.praca}</TableCell>
                <TableCell>
                  {l.nome} <span className="text-muted-foreground">· {l.bcps}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{brl(l.meta)}</TableCell>
                <TableCell className="text-right tabular-nums">{int(l.sacolasMeta)}</TableCell>
                <TableCell className="text-right tabular-nums">{int(l.sacolasPossiveis)}</TableCell>
                <TableCell
                  className={`text-right font-semibold tabular-nums ${cob >= 1 ? "text-success-foreground" : cob >= 0.8 ? "text-warn" : "text-destructive"}`}
                >
                  {pct(l.sacolasPossiveis, l.sacolasMeta)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {int(l.sacolasPlanejadas)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{l.kits.length}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {l.avisos.join(" ")}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ListaKits({ r }: { r: ResultadoSimulacao }) {
  const [tema, setTema] = useState("");
  const [praca, setPraca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const lojasDoKit = useMemo(() => {
    const m = new Map<
      string,
      { nome: string; praca: string; qtd: number; custo: number; margem: number }[]
    >();
    for (const l of r.lojas)
      for (const k of l.kits)
        m.set(k.codigo, [
          ...(m.get(k.codigo) ?? []),
          { nome: l.nome, praca: l.praca, qtd: k.qtd, custo: k.custo, margem: k.margem },
        ]);
    return m;
  }, [r]);
  const pracas = [...new Set(r.lojas.map((l) => l.praca))].sort();
  const kits = r.kits.filter(
    (k) =>
      (!tema || k.tema === tema) &&
      (!praca || (lojasDoKit.get(k.codigo) ?? []).some((l) => l.praca === praca)),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          className="h-9 rounded-md border bg-card px-3 text-sm"
          value={praca}
          onChange={(e) => setPraca(e.target.value)}
        >
          <option value="">Todas as praças</option>
          {pracas.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border bg-card px-3 text-sm"
          value={tema}
          onChange={(e) => setTema(e.target.value)}
        >
          <option value="">Todos os temas</option>
          {opcoesDeTema(r.kits.map((k) => k.tema)).map(([k, n]) => (
            <option key={k} value={k}>
              {n}
            </option>
          ))}
        </select>
        <span className="self-center text-sm text-muted-foreground">{int(kits.length)} kits</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {kits.slice(0, 120).map((k) => {
          const ls = lojasDoKit.get(k.codigo) ?? [];
          const heroi = k.itens.find((i) => i.papel === "heroi");
          return (
            <div key={k.codigo} className="rounded-2xl border bg-card p-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-extrabold text-ink">{k.codigo}</div>
                  <div className="text-muted-foreground">{NOME_TEMA[k.tema] ?? k.tema}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-extrabold text-ink">{brl(k.preco)}</div>
                  <div className="text-xs text-muted-foreground">
                    <s>{brl(k.valorCheio)}</s> · {k.descontoPct.toLocaleString("pt-BR")}% off
                  </div>
                </div>
              </div>
              <div className="mt-2 truncate">Herói: {heroi?.descricao}</div>
              <div className="text-xs text-muted-foreground">
                {ls.length} loja(s) · {int(ls.reduce((s, l) => s + l.qtd, 0))} sacolas
              </div>
              <button
                className="mt-2 text-xs font-semibold text-chip-foreground hover:underline"
                onClick={() => setAberto(aberto === k.codigo ? null : k.codigo)}
              >
                {aberto === k.codigo ? "Fechar" : "Ver itens e lojas"}
              </button>
              {aberto === k.codigo && (
                <div className="mt-2 space-y-2">
                  <ul className="space-y-1">
                    {k.itens.map((i) => (
                      <li key={i.ordem} className="rounded-lg bg-muted px-2 py-1">
                        <b className="mr-1 text-xs uppercase">{i.papel}</b>
                        {i.sku} · {i.descricao} · {brl(i.precoItem)}
                        {i.promoPct ? ` (promo ${i.promoPct}%)` : ""}
                      </li>
                    ))}
                  </ul>
                  <ul className="text-xs text-muted-foreground">
                    {ls.map((l) => (
                      <li key={l.nome}>
                        {l.nome}: {l.qtd} sacolas · custo {brl(l.custo)} · margem {brl(l.margem)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {kits.length > 120 && (
        <p className="text-xs text-muted-foreground">Mostrando 120. Use os filtros.</p>
      )}
    </div>
  );
}

function DialogoSalvar({
  aberto,
  sim,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  sim: SimulacaoAtual | null;
  aoFechar: () => void;
  aoSalvar: (s: SimulacaoAtual) => void;
}) {
  const [nome, setNome] = useState("");
  const [gravando, setGravando] = useState<string | null>(null);
  const salvar = async () => {
    if (!sim || !nome.trim()) return;
    try {
      setGravando("Salvando…");
      const id = await repositorio.salvarSimulacao(sim.resultado, nome, setGravando);
      aoSalvar({ ...sim, salvaId: id, nome: nome.trim() });
      toast.success("Simulação salva.");
      setNome("");
      aoFechar();
    } catch (e) {
      toast.error(`Não foi possível salvar: ${(e as Error).message}`);
    } finally {
      setGravando(null);
    }
  };
  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && !gravando && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Salvar simulação</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="nome-sim">Nome</Label>
          <Input
            id="nome-sim"
            value={nome}
            maxLength={120}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: C15 semana 1"
          />
          <p className="text-xs text-muted-foreground">
            Só o admin vê. Salvar não muda nada do que os gerentes veem.
          </p>
        </div>
        {gravando && <p className="text-sm text-muted-foreground">{gravando}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={aoFechar} disabled={!!gravando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={!nome.trim() || !!gravando}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoBase({
  alvo,
  ciclo,
  bases,
  aoFechar,
  aoDefinir,
}: {
  alvo: { id: number; nome: string } | null;
  ciclo: { id: number; nome: string; inicio: string; fim: string } | null;
  bases: { id: number; inicio: string; fim: string }[];
  aoFechar: () => void;
  aoDefinir: () => void;
}) {
  const [nome, setNome] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [gravando, setGravando] = useState(false);
  const erro = ciclo && inicio && fim ? erroDoPeriodo(ciclo, inicio, fim, bases) : null;
  const aviso = ciclo && inicio && fim ? avisoDoPeriodo(ciclo, inicio, fim) : null;
  const jaVisivel = !!inicio && inicio <= hojeEmSaoPaulo();

  const definir = async () => {
    if (!alvo || !nome.trim() || !inicio || !fim || erro) return;
    try {
      setGravando(true);
      await repositorio.definirBase(alvo.id, nome, inicio, fim);
      toast.success("Base definida. Os gerentes veem a partir da data de início.");
      aoDefinir();
      aoFechar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGravando(false);
    }
  };

  return (
    <Dialog
      open={alvo !== null}
      onOpenChange={(a) => {
        if (!a && !gravando) aoFechar();
        if (a) setNome(alvo?.nome ?? "");
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Definir como base: {alvo?.nome}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="nome-base">Nome da base</Label>
            <Input
              id="nome-base"
              value={nome}
              maxLength={120}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inicio">Início</Label>
            <Input
              id="inicio"
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fim">Fim</Label>
            <Input
              id="fim"
              type="date"
              min={inicio || undefined}
              value={fim}
              onChange={(e) => setFim(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Qualquer data; o {ciclo?.nome} vai de{" "}
          {ciclo ? `${data(ciclo.inicio)} a ${data(ciclo.fim)}` : ""}. Não pode sobrepor outra base
          do ciclo. A base fica congelada; os gerentes veem a partir do início.
        </p>
        {aviso && !erro && (
          <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">{aviso}</p>
        )}
        {jaVisivel && !erro && (
          <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            O início é hoje ou antes: os gerentes passam a ver esta base assim que ela for definida.
          </p>
        )}
        {erro && (
          <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-destructive">{erro}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={aoFechar} disabled={gravando}>
            Cancelar
          </Button>
          <Button
            onClick={definir}
            disabled={!nome.trim() || !inicio || !fim || !!erro || gravando}
          >
            {gravando ? "Definindo…" : "Definir como base"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
