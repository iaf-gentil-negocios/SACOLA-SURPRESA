// Declarações de vendas dos GVOs (F2b): o admin aprova ou recusa; o Acompanhamento só vê.
// Estimativa do gerente = sacolas declaradas × preço médio dos kits da praça (gravado pelo banco).
// Desvio % = (declarado − sistema) ÷ sistema; o valor oficial é o do sistema.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Bloco } from "@/components/painel/Painel";
import { Button } from "@/components/ui/button";
import { repositorio } from "@/lib/dados";
import type { Declaracao } from "@/lib/dados/tipos";
import { brl0, int } from "@/lib/gerente/formato";
import type { VendaDia } from "@/lib/vendas/leitor";
import { CLASSE_STATUS, comparar, fmtDesvio, ROTULO_STATUS } from "@/lib/vendas/declaracoes";
import type { RuidoLoja } from "@/lib/vendas/ruido";
import { CHAVE_VENDAS } from "@/lib/vendas/usaVendas";

const dataBR = (d: string) => d.split("-").reverse().join("/");

export function DeclaracoesAdmin({
  ciclo,
  nomes,
  vendas,
  soLeitura,
}: {
  ciclo: number;
  nomes: Map<string, string>;
  vendas: { linhas: VendaDia[]; ruidos: RuidoLoja[]; ate: string | null } | null;
  soLeitura: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: lista } = useQuery({
    queryKey: [...CHAVE_VENDAS, "declaracoes", ciclo],
    queryFn: () => repositorio.declaracoes(ciclo),
  });
  const [motivo, setMotivo] = useState<Record<number, string>>({});
  const [trabalhando, setTrabalhando] = useState<number | null>(null);

  const decidir = async (d: Declaracao, aprovar: boolean) => {
    setTrabalhando(d.id);
    try {
      await repositorio.decidirDeclaracao(d.id, aprovar, motivo[d.id] ?? null);
      await queryClient.invalidateQueries({ queryKey: [...CHAVE_VENDAS, "declaracoes"] });
      toast.success(aprovar ? "Declaração aprovada." : "Declaração recusada.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTrabalhando(null);
    }
  };

  const validas = (lista ?? []).filter((d) => d.status !== "recusada");
  const pendentes = (lista ?? []).filter((d) => d.status === "pendente");
  const comp = validas.map((d) => ({ d, ...comparar(d, vendas) }));
  const totDeclarado = comp.reduce((s, x) => s + x.declarado, 0);
  const comSistema = comp.filter((x) => x.sistema !== null);
  const totSistema = comSistema.reduce((s, x) => s + (x.sistema ?? 0), 0);
  const totDeclaradoComSistema = comSistema.reduce((s, x) => s + x.declarado, 0);

  return (
    <Bloco
      titulo="Declarações dos gerentes"
      descricao="Feitas pelo GVO de cada loja, por dia ou por semana. Estimativa = sacolas × preço médio dos kits da praça. O valor oficial é o do sistema (venda da Sacola estimada)."
    >
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          ["Pendentes", int(pendentes.length)],
          ["Declarado (valendo)", brl0(totDeclarado)],
          ["Sistema no mesmo período", comSistema.length ? brl0(totSistema) : "—"],
          [
            "Desvio declarado × sistema",
            totSistema > 0 ? fmtDesvio((totDeclaradoComSistema - totSistema) / totSistema) : "—",
          ],
        ].map(([r, v]) => (
          <div key={r} className="rounded-xl border px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {r}
            </div>
            <div className="text-lg font-bold tabular-nums text-ink">{v}</div>
          </div>
        ))}
      </div>
      {!lista?.length ? (
        <p className="text-sm text-muted-foreground">Nenhuma declaração neste ciclo ainda.</p>
      ) : (
        <div className="max-h-[28rem] overflow-auto rounded-xl border">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2 text-left font-semibold">Loja</th>
                <th className="px-3 py-2 text-left font-semibold">Período</th>
                <th className="px-3 py-2 text-right font-semibold">Sacolas</th>
                <th className="px-3 py-2 text-right font-semibold">Declarado</th>
                <th className="px-3 py-2 text-right font-semibold">Sistema</th>
                <th className="px-3 py-2 text-right font-semibold">Desvio</th>
                <th className="px-3 py-2 text-left font-semibold">Situação</th>
              </tr>
            </thead>
            <tbody>
              {(lista ?? []).map((d) => {
                const c = comparar(d, vendas);
                return (
                  <tr key={d.id} className="border-b align-top">
                    <td className="px-3 py-2 font-semibold">{nomes.get(d.bcps) ?? d.bcps}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {d.tipo === "dia"
                        ? dataBR(d.inicio)
                        : `Semana ${dataBR(d.inicio)} a ${dataBR(d.fim)}`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{int(d.sacolas)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{brl0(c.declarado)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {c.sistema === null ? "—" : brl0(c.sistema)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtDesvio(c.desvio)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${CLASSE_STATUS[d.status]}`}
                      >
                        {ROTULO_STATUS[d.status]}
                      </span>
                      {d.motivo && (
                        <div className="mt-1 text-xs text-muted-foreground">{d.motivo}</div>
                      )}
                      {d.status === "pendente" && !soLeitura && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <input
                            className="h-7 w-40 rounded-md border bg-card px-2 text-xs"
                            placeholder="Motivo (opcional)"
                            aria-label="Motivo"
                            value={motivo[d.id] ?? ""}
                            onChange={(e) => setMotivo({ ...motivo, [d.id]: e.target.value })}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            disabled={trabalhando === d.id}
                            onClick={() => void decidir(d, true)}
                          >
                            <Check /> Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-destructive"
                            disabled={trabalhando === d.id}
                            onClick={() => void decidir(d, false)}
                          >
                            <X /> Recusar
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Bloco>
  );
}
