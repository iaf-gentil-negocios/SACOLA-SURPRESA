import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Cartao, ComBase, FiltroPraca } from "@/components/gerente/ComBase";
import { brl0, int } from "@/lib/gerente/formato";
import { CabecalhoPagina } from "@/components/layout/CabecalhoPagina";
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
import { filtrarPorPraca, type DadosBase } from "@/lib/gerente/base";
import { diasEntre } from "@/lib/motor/metas";

export const Route = createFileRoute("/gerente/simulador-vendas")({
  component: () => <ComBase>{(d) => <SimuladorVendas d={d} />}</ComBase>,
});

/** Preço médio dos kits do escopo, pesado pela quantidade de sacolas. */
function precoMedio(d: DadosBase, bcps: Set<string>) {
  let soma = 0;
  let qtd = 0;
  for (const k of d.kits)
    for (const l of k.lojas)
      if (bcps.has(l.bcps)) {
        soma += k.preco * l.qtd;
        qtd += l.qtd;
      }
  return qtd ? soma / qtd : 189.9;
}

const cor = (p: number) =>
  p >= 1 ? "text-success-foreground" : p >= 0.8 ? "text-warn" : "text-destructive";

function SimuladorVendas({ d }: { d: DadosBase }) {
  const [praca, setPraca] = useState("");
  const lojas = filtrarPorPraca(d.lojas, praca);
  const totalVendedoras = lojas.reduce((s, l) => s + l.vendedoras, 0);
  const meta = lojas.reduce((s, l) => s + l.meta, 0);
  const semanas = d.ciclo ? diasEntre(d.ciclo.inicio, d.ciclo.fim) / 7 : 1;
  const medio = precoMedio(d, new Set(lojas.map((l) => l.bcps)));

  const [vendasSemana, setVendasSemana] = useState(4);
  const [vendedoras, setVendedoras] = useState<number | null>(null);
  const [preco, setPreco] = useState<number | null>(null);
  const [porLoja, setPorLoja] = useState<Record<string, number>>({});

  const v = vendedoras ?? totalVendedoras;
  const p = preco ?? Math.round(medio * 100) / 100;
  const sacolas = vendasSemana * v * semanas;
  const receita = sacolas * p;
  const falta = meta - receita;
  const necessarias = v && p ? meta / (p * v * semanas) : 0;

  return (
    <>
      <CabecalhoPagina
        titulo="Simulador por vendas"
        descricao={`${d.ciclo?.nome ?? ""}: ${semanas.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} semanas. Simule quantas sacolas cada vendedora vende por semana.`}
        acoes={<FiltroPraca pracas={d.pracas} valor={praca} aoMudar={setPraca} />}
      />
      <div className="mb-4 flex flex-wrap gap-4 rounded-2xl border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor="vs">Vendas por vendedora por semana</Label>
          <Input
            id="vs"
            type="number"
            min={0}
            step="0.5"
            className="w-36"
            value={vendasSemana}
            onChange={(e) => setVendasSemana(Number(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vv">Vendedoras vendendo</Label>
          <Input
            id="vv"
            type="number"
            min={0}
            className="w-36"
            value={v}
            onChange={(e) => setVendedoras(Number(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pm">Preço médio da sacola (R$)</Label>
          <Input
            id="pm"
            type="number"
            min={0}
            step="0.01"
            className="w-36"
            value={p}
            onChange={(e) => setPreco(Number(e.target.value) || 0)}
          />
        </div>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Cartao rotulo="Receita" valor={brl0(receita)} />
        <Cartao rotulo="Sacolas" valor={int(sacolas)} />
        <Cartao
          rotulo="% da meta do ciclo"
          valor={meta ? `${Math.round((100 * receita) / meta)}%` : "—"}
          detalhe={`meta ${brl0(meta)}`}
        />
        <Cartao rotulo={falta > 0 ? "Falta" : "Sobra"} valor={brl0(Math.abs(falta))} />
        <Cartao
          rotulo="Vendas necessárias"
          valor={necessarias.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
          detalhe="por vendedora por semana"
        />
      </div>

      <h2 className="mb-2 font-extrabold text-ink">Por loja</h2>
      <p className="mb-2 text-sm text-muted-foreground">
        Digite quantas sacolas cada loja deve vender no ciclo (verde ≥ 100% da meta, amarelo ≥ 80%,
        vermelho &lt; 80%).
      </p>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loja</TableHead>
              <TableHead className="text-right">Meta do ciclo</TableHead>
              <TableHead className="text-right">Sacolas estimadas</TableHead>
              <TableHead className="text-right">Receita</TableHead>
              <TableHead className="text-right">% da meta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lojas.map((l) => {
              const s = porLoja[l.bcps] ?? 0;
              const r = s * p;
              const pc = l.meta ? r / l.meta : 0;
              return (
                <TableRow key={l.bcps}>
                  <TableCell className="font-semibold">{l.nome}</TableCell>
                  <TableCell className="text-right tabular-nums">{brl0(l.meta)}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      className="ml-auto h-8 w-24 text-right"
                      type="number"
                      min={0}
                      value={s || ""}
                      placeholder="0"
                      onChange={(e) =>
                        setPorLoja({ ...porLoja, [l.bcps]: Number(e.target.value) || 0 })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{brl0(r)}</TableCell>
                  <TableCell className={`text-right font-semibold tabular-nums ${cor(pc)}`}>
                    {l.meta ? `${Math.round(pc * 100)}%` : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
