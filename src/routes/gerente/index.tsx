import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { Cartao, FiltroPraca } from "@/components/gerente/ComBase";
import { CabecalhoPagina, Carregando } from "@/components/layout/CabecalhoPagina";
import { BarrasMetaVendido, Bloco, TabelaMetaRealizado } from "@/components/painel/Painel";
import { GraficosDeVendas } from "@/components/painel/Graficos";
import { DeclaracoesGerente } from "@/components/vendas/DeclaracoesGerente";
import { registrarAcesso } from "@/lib/auth/sessao";
import { useBaseEscolhida, useBasesGerente } from "@/lib/gerente/base";
import { brl0, int, rotuloMes } from "@/lib/gerente/formato";
import { usePainelGerente, type DadosPainelGerente } from "@/lib/gerente/painel";
import { useVendasGerente } from "@/lib/gerente/vendas";
import { useVisao } from "@/lib/gerente/visao";
import { useVeMapaGerente } from "@/lib/mapa/useVeMapa";
import { derivados } from "@/lib/painel/admin";
import { montarPainelGerente } from "@/lib/painel/gerente";

// Painel do gerente (F2a, refeito em 12/10/2026): a primeira tela, com a estrutura do dashboard
// do admin, só com as lojas do escopo e sem custo nem margem. Lê uma linha por loja (somada no
// banco); os kits só são baixados em Kits e no Simulador por kits.
export const Route = createFileRoute("/gerente/")({
  component: PainelDoGerente,
});

const umaCasa = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function PainelDoGerente() {
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
  return <Painel d={data} />;
}

function Painel({ d }: { d: DadosPainelGerente }) {
  const visao = useVisao();
  const { perfil } = useRouteContext({ from: "/gerente" });
  // P3: o mapa só para os perfis da lista em src/lib/mapa/acesso.ts (o GVO não vê)
  const { data: mostrarMapa = false } = useVeMapaGerente(visao, perfil);
  const [praca, setPraca] = useState("");
  const meses = [...new Set(d.lojas.flatMap((l) => Object.keys(l.metasMes)))].sort();
  const hojeMes = new Date().toISOString().slice(0, 7);
  const [mes, setMes] = useState(meses.includes(hojeMes) ? hojeMes : (meses[0] ?? ""));
  // F2b: venda da Sacola estimada das lojas do escopo
  const { data: vendas } = useVendasGerente(d.ciclo, visao);
  const porLoja = vendas?.porLoja ?? null;
  const p = montarPainelGerente(d, mes, praca, porLoja);
  const t = p.totais;
  const dt = derivados(t, p.semanas);

  // uso: "abriu dashboard", uma vez por abertura da página (o "Ver como" não registra)
  const registrado = useRef(false);
  useEffect(() => {
    if (registrado.current || visao.verComo) return;
    registrado.current = true;
    void registrarAcesso(visao.userId, "abriu_dashboard", { area: "gerente", base: d.base.id });
  }, [visao, d.base.id]);

  // por praça quando o escopo tem mais de uma; com uma só (ou filtrada), direto por loja
  const porPraca = d.pracas.length > 1 && !praca;
  const linha = (l: (typeof p.lojas)[number]) => ({
    chave: l.bcps,
    rotulo: <span className="font-semibold">{l.nome}</span>,
    numeros: l,
  });
  const grupos = porPraca
    ? d.pracas.map((pr) => ({
        chave: pr,
        rotulo: pr,
        numeros: montarPainelGerente(d, mes, pr, porLoja).totais,
        linhas: p.lojas.filter((l) => l.praca === pr).map(linha),
      }))
    : [
        {
          chave: praca || d.pracas[0] || "escopo",
          rotulo: praca || d.pracas[0] || "Suas lojas",
          numeros: t,
          linhas: p.lojas.map(linha),
        },
      ];

  return (
    <>
      <CabecalhoPagina
        titulo="Painel"
        descricao={`${d.ciclo?.nome ?? `Ciclo ${d.base.ciclo}`} · ${
          d.disponivelRef
            ? `"pode montar" com o estoque de ${d.disponivelRef.split("-").reverse().join("/")}`
            : `"pode montar" ainda sem estoque do dia`
        }`}
        acoes={
          <div className="flex flex-wrap gap-2">
            <FiltroPraca pracas={d.pracas} valor={praca} aoMudar={setPraca} />
            {meses.length > 1 && (
              <select
                className="h-9 rounded-md border bg-card px-3 text-sm"
                aria-label="Mês"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
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
      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Cartao rotulo="Meta do ciclo" valor={brl0(t.meta)} detalhe={`${p.lojas.length} loja(s)`} />
        <Cartao
          rotulo={`Meta de ${mes ? rotuloMes(mes) : "mês"}`}
          valor={brl0(t.metaMes)}
          detalhe="parte deste ciclo no mês"
        />
        <Cartao
          rotulo="Meta de sacolas vendidas"
          valor={int(t.sacolasMeta)}
          detalhe={`${umaCasa(dt.sacolasPorVendedoraSemana)} por vendedora/semana`}
        />
        <Cartao
          rotulo="Preço médio de uma sacola"
          valor={dt.precoMedio === null ? "—" : brl0(dt.precoMedio)}
          detalhe="dos kits planejados"
        />
      </div>

      <BarrasMetaVendido
        meta={t.meta}
        sacolasMeta={t.sacolasMeta}
        vendido={t.realizado?.vendido ?? null}
        sacolasVendidas={t.realizado?.sacolas ?? null}
        ate={vendas?.ate}
        unidades={p.lojas.map((l) => ({
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
        pizzaPor={porPraca ? "praça" : "loja"}
        fatias={
          porPraca
            ? grupos.map((g) => ({
                chave: g.chave,
                rotulo: g.rotulo,
                valor: g.numeros.realizado?.vendido ?? 0,
              }))
            : p.lojas.map((l) => ({
                chave: l.bcps,
                rotulo: l.nome,
                valor: l.realizado?.vendido ?? 0,
              }))
        }
        lojasMapa={p.lojas.map((l) => {
          const c = d.lojas.find((x) => x.bcps === l.bcps);
          return {
            bcps: l.bcps,
            nome: l.nome,
            cidade: c?.cidade ?? null,
            uf: c?.uf ?? null,
            meta: l.meta,
            vendido: l.realizado?.vendido ?? null,
          };
        })}
        grupos={grupos}
        podeCorrigirMapa={false}
        mostrarMapa={mostrarMapa}
      />

      <Bloco
        titulo={porPraca ? "Por praça e loja" : "Por loja"}
        descricao="Pode montar hoje = quantas sacolas os kits da loja montam com o estoque do dia."
      >
        <TabelaMetaRealizado
          key={`${praca}|${mes}`}
          grupos={grupos}
          comMargem={false}
          abertos={porPraca ? [] : grupos.map((g) => g.chave)}
        />
      </Bloco>

      <DeclaracoesGerente d={d} vendas={vendas} />
    </>
  );
}
