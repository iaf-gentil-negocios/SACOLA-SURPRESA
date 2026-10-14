import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ComBase, FiltroPraca } from "@/components/gerente/ComBase";
import { brl, int } from "@/lib/gerente/formato";
import { CabecalhoPagina } from "@/components/layout/CabecalhoPagina";
import { Button } from "@/components/ui/button";
import { registrarAcesso } from "@/lib/auth/sessao";
import type { DadosBase } from "@/lib/gerente/base";
import { baixarExcel } from "@/lib/gerente/excel";
import { useVisao } from "@/lib/gerente/visao";
import { NOME_TEMA, opcoesDeTema } from "@/lib/motor/temas";

export const Route = createFileRoute("/gerente/kits")({
  component: PaginaKits,
});

function PaginaKits() {
  // "Ver como gerente" (admin) não registra acessos em nome do gerente
  const visao = useVisao();
  const registrar = visao.verComo ? null : visao.userId;
  return <ComBase>{(d) => <Kits d={d} userId={registrar} />}</ComBase>;
}

const dataBR = (d: string) => d.split("-").reverse().join("/");

const PAPEL: Record<string, string> = { heroi: "Herói", surpresa: "Surpresa", mimo: "Mimo" };

function Kits({ d, userId }: { d: DadosBase; userId: string | null }) {
  const [praca, setPraca] = useState("");
  const [loja, setLoja] = useState("");
  const [tema, setTema] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    if (userId) void registrarAcesso(userId, "abriu_kits", { base: d.base.id });
  }, [userId, d.base.id]);

  const nomeLoja = useMemo(() => new Map(d.lojas.map((l) => [l.bcps, l])), [d]);
  const lojasFiltro = d.lojas.filter((l) => !praca || l.praca === praca);
  const valeLoja = (bcps: string) =>
    (!praca || nomeLoja.get(bcps)?.praca === praca) && (!loja || bcps === loja);
  const kits = d.kits
    .map((k) => ({
      ...k,
      qtdEscopo: k.lojas.filter((l) => valeLoja(l.bcps)).reduce((s, l) => s + l.qtd, 0),
    }))
    .filter((k) => k.qtdEscopo > 0 && (!tema || k.tema === tema));

  const exportar = () => {
    baixarExcel(d);
    if (userId) void registrarAcesso(userId, "exportou_excel", { base: d.base.id });
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Kits"
        descricao={`${d.base.nome} · ${int(kits.length)} kits`}
        acoes={
          <Button onClick={exportar}>
            <Download /> Exportar Excel
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <FiltroPraca pracas={d.pracas} valor={praca} aoMudar={(v) => (setPraca(v), setLoja(""))} />
        <select
          className="h-9 rounded-md border bg-card px-3 text-sm"
          value={loja}
          onChange={(e) => setLoja(e.target.value)}
        >
          <option value="">Todas as lojas</option>
          {lojasFiltro.map((l) => (
            <option key={l.bcps} value={l.bcps}>
              {l.nome}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border bg-card px-3 text-sm"
          value={tema}
          onChange={(e) => setTema(e.target.value)}
        >
          <option value="">Todos os temas</option>
          {opcoesDeTema(d.kits.map((k) => k.tema)).map(([k, n]) => (
            <option key={k} value={k}>
              {n}
            </option>
          ))}
        </select>
      </div>
      {d.disponivelRef && (
        <div className="mb-4 rounded-xl border bg-card px-3 py-2 text-sm">
          <div className="text-xs font-semibold text-muted-foreground">
            Disponibilidade com o estoque de {dataBR(d.disponivelRef)} · os kits dividem produtos
          </div>
          <ul className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
            {lojasFiltro
              .filter((l) => !loja || l.bcps === loja)
              .filter((l) => d.capacidadeLoja[l.bcps] !== undefined)
              .map((l) => (
                <li key={l.bcps}>
                  {l.nome}: no total dá para montar <b>{int(d.capacidadeLoja[l.bcps]!)}</b>
                </li>
              ))}
          </ul>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kits.map((k) => {
          const heroi = k.itens.find((i) => i.papel === "heroi");
          const comDado = k.lojas.filter((l) => valeLoja(l.bcps) && l.disponivel !== null);
          const pode = comDado.reduce((s, l) => s + l.disponivel!, 0);
          return (
            <div key={k.codigo} className="rounded-2xl border bg-card p-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-extrabold text-ink">{k.codigo}</div>
                  <div className="text-muted-foreground">{NOME_TEMA[k.tema] ?? k.tema}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-extrabold text-ink">{brl(k.preco)}</div>
                  <div className="text-xs text-muted-foreground">
                    <s>{brl(k.valorCheio)}</s> · {k.descontoPct.toLocaleString("pt-BR")}% off
                  </div>
                </div>
              </div>
              <div className="mt-2 line-clamp-2">Herói: {heroi?.descricao}</div>
              <div className="mt-1 text-xs font-semibold text-muted-foreground">
                {int(k.qtdEscopo)} sacolas no filtro
              </div>
              {comDado.length > 0 && (
                <div
                  className={`mt-0.5 text-xs font-semibold ${pode === 0 ? "text-destructive" : "text-success-foreground"}`}
                >
                  {pode === 0 ? "Indisponível hoje" : `Pode montar ${int(pode)} hoje`}
                </div>
              )}
              <button
                className="mt-2 text-xs font-semibold text-chip-foreground hover:underline"
                onClick={() => setAberto(aberto === k.codigo ? null : k.codigo)}
              >
                {aberto === k.codigo ? "Fechar" : "Ver produtos e lojas"}
              </button>
              {aberto === k.codigo && (
                <div className="mt-2 space-y-2">
                  <ul className="space-y-1">
                    {k.itens.map((i) => (
                      <li key={i.ordem} className="rounded-lg bg-muted px-2 py-1">
                        <b className="mr-1 text-xs">{PAPEL[i.papel]}</b>
                        {i.sku} · {i.descricao} · 1 un.
                      </li>
                    ))}
                  </ul>
                  <ul className="text-xs text-muted-foreground">
                    {k.lojas
                      .filter((l) => valeLoja(l.bcps))
                      .map((l) => (
                        <li key={l.bcps}>
                          {nomeLoja.get(l.bcps)?.nome ?? l.bcps}: {int(l.qtd)} sacolas
                          {l.disponivel !== null &&
                            (l.disponivel === 0
                              ? " · indisponível hoje"
                              : ` · pode montar ${int(l.disponivel)}`)}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!kits.length && (
        <p className="text-sm text-muted-foreground">Nenhum kit para o filtro escolhido.</p>
      )}
    </>
  );
}
