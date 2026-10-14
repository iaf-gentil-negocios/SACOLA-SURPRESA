// Peças comuns dos dashboards (F2a, refeitos em 12/10/2026; vendas na F2b): bloco, barras
// meta × vendido e a tabela Meta | Realizado. Os gráficos de vendas ficam em Graficos.tsx.
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";

import { brl0, int } from "@/lib/gerente/formato";
import { derivados, somarMeta, type NumerosMeta } from "@/lib/painel/admin";

export const AGUARDANDO = "aguardando vendas";
const pctDe = (v: number | null) => (v === null ? "" : `${Math.round(v * 100)}%`);

export function Bloco({
  titulo,
  descricao,
  acoes,
  children,
}: {
  titulo: string;
  descricao?: string | undefined;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-5 rounded-2xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-extrabold text-ink">{titulo}</h2>
          {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
        </div>
        {acoes}
      </div>
      {children}
    </section>
  );
}

/** Uma barra contra a meta. `valor` null = ainda sem vendas. */
function Barra({
  rotulo,
  valor,
  meta,
  formato,
  grande,
}: {
  rotulo: string;
  valor: number | null;
  meta: number;
  formato: (v: number) => string;
  grande?: boolean;
}) {
  const p = valor === null || meta <= 0 ? null : Math.round((100 * valor) / meta);
  return (
    <div
      className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-center gap-3 py-1 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto]"
      title={`${rotulo}: ${valor === null ? AGUARDANDO : formato(valor)} de ${formato(meta)}`}
    >
      <span className={`truncate ${grande ? "font-bold" : "font-semibold"} text-sm`}>{rotulo}</span>
      <div
        className={`relative rounded-full bg-muted ${grande ? "h-5" : "h-3"}`}
        role="img"
        aria-label={`${rotulo}: ${p === null ? AGUARDANDO : `${p}% da meta`}`}
      >
        {p !== null && (
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: `${Math.min(p, 100)}%` }}
          />
        )}
      </div>
      <span className="col-span-2 text-right text-sm tabular-nums text-muted-foreground sm:col-span-1">
        {valor === null ? (
          <i>{AGUARDANDO}</i>
        ) : (
          <>
            {formato(valor)} · <b className="text-foreground">{p}%</b>
          </>
        )}{" "}
        de <b className="text-foreground">{formato(meta)}</b>
      </span>
    </div>
  );
}

export interface UnidadeVendida {
  bcps: string;
  nome: string;
  meta: number;
  sacolasMeta: number;
  /** null até as vendas chegarem (F2b). */
  vendido: number | null;
  sacolasVendidas: number | null;
}

/**
 * Duas barras grandes do total (R$ e sacolas). "Expandir" mostra as mesmas duas barras por unidade,
 * em ranking do maior para o menor % da meta em R$ (sem vendas: pela meta).
 */
export function BarrasMetaVendido({
  meta,
  sacolasMeta,
  vendido,
  sacolasVendidas,
  ate,
  unidades,
}: {
  meta: number;
  sacolasMeta: number;
  /** null = ainda sem vendas enviadas. */
  vendido: number | null;
  sacolasVendidas: number | null;
  /** Último dia com vendas. */
  ate?: string | null | undefined;
  unidades: UnidadeVendida[];
}) {
  const [aberto, setAberto] = useState(false);
  const pct = (u: UnidadeVendida) => (u.vendido === null || !u.meta ? -1 : u.vendido / u.meta);
  const ranking = [...unidades].sort((a, b) => pct(b) - pct(a) || b.meta - a.meta);
  const semVendas = unidades.every((u) => u.vendido === null);
  return (
    <Bloco
      titulo="Meta × vendido"
      descricao={
        semVendas
          ? "Sem vendas enviadas ainda: as barras ficam vazias."
          : `Venda da Sacola estimada (canal App Delivery − ruído)${ate ? `, até ${ate.split("-").reverse().join("/")}` : ""}.`
      }
      acoes={
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
          aria-expanded={aberto}
          onClick={() => setAberto(!aberto)}
        >
          {aberto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          {aberto ? "Recolher" : "Expandir por unidade"}
        </button>
      }
    >
      <Barra grande rotulo="Receita (R$)" valor={vendido} meta={meta} formato={brl0} />
      <Barra grande rotulo="Sacolas" valor={sacolasVendidas} meta={sacolasMeta} formato={int} />
      {aberto && (
        <div className="mt-4 border-t pt-3">
          <p className="mb-2 text-xs text-muted-foreground">
            {semVendas
              ? "Ranking pelo % da meta em R$ atingido — por enquanto, na ordem da meta."
              : "Do maior para o menor % da meta em R$ atingido."}
          </p>
          <ol className="max-h-[32rem] space-y-3 overflow-auto pr-1">
            {ranking.map((u, i) => (
              <li key={u.bcps}>
                <div className="text-sm font-bold">
                  {i + 1}. {u.nome}
                </div>
                <Barra rotulo="R$" valor={u.vendido} meta={u.meta} formato={brl0} />
                <Barra
                  rotulo="Sacolas"
                  valor={u.sacolasVendidas}
                  meta={u.sacolasMeta}
                  formato={int}
                />
              </li>
            ))}
          </ol>
        </div>
      )}
    </Bloco>
  );
}

export interface GrupoTabela {
  chave: string;
  rotulo: string;
  numeros: NumerosMeta;
  linhas: { chave: string; rotulo: ReactNode; numeros: NumerosMeta }[];
}

/**
 * Tabela por praça e loja: um quadro só, com dois grupos de colunas — Meta do ciclo (receita,
 * sacolas, margem só para o admin, meta por vendedora no ciclo e pode montar hoje) e Realizado
 * (sacolas vendidas e receita, aguardando vendas) — e o total no rodapé.
 */
export function TabelaMetaRealizado({
  grupos,
  comMargem,
  abertos: abertosIniciais = [],
}: {
  grupos: GrupoTabela[];
  comMargem: boolean;
  abertos?: string[];
}) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set(abertosIniciais));
  const alternar = (k: string) => {
    const n = new Set(abertos);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    setAbertos(n);
  };
  const total = somarMeta(grupos.map((g) => g.numeros));
  const temVendas = grupos.some((g) => g.numeros.realizado);
  const lojas = grupos.reduce((s, g) => s + g.linhas.length, 0);

  // primeira coluna presa à esquerda (rolagem lateral no celular); divisória fina entre os grupos
  const prima = "sticky left-0 z-10 bg-inherit";
  const num = "px-3 py-2 text-right tabular-nums whitespace-nowrap";
  const divisa = "border-l border-border";
  const celulas = (n: NumerosMeta) => {
    const d = derivados(n, 1);
    return (
      <>
        <td className={num}>{brl0(n.meta)}</td>
        <td className={num}>{int(n.sacolasMeta)}</td>
        {comMargem && (
          <td className={num}>
            {d.margemDaMeta === null ? "—" : brl0(d.margemDaMeta)}
            {d.margemPct !== null && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {Math.round(d.margemPct * 100)}%
              </span>
            )}
          </td>
        )}
        <td
          className={num}
          title={n.vendedoras > 0 ? `${int(n.vendedoras)} vendedora(s)` : "sem vendedoras"}
        >
          {n.vendedoras > 0 ? (
            <>
              {brl0(n.meta / n.vendedoras)}
              <span className="ml-1.5 text-[11px] text-muted-foreground">
                {int(Math.ceil(n.sacolasMeta / n.vendedoras - 1e-9))} sac.
              </span>
            </>
          ) : (
            "—"
          )}
        </td>
        <td className={num}>{n.podeMontar === null ? "—" : int(n.podeMontar)}</td>
        <td className={`${num} ${divisa}`}>
          {n.realizado ? (
            <>
              {int(n.realizado.sacolas)}
              <span className="ml-1.5 text-[11px] text-muted-foreground">
                {pctDe(d.pctSacolas)}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className={num}>
          {n.realizado ? (
            <>
              {brl0(n.realizado.vendido)}
              <span className="ml-1.5 text-[11px] text-muted-foreground">{pctDe(d.pctMeta)}</span>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
      </>
    );
  };
  const colsMeta = comMargem ? 5 : 4;
  const cab = "px-3 pb-2 pt-1 text-right text-xs font-semibold text-muted-foreground";
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead className="bg-card">
          <tr>
            <th className={`${prima} bg-card`} />
            <th colSpan={colsMeta} className="px-3 pt-3 text-left">
              <div className="border-b-2 border-primary pb-1 text-xs font-extrabold uppercase tracking-wider text-ink">
                Meta do ciclo
              </div>
            </th>
            <th colSpan={2} className={`px-3 pt-3 text-left ${divisa}`}>
              <div className="border-b-2 border-muted-foreground/40 pb-1 text-xs font-extrabold uppercase tracking-wider text-ink">
                Realizado{" "}
                <span className="font-normal normal-case tracking-normal text-muted-foreground">
                  · {temVendas ? "venda da Sacola estimada" : AGUARDANDO}
                </span>
              </div>
            </th>
          </tr>
          <tr className="border-b">
            <th
              className={`${prima} bg-card px-3 pb-2 pt-1 text-left text-xs font-semibold text-muted-foreground`}
            >
              Praça / loja
            </th>
            <th className={cab}>Receita</th>
            <th className={cab}>Sacolas</th>
            {comMargem && <th className={cab}>Margem</th>}
            <th className={cab}>Por vendedora</th>
            <th className={cab}>Pode montar hoje</th>
            <th className={`${cab} ${divisa}`}>Sacolas vendidas</th>
            <th className={cab}>Receita</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => {
            const aberto = abertos.has(g.chave);
            return (
              <Fragment key={g.chave}>
                <tr
                  className="cursor-pointer border-b bg-muted/50 font-semibold hover:bg-muted"
                  onClick={() => alternar(g.chave)}
                  aria-expanded={aberto}
                >
                  <td className={`${prima} whitespace-nowrap px-3 py-2`}>
                    <span className="inline-flex items-center gap-1.5">
                      {aberto ? (
                        <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
                      ) : (
                        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                      )}
                      {g.rotulo}
                      <span className="text-xs font-normal text-muted-foreground">
                        {g.linhas.length} {g.linhas.length === 1 ? "loja" : "lojas"}
                      </span>
                    </span>
                  </td>
                  {celulas(g.numeros)}
                </tr>
                {aberto &&
                  g.linhas.map((l) => (
                    <tr key={l.chave} className="border-b bg-card hover:bg-muted/30">
                      <td className={`${prima} py-2 pl-9 pr-3`}>{l.rotulo}</td>
                      {celulas(l.numeros)}
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
        {grupos.length > 1 && (
          <tfoot>
            <tr className="border-t-2 bg-card font-bold">
              <td className={`${prima} whitespace-nowrap px-3 py-2`}>
                Total{" "}
                <span className="text-xs font-normal text-muted-foreground">{lojas} lojas</span>
              </td>
              {celulas(total)}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
