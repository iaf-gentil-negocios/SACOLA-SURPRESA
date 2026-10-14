// Vendas do canal App Delivery (F2b), na tela Bases: envio do relatório "Gerencial de Vendas"
// (export com "Quebrar Por Data"), lido no navegador. O banco guarda só o resumo por loja e dia; o
// período do arquivo substitui o que havia nesses dias. Depois do envio, o ruído é recalculado.
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardPaste, ShoppingCart, TriangleAlert, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { lerArquivo } from "@/lib/bases/leitor";
import { haQuanto } from "@/lib/bases/situacao";
import { repositorio, useLojas } from "@/lib/dados";
import type { CicloMotor } from "@/lib/motor/metas";
import { lerVendas, type LeituraVendas } from "@/lib/vendas/leitor";
import { avisarArquivo, diasCobertos, somarDias, type AvisoArquivo } from "@/lib/vendas/ruido";
import { CHAVE_VENDAS, recalcularRuido, useEnviosVendas, vendasAte } from "@/lib/vendas/usaVendas";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (d: string) => d.split("-").reverse().join("/");

interface Previa {
  arquivo: string;
  leitura: LeituraVendas;
  aviso: AvisoArquivo;
  inicio: string;
  fim: string;
}

export function VendasCanal({ ciclos }: { ciclos: CicloMotor[] }) {
  const queryClient = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const { data: lojas } = useLojas();
  const { data: envios } = useEnviosVendas();
  const [colando, setColando] = useState(false);
  const [texto, setTexto] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [trabalhando, setTrabalhando] = useState<string | null>(null);

  const ate = vendasAte(envios ?? []);
  const ultimo = envios?.[0];
  const atrasada = !ultimo || Date.now() - new Date(ultimo.enviadoEm).getTime() > 24 * 3_600_000;

  const analisar = async (f: File) => {
    try {
      setTrabalhando("Lendo o arquivo…");
      const [p] = await lerArquivo(f);
      if (!p) throw new Error("Arquivo vazio.");
      const leitura = lerVendas(p, new Set((lojas ?? []).map((l) => l.bcps)));
      if (!leitura.inicio || !leitura.fim)
        throw new Error("Nenhuma venda de loja cadastrada no arquivo.");
      // histórico para o aviso de arquivo suspeito: 120 dias antes do arquivo
      setTrabalhando("Comparando com o histórico do canal…");
      const de = somarDias(leitura.inicio, -120);
      const ate1 = somarDias(leitura.inicio, -1);
      const [hist, todos] = await Promise.all([
        repositorio.vendasDiarias(de, ate1),
        repositorio.vendasEnvios(),
      ]);
      const cobertos = [...diasCobertos(todos)].filter((d) => d >= de && d <= ate1).length;
      setPrevia({
        arquivo: f.name,
        leitura,
        aviso: avisarArquivo(leitura, { linhas: hist, diasCobertos: cobertos }),
        inicio: leitura.inicio,
        fim: leitura.fim,
      });
    } catch (e) {
      toast.error((e as Error).message, { duration: 12_000 });
    } finally {
      setTrabalhando(null);
    }
  };

  const gravar = async () => {
    if (!previa) return;
    const { leitura, inicio, fim } = previa;
    if (
      !inicio ||
      !fim ||
      fim < inicio ||
      leitura.linhas.some((l) => l.dia < inicio || l.dia > fim)
    )
      return void toast.error("O período precisa conter todas as datas do arquivo.");
    try {
      setTrabalhando("Gravando as vendas…");
      const n = await repositorio.gravarVendas(inicio, fim, previa.arquivo, leitura.linhas);
      setTrabalhando("Recalculando o ruído…");
      await recalcularRuido(ciclos);
      await queryClient.invalidateQueries({ queryKey: CHAVE_VENDAS });
      toast.success(
        `Vendas de ${dataBR(inicio)} a ${dataBR(fim)} gravadas: ${n.toLocaleString("pt-BR")} linha(s) de loja e dia. Ruído recalculado.`,
      );
      setPrevia(null);
    } catch (e) {
      toast.error(`Não foi possível gravar: ${(e as Error).message}`);
    } finally {
      setTrabalhando(null);
    }
  };

  return (
    <section className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-extrabold text-ink">
            <ShoppingCart className="size-4" aria-hidden /> Vendas do canal App Delivery
            {atrasada && (
              <Badge className="bg-warn-soft text-warn hover:bg-warn-soft">
                <TriangleAlert className="mr-1 size-3" /> Desatualizada
              </Badge>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">
            Relatório Gerencial de Vendas, export com <b>“Quebrar Por Data”</b>. O período do
            arquivo substitui o que havia nesses dias (loja ou dia sem linha = venda 0). O mesmo
            export serve de histórico para o ruído.
          </p>
          <p className="mt-1 text-sm">
            {ate ? (
              <>
                Vendas até <b>{dataBR(ate)}</b> · último envio{" "}
                {ultimo ? haQuanto(ultimo.enviadoEm, Date.now()) : ""} (
                {ultimo ? `${dataBR(ultimo.inicio)} a ${dataBR(ultimo.fim)}` : ""})
              </>
            ) : (
              <span className="text-muted-foreground">Nenhuma venda enviada ainda.</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => entrada.current?.click()} disabled={!!trabalhando || !lojas}>
            <Upload /> Enviar arquivo
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setTexto("");
              setColando(true);
            }}
            disabled={!!trabalhando || !lojas}
          >
            <ClipboardPaste /> Colar do Excel
          </Button>
        </div>
      </div>
      {trabalhando && <p className="mt-2 text-sm text-muted-foreground">{trabalhando}</p>}
      <input
        ref={entrada}
        type="file"
        accept=".csv,.txt,.xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void analisar(f);
        }}
      />

      <Dialog open={colando} onOpenChange={setColando}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Colar o relatório de vendas</DialogTitle>
            <DialogDescription>
              Selecione a tabela com o cabeçalho (inclusive “Quebrar Por Data”), copie e cole aqui.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            className="h-64 font-mono text-xs"
            value={texto}
            spellCheck={false}
            onChange={(e) => setTexto(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setColando(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!texto.trim()}
              onClick={() => {
                setColando(false);
                void analisar(new File([texto], "colado-vendas.txt", { type: "text/plain" }));
              }}
            >
              Analisar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previa !== null} onOpenChange={(a) => !a && !trabalhando && setPrevia(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Prévia das vendas — {previa?.arquivo}</DialogTitle>
            <DialogDescription>
              Confira o total e o período. Ao gravar, os dias do período substituem os que já
              estavam no banco.
            </DialogDescription>
          </DialogHeader>
          {previa && (
            <div className="space-y-3 text-sm">
              {previa.aviso.suspeito && (
                <div className="rounded-lg bg-warn-soft px-3 py-2 text-warn">
                  <b>Arquivo suspeito:</b> parece ser de outro canal (ou de nenhum canal
                  selecionado). Confira o filtro “App Delivery” antes de gravar.
                  <ul className="mt-1 list-disc pl-5">
                    {previa.aviso.motivos.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Total (GMV)", brl(previa.leitura.total.gmv)],
                  ["Boletos", previa.leitura.total.boletos.toLocaleString("pt-BR")],
                  ["Lojas", previa.leitura.total.lojas.toLocaleString("pt-BR")],
                  ["Dias com venda", previa.leitura.total.dias.toLocaleString("pt-BR")],
                ].map(([r, v]) => (
                  <div key={r} className="rounded-xl border px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase text-muted-foreground">
                      {r}
                    </div>
                    <div className="font-bold tabular-nums">{v}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="v-inicio">Período do arquivo: início</Label>
                  <Input
                    id="v-inicio"
                    type="date"
                    value={previa.inicio}
                    onChange={(e) => setPrevia({ ...previa, inicio: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="v-fim">Fim</Label>
                  <Input
                    id="v-fim"
                    type="date"
                    value={previa.fim}
                    onChange={(e) => setPrevia({ ...previa, fim: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                O arquivo só traz os dias com movimento ({dataBR(previa.leitura.inicio!)} a{" "}
                {dataBR(previa.leitura.fim!)}). Se o export foi de um período maior (ex.: o mês
                inteiro), ajuste aqui: os dias sem linha ficam com venda 0.
              </p>
              {previa.leitura.ignoradas.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Ignoradas (BCPS fora do cadastro de lojas): {previa.leitura.ignoradas.join(", ")}
                </p>
              )}
              {previa.leitura.erros.length > 0 && (
                <p className="text-xs text-destructive">
                  {previa.leitura.erros.length} linha(s) com erro (puladas):{" "}
                  {previa.leitura.erros.slice(0, 3).join(" · ")}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrevia(null)} disabled={!!trabalhando}>
              Cancelar
            </Button>
            <Button onClick={() => void gravar()} disabled={!!trabalhando}>
              {trabalhando ?? "Gravar vendas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
