import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  analisar,
  ErroDeLayout,
  type Analise,
  type Contexto,
  type LojaContexto,
} from "@/lib/bases/analise";
import { enviarAnalise, type Progresso } from "@/lib/bases/envio";
import type { BaseId } from "@/lib/bases/esquemas";
import { lerArquivo, type Planilha } from "@/lib/bases/leitor";
import { dataDoNomeDoArquivo } from "@/lib/bases/valores";

const MAX_ERROS = 50;

type Estado =
  | { fase: "lendo" }
  | { fase: "erro"; mensagem: string }
  | { fase: "previa" }
  | { fase: "enviando"; progresso: Progresso }
  | { fase: "concluido"; resultado: Record<string, number> };

const ROTULOS_RESULTADO: Record<string, string> = {
  linhas: "Linhas na base agora",
  removidas: "Removidas / inativadas (não vieram no arquivo)",
  lojas: "Lojas / HUBs",
  skus: "SKUs",
  preco_zero: "Linhas com preço R$ 0,00",
  skus_sem_cadastro: "SKUs sem cadastro de produto",
  inferidos_primeira_palavra: "Produtos com fornecedor pela 1ª palavra",
  sem_par_no_dsku: "Produtos sem par no dsku",
  vendedoras: "Total de vendedoras",
};

export function PreviaEnvio({
  base,
  titulo,
  arquivo,
  lojas,
  extras,
  aoFechar,
  aoConcluir,
}: {
  base: BaseId;
  titulo: string;
  arquivo: File | null;
  lojas: LojaContexto[];
  /** Dados extras da análise (ex.: SKUs BOT para filtrar a cobertura). */
  extras?: Partial<Contexto> | undefined;
  aoFechar: () => void;
  /** Recebe a análise enviada (ex.: a Cobertura, para a disponibilidade diária dos kits). */
  aoConcluir: (a: Analise) => void;
}) {
  const [planilhas, setPlanilhas] = useState<Planilha[] | null>(null);
  const [estado, setEstado] = useState<Estado>({ fase: "lendo" });
  const [versaoRef, setVersaoRef] = useState<string>("");
  const [ciclo, setCiclo] = useState<number>(15);
  const [mes, setMes] = useState<string | null>(null);
  const [ignorarErros, setIgnorarErros] = useState(false);

  // lê o arquivo uma vez
  useEffect(() => {
    if (!arquivo) return;
    setPlanilhas(null);
    setEstado({ fase: "lendo" });
    setVersaoRef(dataDoNomeDoArquivo(arquivo.name) ?? "");
    setMes(null);
    setIgnorarErros(false);
    let vivo = true;
    // deixa a tela mostrar "Lendo…" antes do trabalho pesado
    setTimeout(() => {
      lerArquivo(arquivo)
        .then((p) => {
          if (!vivo) return;
          setPlanilhas(p);
          setEstado({ fase: "previa" });
        })
        .catch((e: Error) => vivo && setEstado({ fase: "erro", mensagem: e.message }));
    }, 30);
    return () => {
      vivo = false;
    };
  }, [arquivo]);

  // analisa de novo quando muda uma opção
  const analise = useMemo((): { ok: Analise } | { erro: string } | null => {
    if (!planilhas || !arquivo) return null;
    try {
      return {
        ok: analisar(base, planilhas, {
          nomeArquivo: arquivo.name,
          lojas,
          versaoRef: versaoRef || null,
          ciclo,
          mes,
          ...extras,
        }),
      };
    } catch (e) {
      return {
        erro:
          e instanceof ErroDeLayout
            ? e.message
            : `Não foi possível ler o arquivo: ${(e as Error).message}`,
      };
    }
  }, [planilhas, arquivo, base, lojas, versaoRef, ciclo, mes, extras]);

  const a = analise && "ok" in analise ? analise.ok : null;
  const enviando = estado.fase === "enviando";
  const temDados = a ? a.partes.some((p) => p.linhas.length > 0) : false;
  // depois de uma falha no envio, dá para tentar de novo
  const podeEnviar =
    !!a &&
    temDados &&
    (a.erros.length === 0 || ignorarErros) &&
    (estado.fase === "previa" || estado.fase === "erro");

  const enviar = async () => {
    if (!a || !arquivo) return;
    setEstado({ fase: "enviando", progresso: { enviados: 0, total: 1, etapa: "Iniciando…" } });
    try {
      const resultado = await enviarAnalise(a, arquivo.name, (progresso) =>
        setEstado({ fase: "enviando", progresso }),
      );
      setEstado({ fase: "concluido", resultado });
      aoConcluir(a);
    } catch (e) {
      setEstado({
        fase: "erro",
        mensagem: `O envio falhou e foi cancelado: ${(e as Error).message}`,
      });
    }
  };

  return (
    <Dialog open={arquivo !== null} onOpenChange={(aberto) => !aberto && !enviando && aoFechar()}>
      <DialogContent
        className="max-h-[92vh] overflow-y-auto sm:max-w-4xl"
        onInteractOutside={(e) => enviando && e.preventDefault()}
        onEscapeKeyDown={(e) => enviando && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Enviar {titulo}</DialogTitle>
          <DialogDescription className="break-all">
            {arquivo?.name}
            {a ? ` · ${a.layout} · ${a.linhasLidas.toLocaleString("pt-BR")} linhas lidas` : ""}
          </DialogDescription>
        </DialogHeader>

        {estado.fase === "lendo" && (
          <p className="text-sm text-muted-foreground">Lendo o arquivo…</p>
        )}

        {estado.fase === "erro" && (
          <p
            role="alert"
            className="flex gap-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-destructive"
          >
            <XCircle className="mt-0.5 size-4 flex-none" /> {estado.mensagem}
          </p>
        )}

        {analise && "erro" in analise && estado.fase === "previa" && (
          <p
            role="alert"
            className="flex gap-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-destructive"
          >
            <XCircle className="mt-0.5 size-4 flex-none" /> {analise.erro}
          </p>
        )}

        {(estado.fase === "previa" || estado.fase === "erro") && planilhas && (
          <div className="flex flex-wrap gap-4">
            {base === "cobertura" && (
              <div className="space-y-1.5">
                <Label htmlFor="versao">Data de referência da cobertura</Label>
                <Input
                  id="versao"
                  type="date"
                  value={versaoRef}
                  onChange={(e) => setVersaoRef(e.target.value)}
                />
              </div>
            )}
            {base === "promocao" && (
              <div className="space-y-1.5">
                <Label htmlFor="ciclo">Ciclo da promoção</Label>
                <select
                  id="ciclo"
                  className="h-9 rounded-md border bg-card px-3 text-sm"
                  value={ciclo}
                  onChange={(e) => setCiclo(Number(e.target.value))}
                >
                  {[15, 16, 17].map((c) => (
                    <option key={c} value={c}>
                      Ciclo {c}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {base === "gerentes" && a?.meses && (
              <div className="space-y-1.5">
                <Label htmlFor="mes">Mês da base de gerentes</Label>
                <select
                  id="mes"
                  className="h-9 rounded-md border bg-card px-3 text-sm"
                  value={a.mes ?? ""}
                  onChange={(e) => setMes(e.target.value)}
                >
                  {a.meses.map((m) => (
                    <option key={m.mes} value={m.mes}>
                      {m.mes} ({m.linhas.toLocaleString("pt-BR")} linhas)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {a && estado.fase !== "concluido" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {a.resumo.map((r) => (
                <div key={r.rotulo} className="rounded-xl bg-muted px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {r.rotulo}
                  </div>
                  <div className="font-bold tabular-nums text-ink">{r.valor}</div>
                </div>
              ))}
            </div>

            {a.avisos.length > 0 && (
              <ul className="space-y-1 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
                {a.avisos.map((av) => (
                  <li key={av} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-4 flex-none" /> <span>{av}</span>
                  </li>
                ))}
              </ul>
            )}

            {a.erros.length > 0 && (
              <div className="space-y-2 rounded-xl bg-bad-soft px-4 py-3 text-sm text-destructive">
                <b>
                  {a.erros.length.toLocaleString("pt-BR")} linha(s) com erro
                  {a.erros.length > MAX_ERROS ? ` (mostrando ${MAX_ERROS})` : ""}:
                </b>
                <ul className="max-h-40 overflow-auto">
                  {a.erros.slice(0, MAX_ERROS).map((e) => (
                    <li key={`${e.linha}-${e.mensagem}`}>
                      Linha {e.linha}: {e.mensagem}
                    </li>
                  ))}
                </ul>
                <label className="flex items-center gap-2 font-semibold">
                  <Checkbox
                    checked={ignorarErros}
                    onCheckedChange={(v) => setIgnorarErros(v === true)}
                  />
                  Enviar mesmo assim, ignorando as linhas com erro
                </label>
              </div>
            )}

            {a.amostra.linhas.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Prévia (primeiras linhas como serão gravadas)
                </div>
                <div className="overflow-x-auto rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {a.amostra.colunas.map((c) => (
                          <TableHead key={c}>{c}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {a.amostra.linhas.map((l, i) => (
                        <TableRow key={i}>
                          {l.map((v, j) => (
                            <TableCell key={j} className="whitespace-nowrap">
                              {v === null ? "—" : String(v)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}

        {estado.fase === "enviando" && (
          <div className="space-y-2">
            <Progress
              value={(100 * estado.progresso.enviados) / Math.max(1, estado.progresso.total)}
            />
            <p className="text-sm text-muted-foreground">
              {estado.progresso.etapa} {estado.progresso.enviados.toLocaleString("pt-BR")} de{" "}
              {estado.progresso.total.toLocaleString("pt-BR")} linhas. Não feche esta janela.
            </p>
          </div>
        )}

        {estado.fase === "concluido" && (
          <div className="space-y-3">
            <p className="flex items-center gap-2 font-semibold text-success-foreground">
              <CheckCircle2 className="size-5" /> Base gravada.
            </p>
            <dl className="grid gap-1 text-sm sm:grid-cols-2">
              {Object.entries(estado.resultado).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 rounded-lg bg-muted px-3 py-1.5">
                  <dt className="text-muted-foreground">{ROTULOS_RESULTADO[k] ?? k}</dt>
                  <dd className="font-bold tabular-nums">{Number(v).toLocaleString("pt-BR")}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <DialogFooter className="gap-2">
          {estado.fase === "concluido" ? (
            <Button onClick={aoFechar}>Fechar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={aoFechar} disabled={enviando}>
                Cancelar
              </Button>
              <Button onClick={enviar} disabled={!podeEnviar}>
                {enviando ? "Enviando…" : "Gravar no banco"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
