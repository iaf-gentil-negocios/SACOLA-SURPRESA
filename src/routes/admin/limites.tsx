import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina, Carregando } from "@/components/layout/CabecalhoPagina";
import { InicioCampanha } from "@/components/vendas/InicioCampanha";
import { Button } from "@/components/ui/button";
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
import { useSoLeitura } from "@/lib/auth/leitura";
import { useCicloSelecionado, useCiclos } from "@/lib/ciclo";
import { CHAVES, repositorio, useFaturamento, useLojas, useParametros } from "@/lib/dados";
import { entraNoPlano } from "@/lib/lojas/regras";
import { metaDoCiclo, metaPorMes, metasDoCiclo } from "@/lib/motor/metas";
import type { Parametros } from "@/lib/motor/parametros";

export const Route = createFileRoute("/admin/limites")({
  component: Limites,
});

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const NOME_MES: Record<string, string> = { "10": "Out", "11": "Nov", "12": "Dez" };
const rotuloMes = (m: string) => `${NOME_MES[m.slice(5, 7)] ?? m.slice(5, 7)}/${m.slice(2, 4)}`;
const dataBR = (d: string) => d.split("-").reverse().join("/");

/** Campo numérico que aceita vazio (= usa o valor geral/sugerido). */
function NumOpcional({
  valor,
  aoMudar,
  placeholder,
}: {
  valor: number | undefined;
  aoMudar: (v: number | undefined) => void;
  placeholder: string;
}) {
  return (
    <Input
      className="ml-auto h-8 w-28 text-right"
      type="number"
      placeholder={placeholder}
      value={valor ?? ""}
      onChange={(e) => aoMudar(e.target.value === "" ? undefined : Number(e.target.value))}
    />
  );
}

function semChave<T extends object>(o: T, chave: string, valor: unknown): T {
  const novo = { ...o } as Record<string, unknown>;
  if (valor === undefined) delete novo[chave];
  else novo[chave] = valor;
  return novo as T;
}

function Limites() {
  const queryClient = useQueryClient();
  const soLeitura = useSoLeitura();
  const { data: salvos } = useParametros();
  const { data: ciclos } = useCiclos();
  const [cicloId] = useCicloSelecionado(ciclos);
  const { data: lojas } = useLojas();
  const { data: faturamento } = useFaturamento();
  const [p, setP] = useState<Parametros | null>(null);
  const [filtroPraca, setFiltroPraca] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (salvos && !p) setP(structuredClone(salvos));
  }, [salvos, p]);

  const lojasMeta = useMemo(() => (lojas ?? []).filter(entraNoPlano), [lojas]);
  const metas = useMemo(
    () =>
      p && ciclos && cicloId
        ? metasDoCiclo(p, ciclos, cicloId, lojasMeta, faturamento ?? [])
        : null,
    [p, ciclos, cicloId, lojasMeta, faturamento],
  );

  if (!p || !ciclos || !cicloId || !metas) return <Carregando />;
  const ciclo = ciclos.find((c) => c.id === cicloId)!;
  const mudar = <K extends keyof Parametros>(k: K, v: Parametros[K]) => setP({ ...p, [k]: v });

  // meta mensal da estratégia inteira (os 3 ciclos, cada um dividido pelos dias de cada mês)
  const mensal: Record<string, number> = {};
  for (const c of ciclos) {
    for (const [m, v] of Object.entries(metaPorMes(metaDoCiclo(p, ciclos, c.id), c))) {
      mensal[m] = (mensal[m] ?? 0) + v;
    }
  }
  const meses = Object.keys(metas.lojas[0]?.metasMes ?? {}).sort();
  const digitadasCiclo = p.meta_pracas_digitada[String(cicloId)] ?? {};

  const salvar = async () => {
    setSalvando(true);
    try {
      await repositorio.salvarParametros({
        meta_total: p.meta_total,
        meta_divisao_ciclos: p.meta_divisao_ciclos,
        meta_pesos_ciclos: p.meta_pesos_ciclos,
        meta_ciclos_digitada: p.meta_ciclos_digitada,
        meta_divisao_lojas: p.meta_divisao_lojas,
        meta_pracas_digitada: p.meta_pracas_digitada,
        limites_pracas: p.limites_pracas,
      });
      await queryClient.invalidateQueries({ queryKey: CHAVES.parametros });
      toast.success("Metas e limites salvos.");
    } catch (e) {
      toast.error(`Não foi possível salvar: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Limites e metas"
        descricao={`Meta da estratégia, divisão por ciclo, praça e loja, e meta mensal${soLeitura ? " · só leitura" : ""}`}
        acoes={
          soLeitura ? undefined : (
            <Button onClick={salvar} disabled={salvando}>
              <Save /> {salvando ? "Salvando…" : "Salvar"}
            </Button>
          )
        }
      />

      <InicioCampanha ciclo={ciclo} soLeitura={soLeitura} />

      {/* Acompanhamento (F2a): só leitura — os campos ficam travados */}
      <fieldset disabled={soLeitura} className="min-w-0">
        <section className="mb-5 grid gap-4 rounded-2xl border bg-card p-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="meta-total">Meta total da estratégia (até 25/12)</Label>
            <Input
              id="meta-total"
              type="number"
              value={p.meta_total}
              onChange={(e) => mudar("meta_total", Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="div-ciclos">Divisão entre ciclos</Label>
            <select
              id="div-ciclos"
              className="h-9 w-full rounded-md border bg-card px-3 text-sm"
              value={p.meta_divisao_ciclos}
              onChange={(e) =>
                mudar("meta_divisao_ciclos", e.target.value as Parametros["meta_divisao_ciclos"])
              }
            >
              <option value="peso_2025">Peso de 2025</option>
              <option value="dias">Proporcional aos dias</option>
              <option value="digitada">Digitada por ciclo</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="div-lojas">Divisão entre praças e lojas</Label>
            <select
              id="div-lojas"
              className="h-9 w-full rounded-md border bg-card px-3 text-sm"
              value={p.meta_divisao_lojas}
              onChange={(e) =>
                mudar("meta_divisao_lojas", e.target.value as Parametros["meta_divisao_lojas"])
              }
            >
              <option value="faturamento">Faturamento jul–set/2026</option>
              <option value="vendedoras">Nº de vendedoras</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ciclo</TableHead>
                  <TableHead>Período</TableHead>
                  {p.meta_divisao_ciclos === "peso_2025" && (
                    <TableHead className="text-right">Peso (%)</TableHead>
                  )}
                  {p.meta_divisao_ciclos === "digitada" && (
                    <TableHead className="text-right">Meta digitada</TableHead>
                  )}
                  <TableHead className="text-right">Meta do ciclo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ciclos.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-semibold">{c.nome}</TableCell>
                    <TableCell>
                      {dataBR(c.inicio)} a {dataBR(c.fim)}
                    </TableCell>
                    {p.meta_divisao_ciclos === "peso_2025" && (
                      <TableCell className="text-right">
                        <Input
                          className="ml-auto h-8 w-24 text-right"
                          type="number"
                          step="0.01"
                          value={Math.round((p.meta_pesos_ciclos[String(c.id)] ?? 0) * 10000) / 100}
                          onChange={(e) =>
                            mudar("meta_pesos_ciclos", {
                              ...p.meta_pesos_ciclos,
                              [String(c.id)]: (Number(e.target.value) || 0) / 100,
                            })
                          }
                        />
                      </TableCell>
                    )}
                    {p.meta_divisao_ciclos === "digitada" && (
                      <TableCell className="text-right">
                        <NumOpcional
                          valor={p.meta_ciclos_digitada[String(c.id)]}
                          placeholder="—"
                          aoMudar={(v) =>
                            mudar(
                              "meta_ciclos_digitada",
                              semChave(p.meta_ciclos_digitada, String(c.id), v),
                            )
                          }
                        />
                      </TableCell>
                    )}
                    <TableCell className="text-right font-semibold tabular-nums">
                      {brl(metaDoCiclo(p, ciclos, c.id))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-sm text-muted-foreground">
              Meta mensal (cada ciclo dividido pelos dias de cada mês):{" "}
              {Object.keys(mensal)
                .sort()
                .map((m) => `${rotuloMes(m)} ${brl(mensal[m]!)}`)
                .join(" · ")}
            </p>
          </div>
        </section>

        <section className="mb-5 rounded-2xl border bg-card p-4">
          <h2 className="mb-1 font-extrabold text-ink">
            {ciclo.nome}: praças{" "}
            <span className="text-sm font-normal text-muted-foreground">
              (campo vazio = sugerido / geral)
            </span>
          </h2>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Praça</TableHead>
                  <TableHead className="text-right">Meta sugerida</TableHead>
                  <TableHead className="text-right">Meta digitada</TableHead>
                  <TableHead className="text-right">Preço mín.</TableHead>
                  <TableHead className="text-right">Preço máx.</TableHead>
                  <TableHead className="text-right">Desconto máx. (%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metas.pracas.map((pr) => {
                  const lim = p.limites_pracas[pr.praca] ?? {};
                  const mudarLim = (k: string, v: number | undefined) =>
                    mudar("limites_pracas", {
                      ...p.limites_pracas,
                      [pr.praca]: semChave(lim, k, v),
                    });
                  return (
                    <TableRow key={pr.praca}>
                      <TableCell className="font-semibold">{pr.praca}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {brl(pr.metaSugerida)}
                      </TableCell>
                      <TableCell className="text-right">
                        <NumOpcional
                          valor={digitadasCiclo[pr.praca]}
                          placeholder="sugerida"
                          aoMudar={(v) =>
                            mudar("meta_pracas_digitada", {
                              ...p.meta_pracas_digitada,
                              [String(cicloId)]: semChave(digitadasCiclo, pr.praca, v),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <NumOpcional
                          valor={lim.preco_min}
                          placeholder={String(p.preco_min)}
                          aoMudar={(v) => mudarLim("preco_min", v)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <NumOpcional
                          valor={lim.preco_max}
                          placeholder={String(p.preco_max)}
                          aoMudar={(v) => mudarLim("preco_max", v)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <NumOpcional
                          valor={lim.desconto_max}
                          placeholder={String(p.desconto_max)}
                          aoMudar={(v) => mudarLim("desconto_max", v)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      </fieldset>
      <section className="rounded-2xl border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-extrabold text-ink">{ciclo.nome}: metas por loja</h2>
          <select
            className="h-9 rounded-md border bg-card px-3 text-sm"
            value={filtroPraca}
            onChange={(e) => setFiltroPraca(e.target.value)}
          >
            <option value="">Todas as praças</option>
            {metas.pracas.map((x) => (
              <option key={x.praca}>{x.praca}</option>
            ))}
          </select>
        </div>
        <div className="max-h-[480px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Praça</TableHead>
                <TableHead>Loja</TableHead>
                <TableHead className="text-right">Meta do ciclo</TableHead>
                {meses.map((m) => (
                  <TableHead key={m} className="text-right">
                    {rotuloMes(m)}
                  </TableHead>
                ))}
                <TableHead className="text-right">Por semana</TableHead>
                <TableHead className="text-right">Vendedoras</TableHead>
                <TableHead className="text-right">Por vendedora/semana</TableHead>
                <TableHead className="text-right">Sacolas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metas.lojas
                .filter((l) => !filtroPraca || l.praca === filtroPraca)
                .map((l) => (
                  <TableRow key={l.bcps}>
                    <TableCell>{l.praca}</TableCell>
                    <TableCell>
                      {lojasMeta.find((x) => x.bcps === l.bcps)?.nome ?? l.bcps}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{brl(l.meta)}</TableCell>
                    {meses.map((m) => (
                      <TableCell key={m} className="text-right tabular-nums">
                        {brl(l.metasMes[m] ?? 0)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums">{brl(l.metaSemana)}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.vendedoras}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.metaVendSemana === null ? "—" : brl(l.metaVendSemana)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.sacolasMeta.toLocaleString("pt-BR")}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </>
  );
}
