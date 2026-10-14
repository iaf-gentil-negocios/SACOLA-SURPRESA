import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Cartao, ComBase, FiltroPraca } from "@/components/gerente/ComBase";
import { brl, brl0, int } from "@/lib/gerente/formato";
import { CabecalhoPagina } from "@/components/layout/CabecalhoPagina";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { filtrarPorPraca, type DadosBase } from "@/lib/gerente/base";
import { simularComEstoque, useEstoqueDosKits } from "@/lib/gerente/estoque";
import { useVisao } from "@/lib/gerente/visao";
import { NOME_TEMA } from "@/lib/motor/temas";

// Simulador por kits (P4, 13/10/2026): uma loja por vez; a quantidade que dá para montar fica
// limitada pelo estoque da loja (última Cobertura), compartilhado entre os kits. O estoque é lido
// uma vez e as contas rodam no navegador; a tela não mostra a quantidade em estoque.
export const Route = createFileRoute("/gerente/simulador-kits")({
  component: () => <ComBase>{(d) => <SimuladorKits d={d} />}</ComBase>,
});

interface Linha {
  id: number;
  codigo: string;
  qtd: number;
}

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

function SimuladorKits({ d }: { d: DadosBase }) {
  const visao = useVisao();
  const { data: estoques, isLoading } = useEstoqueDosKits(d.base, visao);
  const [praca, setPraca] = useState("");
  const lojas = filtrarPorPraca(d.lojas, praca);
  const [bcpsEscolhida, setBcps] = useState("");
  const loja = lojas.find((l) => l.bcps === bcpsEscolhida) ?? lojas[0];
  const bcps = loja?.bcps ?? "";
  // kits da loja escolhida
  const kits = useMemo(
    () => d.kits.filter((k) => k.lojas.some((l) => l.bcps === bcps)),
    [d.kits, bcps],
  );
  const [linhas, setLinhas] = useState<Linha[]>([{ id: 1, codigo: "", qtd: 0 }]);
  const estoque = estoques?.get(bcps) ?? null;
  const resultado = estoque ? simularComEstoque(kits, linhas, estoque.estoque) : null;

  const preco = (codigo: string) => kits.find((k) => k.codigo === codigo)?.preco ?? 0;
  const montaveis = (i: number) =>
    resultado ? resultado[i]!.montaveis : linhas[i]!.codigo ? linhas[i]!.qtd : 0;
  const receita = linhas.reduce((s, l, i) => s + preco(l.codigo) * montaveis(i), 0);
  const sacolas = linhas.reduce((s, _, i) => s + montaveis(i), 0);
  const meta = loja?.meta ?? 0;
  const mudar = (id: number, campo: Partial<Linha>) =>
    setLinhas(linhas.map((l) => (l.id === id ? { ...l, ...campo } : l)));
  const trocarLoja = (b: string) => {
    setBcps(b);
    setLinhas([{ id: 1, codigo: "", qtd: 0 }]);
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Simulador por kits"
        descricao="Escolha a loja, os kits e as quantidades. O que dá para montar fica limitado pelo estoque da loja (última Cobertura), dividido entre os kits na ordem das linhas."
        acoes={
          <div className="flex flex-wrap gap-2">
            <FiltroPraca
              pracas={d.pracas}
              valor={praca}
              aoMudar={(v) => {
                setPraca(v);
                trocarLoja("");
              }}
            />
            <select
              className="h-9 rounded-md border bg-card px-3 text-sm"
              aria-label="Loja"
              value={bcps}
              onChange={(e) => trocarLoja(e.target.value)}
            >
              {lojas.map((l) => (
                <option key={l.bcps} value={l.bcps}>
                  {l.nome}
                </option>
              ))}
            </select>
          </div>
        }
      />
      {!isLoading && !estoque && (
        <p className="mb-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
          Ainda não há estoque do dia para esta loja: a simulação fica sem o limite do estoque.
        </p>
      )}
      {estoque?.ref && (
        <p className="mb-3 text-xs text-muted-foreground">
          Estoque da Cobertura de {dataBr(estoque.ref)}.
        </p>
      )}
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Cartao rotulo="Receita" valor={brl0(receita)} detalhe="do que dá para montar" />
        <Cartao rotulo="Sacolas" valor={int(sacolas)} detalhe="que dá para montar" />
        <Cartao
          rotulo="% da meta do ciclo"
          valor={meta ? `${Math.round((100 * receita) / meta)}%` : "—"}
          detalhe={`meta da loja ${brl0(meta)}`}
        />
        <Cartao
          rotulo={meta - receita > 0 ? "Falta" : "Sobra"}
          valor={brl0(Math.abs(meta - receita))}
        />
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kit</TableHead>
              <TableHead className="text-right">Preço</TableHead>
              <TableHead className="text-right">Quantidade</TableHead>
              <TableHead className="text-right">Dá para montar</TableHead>
              <TableHead>Limitado por</TableHead>
              <TableHead className="text-right">Receita</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l, i) => {
              const r = resultado?.[i];
              return (
                <TableRow key={l.id}>
                  <TableCell>
                    <select
                      className="h-9 w-full max-w-md rounded-md border bg-card px-2 text-sm"
                      aria-label="Kit"
                      value={l.codigo}
                      onChange={(e) => mudar(l.id, { codigo: e.target.value })}
                    >
                      <option value="">Escolha um kit…</option>
                      {kits.map((k) => (
                        <option key={k.codigo} value={k.codigo}>
                          {k.codigo} · {NOME_TEMA[k.tema] ?? k.tema} · {brl(k.preco)} ·{" "}
                          {k.itens.find((x) => x.papel === "heroi")?.descricao ?? ""}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.codigo ? brl(preco(l.codigo)) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      className="ml-auto h-8 w-24 text-right"
                      type="number"
                      min={0}
                      aria-label="Quantidade"
                      value={l.qtd || ""}
                      placeholder="0"
                      onChange={(e) =>
                        mudar(l.id, { qtd: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
                      }
                    />
                  </TableCell>
                  <TableCell
                    className={`text-right font-semibold tabular-nums ${r && r.montaveis < l.qtd ? "text-destructive" : ""}`}
                  >
                    {!l.codigo ? "—" : r ? int(r.montaveis) : int(l.qtd)}
                    {r && l.codigo && r.maisPossiveis > 0 && (
                      <div className="text-[11px] font-normal text-muted-foreground">
                        dá mais {int(r.maisPossiveis)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="max-w-56 text-sm">
                    {r?.limitante ? (
                      <span title={r.limitante.sku}>{r.limitante.descricao}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {brl0(preco(l.codigo) * montaveis(i))}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Remover linha"
                      onClick={() =>
                        setLinhas(
                          linhas.length > 1
                            ? linhas.filter((x) => x.id !== l.id)
                            : [{ id: l.id, codigo: "", qtd: 0 }],
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Button
        variant="outline"
        className="mt-3"
        onClick={() =>
          setLinhas([
            ...linhas,
            { id: Math.max(...linhas.map((x) => x.id)) + 1, codigo: "", qtd: 0 },
          ])
        }
      >
        <Plus /> Adicionar kit
      </Button>
    </>
  );
}
