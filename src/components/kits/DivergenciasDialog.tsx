import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { repositorio } from "@/lib/dados";
import type { BaseDefinida } from "@/lib/dados/tipos";
import { ordenarAnalises, type AnaliseLoja } from "@/lib/motor/divergencias";
import type { CicloMotor } from "@/lib/motor/metas";
import { entradaDoMotor } from "@/lib/motor/entrada";
import {
  analisarBase,
  calcularDisponibilidade,
  estoquePorLojaDe,
  pedidoRegerar,
  trocarKitsDaLoja,
  type KitsDaBase,
} from "@/lib/motor/kits-da-base";

type Modo = "divergencias" | "todas" | "manual" | "nenhuma";

const MODOS: { valor: Modo; nome: string }[] = [
  { valor: "divergencias", nome: "Selecionar divergências" },
  { valor: "todas", nome: "Selecionar todas" },
  { valor: "manual", nome: "Selecionar manualmente" },
  { valor: "nenhuma", nome: "Não selecionar nada" },
];

const NIVEL: Record<AnaliseLoja["nivel"], { rotulo: string; classe: string }> = {
  divergente: { rotulo: "🔴 Divergente", classe: "bg-bad-soft text-destructive hover:bg-bad-soft" },
  atencao: { rotulo: "🟡 Atenção", classe: "bg-warn-soft text-warn hover:bg-warn-soft" },
  ok: { rotulo: "Sem divergência", classe: "bg-muted text-muted-foreground hover:bg-muted" },
};

const tres = (x: { geracao: number; anterior: number | null; hoje: number }) =>
  `${x.geracao} → ${x.anterior ?? "—"} → ${x.hoje}`;

/** O que abre a tela: as bases que podem ser analisadas (1ª = a escolhida) e os ciclos. */
export interface AlvoDivergencias {
  bases: BaseDefinida[];
  ciclos: CicloMotor[];
  /** Muda a cada abertura depois de uma Cobertura nova: os dados do motor são montados de novo. */
  id: number;
}

/**
 * Divergências de estoque da base atual (F1b): abre em Bases logo depois do envio da Cobertura
 * (com o arquivo que já está na memória) e pelo botão em Kits. Mostra cada loja com o
 * motivo e os números (geração → dia anterior → hoje), o detalhe por produto e por kit, e troca os
 * kits das lojas escolhidas. Nada muda na base se clicar em Ignorar.
 */
export function DivergenciasDialog({
  alvo,
  aoFechar,
}: {
  alvo: AlvoDivergencias | null;
  aoFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [baseId, setBaseId] = useState<number | null>(null);
  useEffect(() => setBaseId(alvo?.bases[0]?.id ?? null), [alvo]);
  const baseDef = alvo?.bases.find((b) => b.id === baseId) ?? null;
  const ciclo = alvo?.ciclos.find((c) => c.id === baseDef?.ciclo) ?? null;
  const [lendo, setLendo] = useState<string | null>(null);
  // estoque da memória (arquivo da Cobertura ou simulação anterior); promoção do ciclo da base
  const { data: entrada, error: erroEntrada } = useQuery({
    queryKey: ["f1b-entrada", alvo?.id, ciclo?.id],
    enabled: !!alvo && !!ciclo,
    staleTime: Infinity,
    gcTime: 60_000,
    queryFn: async () => {
      try {
        return await entradaDoMotor(ciclo!, alvo!.ciclos, { aoProgredir: setLendo });
      } finally {
        setLendo(null);
      }
    },
  });
  const { data: base, error: erroBase } = useQuery({
    queryKey: ["f1b-base", baseDef?.id],
    enabled: !!baseDef,
    staleTime: 0,
    queryFn: () => repositorio.kitsDaBase(baseDef!.id, baseDef!.ciclo),
  });
  const error = erroEntrada ?? erroBase;
  const [modo, setModo] = useState<Modo>("divergencias");
  const [manual, setManual] = useState<Set<string>>(new Set());
  const [aberta, setAberta] = useState<string | null>(null);
  const [trabalhando, setTrabalhando] = useState<string | null>(null);

  const nomes = useMemo(
    () => new Map((entrada?.lojas ?? []).map((l) => [l.bcps, { nome: l.nome, praca: l.praca }])),
    [entrada],
  );
  const descricao = useMemo(
    () => new Map((entrada?.produtos ?? []).map((p) => [p.sku, p.descricao])),
    [entrada],
  );
  const analises = useMemo(
    () => (base && entrada ? ordenarAnalises(analisarBase(base, entrada, nomes)) : []),
    [base, entrada, nomes],
  );

  useEffect(() => {
    if (!baseDef) return;
    setModo("divergencias");
    setAberta(null);
  }, [baseDef]);
  useEffect(() => {
    setManual(new Set(analises.filter((a) => a.nivel === "divergente").map((a) => a.bcps)));
  }, [analises]);

  const selecionadas = new Set(
    modo === "todas"
      ? analises.map((a) => a.bcps)
      : modo === "divergencias"
        ? analises.filter((a) => a.nivel === "divergente").map((a) => a.bcps)
        : modo === "manual"
          ? [...manual]
          : [],
  );
  const conta = (n: AnaliseLoja["nivel"]) => analises.filter((a) => a.nivel === n).length;
  const semAnterior = base && analises.every((a) => a.capacidade.anterior === null);

  const gerar = async () => {
    if (!baseDef || !entrada || !base || !selecionadas.size) return;
    const ref = await repositorio.coberturaAtual();
    let atual: KitsDaBase = base;
    let removidos = 0;
    let novos = 0;
    const avisos: string[] = [];
    try {
      let i = 0;
      for (const bcps of selecionadas) {
        i++;
        setTrabalhando(
          `Trocando kits: ${nomes.get(bcps)?.nome ?? bcps} (${i}/${selecionadas.size})…`,
        );
        await new Promise((r) => setTimeout(r, 10));
        const { resultado, base: depois } = trocarKitsDaLoja(atual, entrada, bcps);
        await repositorio.regerarKitsLoja(
          base.planoId,
          bcps,
          pedidoRegerar(resultado, ref),
          depois,
        );
        atual = depois;
        removidos += resultado.remover.length;
        novos += resultado.novos.length;
        avisos.push(...resultado.avisos.map((a) => `${nomes.get(bcps)?.nome ?? bcps}: ${a}`));
      }
      // fotos e disponibilidade das lojas trocadas (os produtos dos kits mudaram)
      if (ref) {
        setTrabalhando("Gravando a disponibilidade…");
        const so = { ...atual, kitLojas: atual.kitLojas.filter((kl) => selecionadas.has(kl.bcps)) };
        await repositorio.gravarDisponibilidade(
          base.planoId,
          ref,
          calcularDisponibilidade(so, estoquePorLojaDe(entrada.estoque)),
        );
      }
      toast.success(
        `Kits trocados em ${selecionadas.size} loja(s): ${removidos} saíram, ${novos} entraram. Os gerentes veem na base ${baseDef.nome}.`,
      );
      if (avisos.length) toast.warning(avisos.slice(0, 3).join(" · "));
      await queryClient.invalidateQueries({ queryKey: ["f1b-base"] });
      aoFechar();
    } catch (e) {
      toast.error(`Não foi possível trocar os kits: ${(e as Error).message}`);
      await queryClient.invalidateQueries({ queryKey: ["f1b-base"] });
    } finally {
      setTrabalhando(null);
    }
  };

  const gravarDisponibilidade = async () => {
    if (!entrada || !base) return;
    const ref = await repositorio.coberturaAtual();
    if (!ref) return void toast.error("Não achei a data da Cobertura em uso.");
    setTrabalhando("Gravando a disponibilidade de hoje…");
    try {
      const lojas = calcularDisponibilidade(base, estoquePorLojaDe(entrada.estoque));
      await repositorio.gravarDisponibilidade(base.planoId, ref, lojas);
      toast.success(`Disponibilidade gravada para ${lojas.length} loja(s) (Cobertura de ${ref}).`);
      await queryClient.invalidateQueries({ queryKey: ["f1b-base"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTrabalhando(null);
    }
  };

  return (
    <Dialog open={!!alvo} onOpenChange={(a) => !a && !trabalhando && aoFechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Divergências de estoque — {baseDef?.nome}</DialogTitle>
          <DialogDescription>
            Kits atuais de cada loja com o estoque de hoje, comparados com a geração dos kits e com
            o dia anterior (geração → anterior → hoje). A base só muda se você clicar em Gerar kits.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
        {(alvo?.bases.length ?? 0) > 1 && (
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">Base em andamento:</span>
            <select
              className="h-9 rounded-md border bg-card px-3 text-sm"
              value={baseId ?? ""}
              disabled={!!trabalhando}
              onChange={(e) => setBaseId(Number(e.target.value))}
            >
              {alvo!.bases.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome} (C{b.ciclo})
                </option>
              ))}
            </select>
          </label>
        )}
        {(!base || !entrada) && !error && (
          <p className="text-sm text-muted-foreground">{lendo ?? "Lendo a base…"}</p>
        )}
        {base && entrada && (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge className={NIVEL.divergente.classe}>
                {NIVEL.divergente.rotulo}: {conta("divergente")}
              </Badge>
              <Badge className={NIVEL.atencao.classe}>
                {NIVEL.atencao.rotulo}: {conta("atencao")}
              </Badge>
              <Badge className={NIVEL.ok.classe}>
                {NIVEL.ok.rotulo}: {conta("ok")}
              </Badge>
              <span className="text-muted-foreground">
                {analises.length} loja(s) da base com estoque na Cobertura
              </span>
            </div>
            {semAnterior && (
              <p className="text-xs text-muted-foreground">
                Ainda não há foto do dia anterior: ela aparece a partir da próxima Cobertura. Por
                enquanto, a comparação é só com a geração dos kits.
              </p>
            )}

            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Seleção de lojas">
              {MODOS.map((m) => (
                <button
                  key={m.valor}
                  type="button"
                  role="radio"
                  aria-checked={modo === m.valor}
                  onClick={() => setModo(m.valor)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    modo === m.valor ? "border-primary bg-primary text-primary-foreground" : ""
                  }`}
                >
                  {m.nome}
                </button>
              ))}
            </div>

            <div className="max-h-[50vh] overflow-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="w-10 px-2 py-1.5" />
                    <th className="px-2 py-1.5 text-left">Loja</th>
                    <th className="px-2 py-1.5 text-left">Situação</th>
                    <th className="px-2 py-1.5 text-right">Kits (capacidade)</th>
                    <th className="px-2 py-1.5 text-right">Estoque dos kits</th>
                    <th className="px-2 py-1.5 text-right">Meta</th>
                    <th className="w-8 px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {analises.map((a) => {
                    const sel = selecionadas.has(a.bcps);
                    const ab = aberta === a.bcps;
                    return (
                      <Fragment key={a.bcps}>
                        <tr className="border-t align-top">
                          <td className="px-2 py-1.5">
                            <Checkbox
                              aria-label={`Selecionar ${a.nome}`}
                              checked={sel}
                              disabled={modo !== "manual"}
                              onCheckedChange={(v) => {
                                const s = new Set(manual);
                                if (v === true) s.add(a.bcps);
                                else s.delete(a.bcps);
                                setManual(s);
                              }}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="font-medium">{a.nome}</div>
                            <div className="text-xs text-muted-foreground">
                              {a.bcps} · {a.praca}
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <Badge className={NIVEL[a.nivel].classe}>{NIVEL[a.nivel].rotulo}</Badge>
                            {a.abaixoDaMeta && (
                              <div className="mt-1 text-xs text-warn">
                                Abaixo do que falta da meta
                              </div>
                            )}
                            {a.heroisNovos.length > 0 && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {a.heroisNovos.length} herói(s) novo(s) fora dos kits
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {tres(a.capacidade)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{tres(a.estoque)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{a.sacolasMeta}</td>
                          <td className="px-2 py-1.5">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              aria-label={`Detalhe de ${a.nome}`}
                              onClick={() => setAberta(ab ? null : a.bcps)}
                            >
                              {ab ? <ChevronDown /> : <ChevronRight />}
                            </Button>
                          </td>
                        </tr>
                        {ab && (
                          <tr className="bg-muted/40">
                            <td />
                            <td colSpan={6} className="space-y-3 px-2 py-2">
                              {a.motivos.length > 0 && (
                                <ul className="list-inside list-disc text-xs">
                                  {a.motivos.map((m) => (
                                    <li key={m}>{m}</li>
                                  ))}
                                </ul>
                              )}
                              <div className="grid gap-3 lg:grid-cols-2">
                                <div>
                                  <div className="mb-1 text-xs font-semibold text-muted-foreground">
                                    Produtos dos kits (geração → anterior → hoje)
                                  </div>
                                  <table className="w-full text-xs">
                                    <tbody>
                                      {[...a.produtos]
                                        .sort((x, y) => Number(y.caiu) - Number(x.caiu))
                                        .map((p) => (
                                          <tr key={p.sku} className="border-t">
                                            <td className="py-0.5 pr-2">
                                              {p.caiu ? "↓ " : ""}
                                              {descricao.get(p.sku) ?? p.sku}{" "}
                                              <span className="text-muted-foreground">{p.sku}</span>
                                            </td>
                                            <td
                                              className={`py-0.5 text-right tabular-nums ${p.caiu ? "text-destructive" : ""}`}
                                            >
                                              {p.geracao} → {p.anterior ?? "—"} → {p.hoje}
                                            </td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                </div>
                                <div>
                                  <div className="mb-1 text-xs font-semibold text-muted-foreground">
                                    Kits da loja (pode montar hoje, cada um sozinho)
                                  </div>
                                  <ul className="space-y-0.5 text-xs">
                                    {a.kits.map((k) => (
                                      <li key={k.codigo} className="flex justify-between gap-2">
                                        <span>{k.codigo}</span>
                                        <span
                                          className={
                                            k.podeMontar === 0 ? "text-destructive" : "tabular-nums"
                                          }
                                        >
                                          {k.podeMontar === 0
                                            ? "indisponível (sai)"
                                            : `pode montar ${k.podeMontar}`}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                  {a.heroisNovos.length > 0 && (
                                    <p className="mt-2 text-xs text-muted-foreground">
                                      Heróis novos fora dos kits:{" "}
                                      {a.heroisNovos
                                        .slice(0, 8)
                                        .map((s) => descricao.get(s) ?? s)
                                        .join(", ")}
                                      {a.heroisNovos.length > 8 ? "…" : ""}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {!analises.length && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-muted-foreground">
                        Nenhuma loja da base com estoque na Cobertura.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {trabalhando && <p className="text-sm text-muted-foreground">{trabalhando}</p>}
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Button
            variant="ghost"
            onClick={gravarDisponibilidade}
            disabled={!base || !!trabalhando}
            title="Grava 'pode montar N' e a capacidade total de cada loja com o estoque da última Cobertura"
          >
            Gravar disponibilidade de hoje
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={aoFechar} disabled={!!trabalhando}>
              Ignorar
            </Button>
            <Button onClick={gerar} disabled={!base || !selecionadas.size || !!trabalhando}>
              Gerar kits ({selecionadas.size} loja{selecionadas.size === 1 ? "" : "s"})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
