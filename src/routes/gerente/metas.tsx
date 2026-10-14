import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { FiltroPraca } from "@/components/gerente/ComBase";
import { CabecalhoPagina, Carregando } from "@/components/layout/CabecalhoPagina";
import { useBaseEscolhida, useBasesGerente } from "@/lib/gerente/base";
import { brl0, int, rotuloMes } from "@/lib/gerente/formato";
import {
  tabelasDeMetas,
  type LinhaMetas,
  type NumerosMetas,
  type TabelaMetas,
} from "@/lib/gerente/metas";
import { usePainelGerente, type DadosPainelGerente } from "@/lib/gerente/painel";
import { useVendasGerente } from "@/lib/gerente/vendas";
import { useVisao } from "@/lib/gerente/visao";

// Metas (P2, 13/10/2026): duas tabelas, "Meta do mês" e "Meta do ciclo", cada uma com o seu
// realizado. Lê o mesmo resumo do Painel (uma linha por loja, sem kits nem custo).
export const Route = createFileRoute("/gerente/metas")({
  component: PaginaMetas,
});

function PaginaMetas() {
  const visao = useVisao();
  const { data: bases, isLoading } = useBasesGerente(visao);
  const [base] = useBaseEscolhida(bases);
  const { data, error, isLoading: carregando } = usePainelGerente(base, visao);
  if (isLoading || carregando) return <Carregando />;
  if (error)
    return (
      <p className="text-sm text-destructive">Falha ao carregar: {(error as Error).message}</p>
    );
  if (!bases?.length || !data)
    return (
      <div className="rounded-2xl border border-dashed bg-card p-8 text-center text-muted-foreground">
        Ainda não há base publicada para o seu escopo. Assim que o admin definir uma base, ela
        aparece aqui.
      </div>
    );
  return <Metas d={data} />;
}

const dataBr = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

function Metas({ d }: { d: DadosPainelGerente }) {
  const visao = useVisao();
  const [praca, setPraca] = useState("");
  const meses = [...new Set(d.lojas.flatMap((l) => Object.keys(l.metasMes)))].sort();
  const hojeMes = new Date().toISOString().slice(0, 7);
  const [mes, setMes] = useState(meses.includes(hojeMes) ? hojeMes : (meses[0] ?? ""));
  const { data: vendas } = useVendasGerente(d.ciclo, visao);
  const lojas = d.lojas.filter((l) => !praca || l.praca === praca);
  const ciclo = d.ciclo ?? { inicio: d.base.inicio, fim: d.base.fim };
  const t = tabelasDeMetas(lojas, ciclo, mes, vendas?.porLoja ? vendas : null);

  return (
    <>
      <CabecalhoPagina
        titulo="Metas"
        descricao={`${d.ciclo?.nome ?? `Ciclo ${d.base.ciclo}`} · a meta é do ciclo; a do mês é a parte do ciclo em cada mês (pelos dias). Realizado = venda da Sacola estimada (canal App Delivery − ruído).`}
        acoes={
          <div className="flex flex-wrap gap-2">
            <FiltroPraca pracas={d.pracas} valor={praca} aoMudar={setPraca} />
            {meses.length > 1 && (
              <select
                className="h-9 rounded-md border bg-card px-3 text-sm"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                aria-label="Mês"
              >
                {meses.map((m) => (
                  <option key={m} value={m}>
                    {rotuloMes(m)}
                  </option>
                ))}
              </select>
            )}
          </div>
        }
      />
      <QuadroMetas titulo={`Meta do mês · ${rotuloMes(mes)}`} t={t.mes} />
      <QuadroMetas titulo="Meta do ciclo" t={t.ciclo} />
    </>
  );
}

const num = "px-3 py-2 text-right tabular-nums whitespace-nowrap";
const cab = "px-3 py-2 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap";
const divisa = "border-l";

function Celulas({ n }: { n: NumerosMetas }) {
  const r = n.realizado;
  return (
    <>
      <td className={num}>{brl0(n.receita)}</td>
      <td className={num}>{int(n.sacolas)}</td>
      <td className={num}>{int(n.vendedoras)}</td>
      <td className={num}>{n.receitaPorVendedora === null ? "—" : brl0(n.receitaPorVendedora)}</td>
      <td className={num}>{n.sacolasPorVendedora === null ? "—" : int(n.sacolasPorVendedora)}</td>
      <td className={`${num} ${divisa}`}>{r ? brl0(r.receita) : "—"}</td>
      <td className={num}>{r ? int(r.sacolas) : "—"}</td>
      <td className={num}>{r && r.pct !== null ? `${Math.round(r.pct * 100)}%` : "—"}</td>
    </>
  );
}

function QuadroMetas({ titulo, t }: { titulo: string; t: TabelaMetas }) {
  const semVendas = t.total.realizado === null;
  return (
    <section className="mb-6">
      <h2 className="mb-1 font-extrabold text-ink">{titulo}</h2>
      <p className="mb-2 text-xs text-muted-foreground">
        Realizado de {dataBr(t.inicio)} a {dataBr(t.fim)}
        {semVendas ? " · aguardando vendas" : ""}. Sacolas por vendedora arredondadas para cima.
      </p>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th />
              <th colSpan={5} className="px-3 pt-2 text-center text-xs font-bold uppercase">
                Meta
              </th>
              <th
                colSpan={3}
                className={`px-3 pt-2 text-center text-xs font-bold uppercase ${divisa}`}
              >
                Realizado
              </th>
            </tr>
            <tr className="border-b">
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                Loja
              </th>
              <th className={cab}>Receita</th>
              <th className={cab}>Sacolas</th>
              <th className={cab}>Qtd. vendedoras</th>
              <th className={cab}>Receita por vendedora</th>
              <th className={cab}>Sacolas por vendedora</th>
              <th className={`${cab} ${divisa}`}>Receita</th>
              <th className={cab}>Sacolas</th>
              <th className={cab}>% da meta</th>
            </tr>
          </thead>
          <tbody>
            {t.linhas.map((l: LinhaMetas) => (
              <tr key={l.bcps} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <div className="font-semibold">{l.nome}</div>
                  <div className="text-xs text-muted-foreground">{l.praca}</div>
                </td>
                <Celulas n={l} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/40 font-bold">
              <td className="px-3 py-2">Total · {t.linhas.length} loja(s)</td>
              <Celulas n={t.total} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
