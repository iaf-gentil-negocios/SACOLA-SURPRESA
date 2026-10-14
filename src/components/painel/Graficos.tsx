// Gráficos das vendas (F2b): pizza da receita vendida, velocímetro da meta do ciclo, mapa do Nordeste
// e tabela de vendas por praça e unidade. Sem vendas enviadas, cada um mostra "aguardando vendas".
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Gauge, Map as MapaIcone, PieChart, Table2 } from "lucide-react";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHAVES, repositorio } from "@/lib/dados";
import { brl0, int } from "@/lib/gerente/formato";
import { CHAVE_LOJAS_COMPLETAS } from "@/lib/lojas/lojas";
import {
  agruparPorMunicipio,
  chaveDoMunicipio,
  corDoPct,
  ESCALA_MAPA,
  projetar,
  type LojaNoMapa,
} from "@/lib/mapa/mapa";
import { derivados, type NumerosMeta } from "@/lib/painel/admin";

import { AGUARDANDO } from "./Painel";
const pct0 = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

/** Paleta categórica de referência (8 cores, validada para setores vizinhos), na ordem fixa. */
const CORES = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
];

function Cartao({
  titulo,
  icone,
  children,
  className = "",
}: {
  titulo: string;
  icone: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-h-48 flex-col rounded-2xl border bg-card p-4 ${className}`}>
      <div className="mb-2 flex items-center gap-2 font-extrabold text-ink">
        {icone}
        {titulo}
      </div>
      {children}
    </div>
  );
}

const Aguardando = ({ texto }: { texto: string }) => (
  <>
    <p className="text-xs text-muted-foreground">{texto}</p>
    <div className="mt-auto pt-3 text-sm italic text-muted-foreground">{AGUARDANDO}</div>
  </>
);

export interface Fatia {
  chave: string;
  rotulo: string;
  valor: number;
}

/** Pizza (rosca) da participação na receita vendida; cor fixa por entidade (ordem alfabética). */
function Pizza({ fatias }: { fatias: Fatia[] }) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  const cor = new Map(
    [...fatias]
      .sort((a, b) => a.chave.localeCompare(b.chave))
      .map((f, i) => [f.chave, CORES[i % CORES.length]!]),
  );
  const visiveis = fatias.filter((f) => f.valor > 0).sort((a, b) => b.valor - a.valor);
  if (total <= 0)
    return <p className="mt-auto text-sm text-muted-foreground">Sem venda no período ainda.</p>;
  let ang = -Math.PI / 2;
  const arco = (v: number) => {
    const a0 = ang;
    const a1 = ang + (2 * Math.PI * v) / total;
    ang = a1;
    const grande = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a: number, r: number) => `${60 + r * Math.cos(a)} ${60 + r * Math.sin(a)}`;
    if (visiveis.length === 1)
      return "M 60 10 A 50 50 0 1 1 59.99 10 L 59.99 30 A 30 30 0 1 0 60 30 Z";
    return `M ${p(a0, 50)} A 50 50 0 ${grande} 1 ${p(a1, 50)} L ${p(a1, 30)} A 30 30 0 ${grande} 0 ${p(a0, 30)} Z`;
  };
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg
        viewBox="0 0 120 120"
        className="w-32 flex-none"
        role="img"
        aria-label="Participação na receita vendida"
      >
        {visiveis.map((f) => (
          <path
            key={f.chave}
            d={arco(f.valor)}
            fill={cor.get(f.chave)}
            stroke="var(--card)"
            strokeWidth={2}
          >
            <title>
              {f.rotulo}: {brl0(f.valor)} ({pct0(f.valor / total)})
            </title>
          </path>
        ))}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1 text-xs">
        {visiveis.map((f) => (
          <li key={f.chave} className="flex items-center gap-2">
            <span
              className="size-2.5 flex-none rounded-sm"
              style={{ background: cor.get(f.chave) }}
            />
            <span className="truncate">{f.rotulo}</span>
            <span className="ml-auto tabular-nums text-muted-foreground">
              {pct0(f.valor / total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Velocímetro do % da meta do ciclo atingido (o arco passa de 100% até 150%). */
function Velocimetro({ pct, vendido, meta }: { pct: number; vendido: number; meta: number }) {
  const max = 1.5;
  const fr = Math.min(Math.max(pct, 0), max) / max;
  const a = Math.PI * (1 - fr);
  const ponta = `${60 + 50 * Math.cos(a)} ${60 - 50 * Math.sin(a)}`;
  const a100 = Math.PI * (1 - 1 / max);
  return (
    <>
      <svg
        viewBox="0 0 120 70"
        className="mx-auto w-44"
        role="img"
        aria-label={`${pct0(pct)} da meta do ciclo`}
      >
        <path
          d="M10 60 A50 50 0 0 1 110 60"
          fill="none"
          stroke="var(--muted)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {fr > 0 && (
          <path
            d={`M10 60 A50 50 0 0 1 ${ponta}`}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="12"
            strokeLinecap="round"
          />
        )}
        <line
          x1={60 + 40 * Math.cos(a100)}
          y1={60 - 40 * Math.sin(a100)}
          x2={60 + 58 * Math.cos(a100)}
          y2={60 - 58 * Math.sin(a100)}
          stroke="var(--foreground)"
          strokeWidth="1.5"
        />
        <text
          x="60"
          y="56"
          textAnchor="middle"
          fontSize="18"
          fontWeight="800"
          fill="var(--foreground)"
        >
          {pct0(pct)}
        </text>
      </svg>
      <p className="mt-auto text-center text-xs text-muted-foreground">
        {brl0(vendido)} de {brl0(meta)} · traço = 100%
      </p>
    </>
  );
}

const UFS = ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"];
const SEM_DADO = "color-mix(in oklab, var(--muted-foreground) 40%, var(--card))";
const NOME_UF: Record<string, string> = {
  CE: "Ceará",
  MA: "Maranhão",
  PB: "Paraíba",
  RN: "Rio Grande do Norte",
};

/**
 * Mapa de calor por município (P3, 13/10/2026), no estilo dos mapas do INMET: cor contínua de azul
 * (menor) a vermelho (maior) pelo % da meta atingido; município sem dado em cinza. Clicar num
 * estado dá zoom nele; "Visão geral" volta.
 */
function MapaNordeste({ lojas, podeCorrigir }: { lojas: LojaNoMapa[]; podeCorrigir: boolean }) {
  const [uf, setUf] = useState<string | null>(null);
  const { data: dados } = useQuery({
    queryKey: ["mapa-municipios"],
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const [ne, mun] = await Promise.all([
        import("@/lib/mapa/nordeste-dados"),
        import("@/lib/mapa/municipios-dados"),
      ]);
      const estados = ne.ESTADOS_NE.map((e) => ({
        uf: e.uf,
        d: e.aneis
          .map(
            (anel) =>
              anel
                .map(([lon, lat], i) => {
                  const p = projetar(lon, lat);
                  return `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
                })
                .join("") + "Z",
          )
          .join(""),
      }));
      return { estados, municipios: mun.MUNICIPIOS_MAPA, caixas: mun.CAIXAS_UF };
    },
  });
  const r = useMemo(
    () => (dados ? agruparPorMunicipio(lojas, dados.municipios) : null),
    [dados, lojas],
  );
  if (!dados || !r) return <p className="text-sm text-muted-foreground">Carregando o mapa…</p>;

  const comMalha = Object.keys(dados.caixas);
  const caixa = (u: string | null): [number, number, number, number] => {
    const cs = (u ? [u] : comMalha).map((x) => dados.caixas[x]!);
    return [
      Math.min(...cs.map((c) => c[0])),
      Math.min(...cs.map((c) => c[1])),
      Math.max(...cs.map((c) => c[2])),
      Math.max(...cs.map((c) => c[3])),
    ];
  };
  const [x0, y0, x1, y1] = caixa(uf);
  const folga = 20;
  const viewBox = `${x0 - folga} ${y0 - folga} ${x1 - x0 + 2 * folga} ${y1 - y0 + 2 * folga}`;
  const traco = uf ? 0.8 : 1.5;

  return (
    <div className="space-y-2">
      <div className="flex min-h-7 items-center justify-between gap-2 text-xs">
        <span className="font-semibold">
          {uf ? (NOME_UF[uf] ?? uf) : "Clique num estado para ampliar"}
        </span>
        {uf && (
          <Button size="sm" variant="outline" className="h-7" onClick={() => setUf(null)}>
            Visão geral
          </Button>
        )}
      </div>
      <svg
        viewBox={viewBox}
        className="mx-auto max-h-64 w-full"
        role="img"
        aria-label={
          uf ? `Mapa de ${NOME_UF[uf] ?? uf} por município` : "Mapa das lojas por município"
        }
      >
        {!uf &&
          dados.estados
            .filter((e) => !comMalha.includes(e.uf))
            .map((e) => (
              <path
                key={e.uf}
                d={e.d}
                fill="var(--muted)"
                fillOpacity={0.4}
                stroke="var(--card)"
                strokeWidth={3}
              />
            ))}
        {dados.municipios
          .filter((m) => !uf || m.uf === uf)
          .map((m) => {
            const dado = r.porMunicipio.get(chaveDoMunicipio(m.nome, m.uf));
            const pct = dado?.pct ?? null;
            return (
              <path
                key={`${m.uf}|${m.nome}`}
                d={m.d}
                fill={pct === null ? SEM_DADO : corDoPct(pct)}
                stroke="var(--card)"
                strokeWidth={traco}
                className={uf ? undefined : "cursor-pointer"}
                onClick={uf ? undefined : () => setUf(m.uf)}
              >
                <title>
                  {m.nome}-{m.uf}
                  {dado
                    ? `: ${dado.lojas.map((l) => l.nome).join(", ")} · ${pct === null ? AGUARDANDO : `${pct0(pct)} da meta`}`
                    : " · sem loja"}
                </title>
              </path>
            );
          })}
        {!uf &&
          dados.estados
            .filter((e) => comMalha.includes(e.uf))
            .map((e) => (
              <path
                key={`borda-${e.uf}`}
                d={e.d}
                fill="none"
                stroke="var(--foreground)"
                strokeOpacity={0.5}
                strokeWidth={3}
                pointerEvents="none"
              />
            ))}
      </svg>
      <LegendaMapa />
      {r.naoReconhecidas.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-warn">
            {r.naoReconhecidas.length} loja(s) fora do mapa (cidade não reconhecida)
          </summary>
          <ul className="mt-2 max-h-56 space-y-1.5 overflow-auto">
            {r.naoReconhecidas.map((l) => (
              <CorrigirLocal key={l.bcps} loja={l} podeCorrigir={podeCorrigir} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Legenda da escala contínua (0% → 100% ou mais) e do cinza "sem dado". */
function LegendaMapa() {
  const gradiente = `linear-gradient(to right, ${ESCALA_MAPA.paradas.join(", ")})`;
  return (
    <div className="space-y-1 text-[11px] text-muted-foreground">
      <div className="h-2.5 rounded-full" style={{ background: gradiente }} aria-hidden />
      <div className="flex justify-between tabular-nums">
        <span>0%</span>
        <span>50%</span>
        <span>≥ {Math.round(ESCALA_MAPA.max * 100)}% da meta</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm" style={{ background: SEM_DADO }} />
        sem dado (sem loja, sem venda ou cidade ainda não reconhecida)
      </div>
    </div>
  );
}

function CorrigirLocal({ loja, podeCorrigir }: { loja: LojaNoMapa; podeCorrigir: boolean }) {
  const queryClient = useQueryClient();
  const [cidade, setCidade] = useState(loja.cidade ?? "");
  const [uf, setUf] = useState(loja.uf ?? "");
  const salvar = async () => {
    try {
      await repositorio.salvarLocalizacao(loja.bcps, cidade, uf);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CHAVES.lojas }),
        queryClient.invalidateQueries({ queryKey: CHAVE_LOJAS_COMPLETAS }),
      ]);
      toast.success(`Local de ${loja.nome} salvo.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="min-w-32 font-semibold">
        {loja.nome} <span className="font-normal text-muted-foreground">{loja.bcps}</span>
      </span>
      {podeCorrigir ? (
        <>
          <Input
            className="h-7 w-40 text-xs"
            placeholder="Cidade"
            aria-label={`Cidade de ${loja.nome}`}
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
          />
          <select
            className="h-7 rounded-md border bg-card px-2 text-xs"
            aria-label={`UF de ${loja.nome}`}
            value={uf}
            onChange={(e) => setUf(e.target.value)}
          >
            <option value="">UF</option>
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={!cidade.trim() || !uf}
            onClick={() => void salvar()}
          >
            Salvar
          </Button>
        </>
      ) : (
        <span className="text-muted-foreground">
          {loja.cidade ? `${loja.cidade}-${loja.uf ?? "?"}` : "sem cidade"}
        </span>
      )}
    </li>
  );
}

export interface GrupoVendas {
  chave: string;
  rotulo: string;
  numeros: NumerosMeta;
  linhas: { chave: string; rotulo: ReactNode; numeros: NumerosMeta }[];
}

/** Tabela de vendas por praça e unidade: canal, ruído, venda da Sacola, sacolas, boletos, % da meta. */
function TabelaVendas({ grupos }: { grupos: GrupoVendas[] }) {
  const [abertos, setAbertos] = useState<Set<string>>(
    new Set(grupos.length === 1 ? [grupos[0]!.chave] : []),
  );
  const num = "px-3 py-1.5 text-right tabular-nums whitespace-nowrap";
  const celulas = (n: NumerosMeta) => {
    const r = n.realizado;
    const d = derivados(n, 1);
    return (
      <>
        <td className={num}>{r ? brl0(r.canal) : "—"}</td>
        <td className={`${num} text-muted-foreground`}>{r ? brl0(r.ruido) : "—"}</td>
        <td className={`${num} font-semibold`}>{r ? brl0(r.vendido) : "—"}</td>
        <td className={num}>{r ? int(r.sacolas) : "—"}</td>
        <td className={num}>{r ? int(r.boletos) : "—"}</td>
        <td className={num}>{pct0(d.pctMeta)}</td>
      </>
    );
  };
  return (
    <div className="max-h-96 overflow-auto rounded-xl border">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b text-xs text-muted-foreground">
            <th className="px-3 py-2 text-left font-semibold">Praça / unidade</th>
            <th className="px-3 py-2 text-right font-semibold">Venda do canal</th>
            <th className="px-3 py-2 text-right font-semibold">Ruído</th>
            <th className="px-3 py-2 text-right font-semibold">Venda da Sacola</th>
            <th className="px-3 py-2 text-right font-semibold">Sacolas</th>
            <th className="px-3 py-2 text-right font-semibold">Boletos</th>
            <th className="px-3 py-2 text-right font-semibold">% da meta</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => {
            const aberto = abertos.has(g.chave);
            return (
              <Fragment key={g.chave}>
                <tr
                  className="cursor-pointer border-b bg-muted/50 font-semibold hover:bg-muted"
                  onClick={() => {
                    const n = new Set(abertos);
                    if (n.has(g.chave)) n.delete(g.chave);
                    else n.add(g.chave);
                    setAbertos(n);
                  }}
                >
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      {aberto ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                      {g.rotulo}
                    </span>
                  </td>
                  {celulas(g.numeros)}
                </tr>
                {aberto &&
                  g.linhas.map((l) => (
                    <tr key={l.chave} className="border-b hover:bg-muted/30">
                      <td className="py-1.5 pl-9 pr-3">{l.rotulo}</td>
                      {celulas(l.numeros)}
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Os quatro gráficos de vendas. `total` = números do total (meta e realizado). */
export function GraficosDeVendas({
  total,
  fatias,
  pizzaPor,
  lojasMapa,
  grupos,
  podeCorrigirMapa,
  mostrarMapa = true,
}: {
  total: NumerosMeta;
  fatias: Fatia[];
  pizzaPor: "praça" | "loja";
  lojasMapa: LojaNoMapa[];
  grupos: GrupoVendas[];
  podeCorrigirMapa: boolean;
  /** P3: o mapa só aparece para os perfis de src/lib/mapa/acesso.ts (o GVO não vê). */
  mostrarMapa?: boolean;
}) {
  const semVendas = !total.realizado;
  const d = derivados(total, 1);
  return (
    <>
      <div className="mb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Cartao titulo="Receita vendida" icone={<PieChart className="size-4" aria-hidden />}>
          {semVendas ? (
            <Aguardando texto={`Participação de cada ${pizzaPor} na receita vendida.`} />
          ) : (
            <Pizza fatias={fatias} />
          )}
        </Cartao>
        <Cartao titulo="% da meta do ciclo" icone={<Gauge className="size-4" aria-hidden />}>
          {semVendas ? (
            <Aguardando texto="Venda da Sacola estimada ÷ meta do ciclo." />
          ) : (
            <Velocimetro
              pct={d.pctMeta ?? 0}
              vendido={total.realizado!.vendido}
              meta={total.meta}
            />
          )}
        </Cartao>
        {mostrarMapa && (
          <Cartao
            titulo="Mapa por município"
            icone={<MapaIcone className="size-4" aria-hidden />}
            className="md:col-span-2 xl:col-span-1 xl:row-span-2"
          >
            <MapaNordeste lojas={lojasMapa} podeCorrigir={podeCorrigirMapa} />
          </Cartao>
        )}
        <Cartao
          titulo="Vendas por praça e unidade"
          icone={<Table2 className="size-4" aria-hidden />}
          className={mostrarMapa ? "md:col-span-2" : "md:col-span-2 xl:col-span-3"}
        >
          {semVendas ? (
            <Aguardando texto="Venda do canal, ruído descontado, venda da Sacola, sacolas e % da meta." />
          ) : (
            <TabelaVendas grupos={grupos} />
          )}
        </Cartao>
      </div>
    </>
  );
}
