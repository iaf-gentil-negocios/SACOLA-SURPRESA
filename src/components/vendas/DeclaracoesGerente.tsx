// Declarações na área do gerente (F2b): o GVO declara as vendas das lojas dele (por dia ou por
// semana) e acompanha o status; GCVO/GPVO, GRVO e diretoria só veem. O admin aprova ou recusa.
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Bloco } from "@/components/painel/Painel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hojeEmSaoPaulo } from "@/lib/dados/periodo";
import type { DadosPainelGerente } from "@/lib/gerente/painel";
import { brl0, int } from "@/lib/gerente/formato";
import {
  apagarDeclaracao,
  declarar,
  useDeclaracoesGerente,
  useLojasGvo,
  type VendasGerente,
} from "@/lib/gerente/vendas";
import { useVisao } from "@/lib/gerente/visao";
import { MODO_LOCAL } from "@/lib/modo-local";

import { CLASSE_STATUS, comparar, fmtDesvio, ROTULO_STATUS } from "@/lib/vendas/declaracoes";

const dataBR = (d: string) => d.split("-").reverse().join("/");

export function DeclaracoesGerente({
  d,
  vendas,
}: {
  d: DadosPainelGerente;
  vendas: VendasGerente | undefined;
}) {
  const visao = useVisao();
  const queryClient = useQueryClient();
  const ciclo = d.ciclo;
  const { data: lista } = useDeclaracoesGerente(ciclo?.id ?? null, visao);
  const { data: lojasGvo } = useLojasGvo(visao);
  const minhas = d.lojas.filter((l) => lojasGvo?.includes(l.bcps));
  const nomes = new Map(d.lojas.map((l) => [l.bcps, l.nome]));
  const hoje = hojeEmSaoPaulo();
  const inicioCampanha = ciclo ? ciclo.inicioCampanha || ciclo.inicio : hoje;

  const [bcps, setBcps] = useState("");
  const [tipo, setTipo] = useState<"dia" | "semana">("dia");
  const [inicio, setInicio] = useState(hoje);
  const [sacolas, setSacolas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const loja = bcps || minhas[0]?.bcps || "";

  // preço médio dos kits da praça (no banco, calculado na hora; aqui só para o modo local e a prévia)
  const precoPraca = (() => {
    const praca = d.lojas.find((l) => l.bcps === loja)?.praca;
    const ls = d.lojas.filter((l) => l.praca === praca);
    const s = ls.reduce((a, l) => a + l.sacolasPlanejadas, 0);
    return s > 0 ? ls.reduce((a, l) => a + l.receitaPlanejada, 0) / s : 0;
  })();

  const recarregar = () =>
    queryClient.invalidateQueries({ queryKey: ["gerente", visao.userId, "declaracoes"] });

  const enviar = async () => {
    const n = Number(sacolas);
    if (!loja || !ciclo || !Number.isInteger(n) || n < 0)
      return void toast.error("Informe a loja e a quantidade de sacolas.");
    setEnviando(true);
    try {
      await declarar({ bcps: loja, ciclo: ciclo.id, tipo, inicio, sacolas: n }, precoPraca);
      toast.success("Declaração enviada. O admin vai aprovar ou recusar.");
      setSacolas("");
      await recarregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  const apagar = async (id: number) => {
    try {
      await apagarDeclaracao(id);
      await recarregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const comVendas = vendas && vendas.porLoja ? vendas : null;
  return (
    <Bloco
      titulo="Declarações de vendas"
      descricao="O GVO de cada loja declara as sacolas vendidas, por dia ou por semana; o admin aprova ou recusa. Estimativa = sacolas × preço médio dos kits da praça. O valor oficial é o do sistema."
    >
      {minhas.length > 0 && !visao.verComo && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-muted/30 p-3">
          <div className="space-y-1">
            <Label htmlFor="dec-loja">Loja</Label>
            <select
              id="dec-loja"
              className="h-9 rounded-md border bg-card px-2 text-sm"
              value={loja}
              onChange={(e) => setBcps(e.target.value)}
            >
              {minhas.map((l) => (
                <option key={l.bcps} value={l.bcps}>
                  {l.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="dec-tipo">Por</Label>
            <select
              id="dec-tipo"
              className="h-9 rounded-md border bg-card px-2 text-sm"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "dia" | "semana")}
            >
              <option value="dia">Dia</option>
              <option value="semana">Semana (7 dias a partir da data)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="dec-data">{tipo === "dia" ? "Dia" : "Início da semana"}</Label>
            <Input
              id="dec-data"
              type="date"
              className="w-40"
              min={inicioCampanha}
              max={hoje}
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dec-sacolas">Sacolas vendidas</Label>
            <Input
              id="dec-sacolas"
              type="number"
              min={0}
              className="w-28"
              value={sacolas}
              onChange={(e) => setSacolas(e.target.value)}
            />
          </div>
          <Button onClick={() => void enviar()} disabled={enviando || !sacolas}>
            {enviando ? "Enviando…" : "Declarar"}
          </Button>
          {sacolas && precoPraca > 0 && (
            <span className="text-xs text-muted-foreground">
              ≈ {brl0(Number(sacolas) * precoPraca)} (preço médio da praça {brl0(precoPraca)})
            </span>
          )}
        </div>
      )}
      {!lista?.length ? (
        <p className="text-sm text-muted-foreground">Nenhuma declaração neste ciclo.</p>
      ) : (
        <div className="max-h-96 overflow-auto rounded-xl border">
          <table className="w-full min-w-[640px] border-collapse text-sm">
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
              {lista.map((x) => {
                const c = comparar(x, comVendas);
                const minha = !visao.verComo && (MODO_LOCAL || x.userId === visao.userId);
                return (
                  <tr key={x.id} className="border-b">
                    <td className="px-3 py-2 font-semibold">{nomes.get(x.bcps) ?? x.bcps}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {x.tipo === "dia"
                        ? dataBR(x.inicio)
                        : `Semana ${dataBR(x.inicio)} a ${dataBR(x.fim)}`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{int(x.sacolas)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{brl0(c.declarado)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {c.sistema === null ? "—" : brl0(c.sistema)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtDesvio(c.desvio)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${CLASSE_STATUS[x.status]}`}
                      >
                        {ROTULO_STATUS[x.status]}
                      </span>
                      {x.motivo && (
                        <div className="mt-1 text-xs text-muted-foreground">{x.motivo}</div>
                      )}
                      {minha && x.status === "pendente" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-1 h-7 text-destructive"
                          onClick={() => void apagar(x.id)}
                          aria-label="Apagar declaração pendente"
                        >
                          <Trash2 />
                        </Button>
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
