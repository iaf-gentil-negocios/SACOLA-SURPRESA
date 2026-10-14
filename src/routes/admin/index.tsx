import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { Download, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as XLSX from "xlsx";

import { Cartao } from "@/components/gerente/ComBase";
import { CabecalhoPagina, Carregando } from "@/components/layout/CabecalhoPagina";
import {
  AGUARDANDO,
  BarrasMetaVendido,
  Bloco,
  TabelaMetaRealizado,
} from "@/components/painel/Painel";
import { GraficosDeVendas } from "@/components/painel/Graficos";
import { DeclaracoesAdmin } from "@/components/vendas/Declaracoes";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { registrarAcesso } from "@/lib/auth/sessao";
import { TITULO_BASE } from "@/lib/bases/cartoes";
import { haQuanto } from "@/lib/bases/situacao";
import { useBasesDesatualizadas } from "@/lib/bases/useSituacao";
import { periodoDoCiclo, useCicloSelecionado, useCiclos } from "@/lib/ciclo";
import { useBases, useLojas } from "@/lib/dados";
import { hojeEmSaoPaulo } from "@/lib/dados/periodo";
import type { BaseDefinida } from "@/lib/dados/tipos";
import { brl0, int } from "@/lib/gerente/formato";
import { MODO_LOCAL } from "@/lib/modo-local";
import { casaBusca } from "@/lib/lojas/regras";
import { diasEntre, type CicloMotor } from "@/lib/motor/metas";
import {
  derivados,
  montarPainelAdmin,
  saudeDosAcessos,
  type LinhaLojaPainel,
  type PainelAdmin,
} from "@/lib/painel/admin";
import {
  baseDoPainel,
  useDadosDaBasePainel,
  useHierarquiaEPerfis,
  useResumoEstoque,
} from "@/lib/painel/usePainel";
import { useVendasDoCiclo } from "@/lib/vendas/usaVendas";

export const Route = createFileRoute("/admin/")({
  component: DadosGerais,
});

const admin = getRouteApi("/admin");
const data = (d: string) => d.split("-").reverse().join("/");
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : "—");
const pctDe = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

function DadosGerais() {
  const { perfil, soLeitura } = admin.useRouteContext();
  const { data: ciclos } = useCiclos();
  const [cicloId] = useCicloSelecionado(ciclos);
  const ciclo = ciclos?.find((c) => c.id === cicloId) ?? null;
  const { data: bases, isLoading } = useBases(cicloId);
  const base = useMemo(() => baseDoPainel(bases ?? []), [bases]);

  // uso: "abriu dashboard", uma vez por abertura da página
  const registrado = useRef(false);
  useEffect(() => {
    if (registrado.current || !ciclo || !bases) return;
    registrado.current = true;
    void registrarAcesso(perfil.user_id, "abriu_dashboard", {
      area: "admin",
      ciclo: ciclo.id,
      base: base?.id ?? null,
    });
  }, [perfil.user_id, ciclo, bases, base]);

  return (
    <>
      <CabecalhoPagina
        titulo="Dados gerais"
        descricao={
          ciclo
            ? `${ciclo.nome} · ${periodoDoCiclo(ciclo)} · números da base que os gerentes veem.`
            : undefined
        }
      />
      {isLoading || !ciclo ? (
        <Carregando />
      ) : !base ? (
        <div className="mb-5 rounded-2xl border border-dashed bg-card p-8 text-center text-muted-foreground">
          Nenhuma base definida no {ciclo.nome}. Defina uma base em Kits (Simular → Salvar → Definir
          como base) para ver o dashboard.
        </div>
      ) : (
        <ComBase base={base} ciclo={ciclo} soLeitura={soLeitura} />
      )}
      {!isLoading && ciclo && !base && <Saude ciclo={cicloId ?? null} faltaEstoque={null} />}
    </>
  );
}

function ComBase({
  base,
  ciclo,
  soLeitura,
}: {
  base: BaseDefinida;
  ciclo: CicloMotor;
  soLeitura: boolean;
}) {
  const diasCiclo = diasEntre(ciclo.inicio, ciclo.fim);
  const { data: lojasBase, error, isLoading } = useDadosDaBasePainel(base);
  const { data: lojas } = useLojas();
  const { data: resumo, error: erroResumo } = useResumoEstoque();
  // F2b: venda da Sacola estimada por loja no período da campanha
  const { data: vendas } = useVendasDoCiclo(ciclo);

  const painel = useMemo(
    () =>
      lojasBase && lojas
        ? montarPainelAdmin({
            lojasBase,
            cadastro: lojas,
            resumo: resumo ?? [],
            diasCiclo,
            vendas: vendas?.porLoja ?? null,
          })
        : null,
    [lojasBase, lojas, resumo, diasCiclo, vendas],
  );

  if (error)
    return <p className="mb-5 text-sm text-destructive">Falha ao ler a base: {error.message}</p>;
  if (isLoading || !painel) return <Carregando />;

  const t = painel.totais;
  const d = derivados(t, painel.semanas);
  const cadastroDe = new Map((lojas ?? []).map((l) => [l.bcps, l]));
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">
        Base <b className="text-foreground">{base.nome}</b> ({data(base.inicio)} a {data(base.fim)}
        {base.inicio > hojeEmSaoPaulo() ? " · futura: os gerentes ainda não veem" : ""}) · pode
        montar hoje{" "}
        {painel.disponivelRef
          ? `com a Cobertura de ${data(painel.disponivelRef)}`
          : "ainda sem disponibilidade gravada"}
      </p>
      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        <Cartao
          rotulo="Meta do ciclo"
          valor={brl0(t.meta)}
          detalhe={`${painel.lojas.length} lojas`}
        />
        <Cartao
          rotulo="Meta de sacolas vendidas"
          valor={int(t.sacolasMeta)}
          detalhe={`${int(t.sacolasPlanejadas)} planejadas`}
        />
        <Cartao
          rotulo="Preço médio de uma sacola"
          valor={d.precoMedio === null ? "—" : brl0(d.precoMedio)}
          detalhe="receita ÷ sacolas planejadas"
        />
        <Cartao
          rotulo="Margem média por sacola"
          valor={d.margemPorSacola === null ? "—" : brl0(d.margemPorSacola)}
          detalhe={`${pctDe(d.margemPct)} da receita`}
        />
        <Cartao
          rotulo="Margem do ciclo"
          valor={d.margemDaMeta === null ? "—" : `${brl0(d.margemDaMeta)} · ${pctDe(d.margemPct)}`}
          detalhe={`se a meta for batida · realizada: ${d.margemRealizada === null ? AGUARDANDO : brl0(d.margemRealizada)}`}
        />
      </div>

      <BarrasMetaVendido
        meta={t.meta}
        sacolasMeta={t.sacolasMeta}
        vendido={t.realizado?.vendido ?? null}
        sacolasVendidas={t.realizado?.sacolas ?? null}
        ate={vendas?.ate}
        unidades={painel.lojas.map((l) => ({
          bcps: l.bcps,
          nome: l.nome,
          meta: l.meta,
          sacolasMeta: l.sacolasMeta,
          vendido: l.realizado?.vendido ?? null,
          sacolasVendidas: l.realizado?.sacolas ?? null,
        }))}
      />

      <GraficosDeVendas
        total={t}
        pizzaPor="praça"
        fatias={painel.pracas.map((p) => ({
          chave: p.praca,
          rotulo: p.praca || "(sem praça)",
          valor: p.realizado?.vendido ?? 0,
        }))}
        lojasMapa={painel.lojas.map((l) => {
          const c = cadastroDe.get(l.bcps);
          return {
            bcps: l.bcps,
            nome: l.nome,
            cidade: c?.cidade ?? null,
            uf: c?.uf ?? null,
            meta: l.meta,
            vendido: l.realizado?.vendido ?? null,
          };
        })}
        grupos={painel.pracas.map((p) => ({
          chave: p.praca,
          rotulo: p.praca || "(sem praça)",
          numeros: p,
          linhas: p.lojas.map((l) => ({ chave: l.bcps, rotulo: l.nome, numeros: l })),
        }))}
        podeCorrigirMapa={!soLeitura}
      />

      <TabelaPracas painel={painel} base={base} />

      <DeclaracoesAdmin
        ciclo={ciclo.id}
        nomes={new Map(painel.lojas.map((l) => [l.bcps, l.nome]))}
        vendas={vendas && vendas.porLoja ? vendas : null}
        soLeitura={soLeitura}
      />

      <EstoquePorLoja painel={painel} ciclo={base.ciclo} erro={erroResumo?.message ?? null} />
      <Saude ciclo={base.ciclo} faltaEstoque={painel.faltaEstoque} />
    </>
  );
}

function TabelaPracas({ painel, base }: { painel: PainelAdmin; base: BaseDefinida }) {
  const [filtro, setFiltro] = useState("");
  const termo = filtro.trim();
  const grupos = painel.pracas
    .map((p) => ({
      ...p,
      lojas: termo
        ? p.lojas.filter((l) => casaBusca(termo, l.nome, l.nomeCompleto, l.bcps))
        : p.lojas,
    }))
    .filter((p) => !termo || p.lojas.length)
    .map((p) => ({
      chave: p.praca,
      rotulo: p.praca || "(sem praça)",
      numeros: p,
      linhas: p.lojas.map((l) => ({
        chave: l.bcps,
        rotulo: (
          <>
            <span className="font-semibold" title={l.nomeCompleto ?? undefined}>
              {l.nome}
            </span>{" "}
            <span className="text-xs text-muted-foreground">{l.bcps}</span>
          </>
        ),
        numeros: l,
      })),
    }));
  return (
    <Bloco
      titulo="Por praça e loja"
      descricao="Clique na praça para abrir as lojas. Margem = se a meta for batida. Por vendedora = meta do ciclo ÷ vendedoras. Pode montar hoje = capacidade dos kits com o estoque da última Cobertura."
      acoes={
        <div className="flex flex-wrap gap-2">
          <input
            className="h-9 rounded-md border bg-card px-3 text-sm"
            placeholder="Buscar loja (nome ou BCPS)"
            aria-label="Buscar loja pelo nome (abreviado ou completo) ou BCPS"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
          <Button variant="outline" size="sm" onClick={() => baixarExcel(painel, base)}>
            <Download /> Excel
          </Button>
        </div>
      }
    >
      <TabelaMetaRealizado
        key={termo ? "filtrada" : "todas"}
        grupos={grupos}
        comMargem
        abertos={termo ? grupos.map((g) => g.chave) : []}
      />
    </Bloco>
  );
}

function EstoquePorLoja({
  painel,
  ciclo,
  erro,
}: {
  painel: PainelAdmin;
  ciclo: number;
  erro: string | null;
}) {
  const com = painel.lojas.filter((l) => l.estoque);
  const ref = com[0]?.estoque?.ref ?? null;
  const soma = (f: (l: LinhaLojaPainel) => number) => com.reduce((s, l) => s + f(l), 0);
  const chave = String(ciclo);
  const semPromo = com.length > 0 && com.every((l) => l.estoque!.herois[chave] === undefined);
  const custo = soma((l) => l.estoque!.valorCusto);
  const parados = soma((l) => l.estoque!.paradosCusto);
  return (
    <details className="mb-5 rounded-2xl border bg-card p-4">
      <summary className="cursor-pointer font-extrabold text-ink">
        Estoque por loja{" "}
        <span className="text-xs font-normal text-muted-foreground">
          {ref ? `(Cobertura de ${data(ref)})` : "(gravado a cada Cobertura enviada em Bases)"}
        </span>
      </summary>
      <div className="mt-3">
        {erro ? (
          <p className="text-sm text-destructive">Falha ao ler o resumo de estoque: {erro}</p>
        ) : !com.length ? (
          <p className="text-sm text-muted-foreground">
            Ainda sem resumo de estoque: aparece depois da próxima Cobertura enviada.
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              Parado = cobertura ≥ dias do Motor do Mix (VMD 0 = parado). Heróis = produtos que
              passam nas travas do herói no C{ciclo}.
            </p>
            <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              <Cartao rotulo="Estoque a custo" valor={brl0(custo)} />
              <Cartao rotulo="Unidades" valor={int(soma((l) => l.estoque!.unidades))} />
              <Cartao
                rotulo="Parados (a custo)"
                valor={brl0(parados)}
                detalhe={`${pct(parados, custo)} do estoque`}
              />
              <Cartao
                rotulo="Heróis disponíveis"
                valor={semPromo ? "—" : int(soma((l) => l.estoque!.herois[chave] ?? 0))}
                detalhe={semPromo ? "ciclo sem promoção" : "soma das lojas"}
              />
            </div>
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loja</TableHead>
                    <TableHead>Praça</TableHead>
                    <TableHead className="text-right">SKUs</TableHead>
                    <TableHead className="text-right">Unidades</TableHead>
                    <TableHead className="text-right">A custo</TableHead>
                    <TableHead className="text-right">Parados (SKUs)</TableHead>
                    <TableHead className="text-right">Parados (custo)</TableHead>
                    <TableHead className="text-right">Heróis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {com.map((l) => {
                    const e = l.estoque!;
                    const h = e.herois[chave];
                    const num = "whitespace-nowrap text-right tabular-nums";
                    return (
                      <TableRow key={l.bcps}>
                        <TableCell className="font-semibold">{l.nome}</TableCell>
                        <TableCell className="whitespace-nowrap">{l.praca}</TableCell>
                        <TableCell className={num}>{int(e.skus)}</TableCell>
                        <TableCell className={num}>{int(e.unidades)}</TableCell>
                        <TableCell className={num}>{brl0(e.valorCusto)}</TableCell>
                        <TableCell className={num}>{int(e.paradosSkus)}</TableCell>
                        <TableCell className={num}>
                          {brl0(e.paradosCusto)}{" "}
                          <span className="text-xs text-muted-foreground">
                            {pct(e.paradosCusto, e.valorCusto)}
                          </span>
                        </TableCell>
                        <TableCell className={num}>{h === undefined ? "—" : int(h)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </details>
  );
}

function Saude({
  ciclo,
  faltaEstoque,
}: {
  ciclo: number | null;
  /** Lojas com sacolas planejadas abaixo da meta (null = sem base no ciclo). */
  faltaEstoque: LinhaLojaPainel[] | null;
}) {
  const { data: lojas } = useLojas();
  const { data: h, error } = useHierarquiaEPerfis();
  const desatualizadas = useBasesDesatualizadas(ciclo);
  const saude = useMemo(() => (lojas && h ? saudeDosAcessos(lojas, h) : null), [lojas, h]);
  const agora = Date.now();
  const soNuvem = MODO_LOCAL || h === null;
  return (
    <Bloco titulo="Saúde" descricao="Clique em cada item para ver a lista.">
      {error && (
        <p className="mb-2 text-sm text-destructive">Falha ao ler os acessos: {error.message}</p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <ItemSaude
          titulo="Lojas sem gerente"
          descricao="Lojas que participam sem ninguém na dGerentes"
          itens={
            soNuvem ? null : (saude?.lojasSemGerente ?? []).map((l) => `${l.nome} (${l.praca})`)
          }
        />
        <ItemSaude
          titulo="Gerentes sem loja"
          descricao="Usuários gerentes ativos sem matrícula ou com matrícula fora da hierarquia"
          itens={
            soNuvem
              ? null
              : (saude?.gerentesSemLoja ?? []).map(
                  (g) =>
                    `${g.nome} (${g.usuario}${g.matricula ? ` · ${g.matricula}` : " · sem matrícula"})`,
                )
          }
        />
        <ItemSaude
          titulo="Bases desatualizadas"
          descricao="Variáveis sem envio há mais de 24 h"
          itens={
            soNuvem
              ? null
              : desatualizadas.map(
                  (d) =>
                    `${TITULO_BASE[d.base]} — ${d.desde ? `último envio ${haQuanto(d.desde, agora)}` : "sem envio"}`,
                )
          }
        />
      </div>
      {faltaEstoque && faltaEstoque.length > 0 && (
        <div className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
          <Expansivel
            resumo={
              <span className="inline-flex items-center gap-2 font-semibold">
                <TriangleAlert className="size-4" aria-hidden />
                {faltaEstoque.length} loja(s) não alcançam a meta por falta de estoque ·{" "}
                {int(faltaEstoque.reduce((s, l) => s + l.sacolasMeta - l.sacolasPlanejadas, 0))}{" "}
                sacolas a menos
              </span>
            }
            detalhe="Sacolas planejadas abaixo da meta de sacolas: o estoque da loja não monta kits suficientes."
            itens={faltaEstoque.map(
              (l) =>
                `${l.nome} (${l.praca}): ${int(l.sacolasPlanejadas)} de ${int(l.sacolasMeta)} sacolas`,
            )}
          />
        </div>
      )}
    </Bloco>
  );
}

function ItemSaude({
  titulo,
  descricao,
  itens,
}: {
  titulo: string;
  descricao: string;
  /** null = indisponível (modo local). */
  itens: string[] | null;
}) {
  return (
    <div className="rounded-xl border px-3 py-2">
      <Expansivel
        resumo={
          <span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {titulo}
            </span>
            <span
              className={`ml-2 text-lg font-bold tabular-nums ${itens?.length ? "text-warn" : "text-ink"}`}
            >
              {itens === null ? "—" : int(itens.length)}
            </span>
          </span>
        }
        detalhe={itens === null ? "só na nuvem" : descricao}
        itens={itens ?? []}
      />
    </div>
  );
}

function Expansivel({
  resumo,
  detalhe,
  itens,
}: {
  resumo: ReactNode;
  detalhe?: string | undefined;
  itens: string[];
}) {
  return (
    <details>
      <summary className={itens.length ? "cursor-pointer" : "list-none"}>
        {resumo}
        {detalhe && <div className="text-xs text-muted-foreground">{detalhe}</div>}
      </summary>
      {itens.length > 0 && (
        <ul className="mt-2 max-h-56 overflow-auto text-sm text-muted-foreground">
          {itens.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
    </details>
  );
}

function baixarExcel(painel: PainelAdmin, base: BaseDefinida) {
  const r2 = (v: number | null) => (v === null ? "" : Math.round(v * 100) / 100);
  const numeros = (n: PainelAdmin["pracas"][number] | LinhaLojaPainel) => {
    const d = derivados(n, painel.semanas);
    return {
      "Meta (R$)": r2(n.meta),
      "Meta de sacolas": n.sacolasMeta,
      "Margem se a meta for batida": r2(d.margemDaMeta),
      "Margem %": d.margemPct === null ? "" : Math.round(d.margemPct * 1000) / 10,
      "Meta por vendedora (R$)": n.vendedoras ? r2(n.meta / n.vendedoras) : "",
      "Sacolas por vendedora (ciclo)": r2(d.sacolasPorVendedora),
      "Pode montar hoje": n.podeMontar ?? "",
      Vendedoras: n.vendedoras,
      "Venda do canal (GMV)": n.realizado ? r2(n.realizado.canal) : "",
      "Ruído descontado": n.realizado ? r2(n.realizado.ruido) : "",
      "Receita vendida (Sacola estimada)": n.realizado ? r2(n.realizado.vendido) : "",
      "Sacolas vendidas": n.realizado ? r2(n.realizado.sacolas) : "",
      "% da meta": d.pctMeta === null ? "" : Math.round(d.pctMeta * 1000) / 10,
      "Margem realizada": r2(d.margemRealizada),
    };
  };
  const pracas = painel.pracas.map((p) => ({
    Praça: p.praca,
    Lojas: p.lojas.length,
    ...numeros(p),
  }));
  const lojas = painel.lojas.map((l) => ({
    Praça: l.praca,
    Loja: l.nome,
    BCPS: l.bcps,
    ...numeros(l),
    "Estoque a custo": l.estoque ? r2(l.estoque.valorCusto) : "",
    "Parados a custo": l.estoque ? r2(l.estoque.paradosCusto) : "",
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pracas), "Praças");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lojas), "Lojas");
  XLSX.writeFile(wb, `dados-gerais_${base.nome.replace(/[^\w-]+/g, "_")}.xlsx`);
}
