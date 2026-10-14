import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCheck, Filter, Save, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina, Carregando } from "@/components/layout/CabecalhoPagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { escopoDoPerfil, nomeProprio, type Nivel } from "@/lib/acessos/hierarquia";
import { useSoLeitura } from "@/lib/auth/leitura";
import { CHAVES, useHierarquiaEPerfis } from "@/lib/dados";
import {
  CHAVE_LOJAS_COMPLETAS,
  gravarParticipa,
  lerLojasCompletas,
  type LojaCompleta,
} from "@/lib/lojas/lojas";
import { casaBusca, formasDoCodigo, tipoExibido } from "@/lib/lojas/regras";

export const Route = createFileRoute("/admin/lojas")({
  component: Lojas,
});

const int = (n: number) => n.toLocaleString("pt-BR");

/**
 * Hierarquia de cada loja (GVO, GCVO/GPVO, GRVO, da dGerentes) e lojas que algum usuário ativo vê
 * pela hierarquia (pela matrícula). Quem tem "vê todas as lojas" (diretoria) não conta no aviso,
 * senão nenhuma loja ficaria sem usuário.
 */
function useCobertura() {
  // mesma leitura (e o mesmo cache) do dashboard: hierarquia, nomes e perfis
  const { data: h } = useHierarquiaEPerfis();
  return {
    data: useMemo(() => {
      if (!h) return undefined;
      const hierarquia = new Map<string, Partial<Record<Nivel, string>>>();
      for (const v of h.vinculos) {
        const x = hierarquia.get(v.bcps) ?? {};
        x[v.nivel] = nomeProprio(h.nomes.get(v.matricula) ?? v.matricula);
        hierarquia.set(v.bcps, x);
      }
      const comUsuario = new Set<string>();
      for (const perfil of h.perfis) {
        // admin e acompanhamento veem tudo: não contam como "usuário no escopo" da loja
        if (perfil.perfil === "admin" || perfil.perfil === "acompanhamento") continue;
        for (const b of escopoDoPerfil(perfil, h.vinculos).lojas) comUsuario.add(b);
      }
      return { comGerente: new Set(hierarquia.keys()), comUsuario, hierarquia };
    }, [h]),
  };
}

interface Filtros {
  nome: string;
  bcps: string;
  sap: string;
  centro: string;
  tipos: Set<string>;
  situacao: "todas" | "sim" | "nao";
  soAviso: boolean;
  inativas: boolean;
}

const VAZIO: Filtros = {
  nome: "",
  bcps: "",
  sap: "",
  centro: "",
  tipos: new Set(),
  situacao: "todas",
  soAviso: false,
  inativas: false,
};

/** Tipos na ordem da dCentros; "Venda Direta" é o ER. Os que aparecerem a mais vão ao fim. */
const ORDEM_TIPOS = ["Varejo", "Venda Direta", "Híbrida", "Estoque", "HUB", "Escritório"];
const ROTULO_TIPO: Record<string, string> = { "Venda Direta": "ER (Venda Direta)" };
/** Marca como aparece na tela (a dCentros traz aspas extras, ex.: ""Quem Disse, Berenice?""). */
const marcaDe = (l: { marca: string | null }) =>
  (l.marca ?? "").replace(/^"+|"+$/g, "").trim() || "(sem marca)";

const contem = (valor: string | null, termo: string) =>
  !termo.trim() || (valor ?? "").toLowerCase().includes(termo.trim().toLowerCase());
/** SAP nas duas formas: 4118 acha A118 e vice-versa. */
const contemSap = (valor: string | null, termo: string) =>
  !termo.trim() ||
  formasDoCodigo(valor).some((v) => formasDoCodigo(termo).some((t) => v.includes(t)));

/** Quantos filtros estão ligados (para o número no botão do funil). */
function quantosFiltros(f: Filtros) {
  return (
    [f.nome, f.bcps, f.sap, f.centro].filter((x) => x.trim()).length +
    (f.tipos.size ? 1 : 0) +
    (f.situacao !== "todas" ? 1 : 0) +
    (f.soAviso ? 1 : 0) +
    (f.inativas ? 1 : 0)
  );
}

function Lojas() {
  const queryClient = useQueryClient();
  // Acompanhamento (F2a): vê a participação, mas não muda
  const soLeitura = useSoLeitura();
  const { data: lojas, isLoading } = useQuery({
    queryKey: CHAVE_LOJAS_COMPLETAS,
    queryFn: lerLojasCompletas,
  });
  const { data: cobertura } = useCobertura();
  const [f, setF] = useState<Filtros>(VAZIO);
  // filtros sendo montados no painel lateral (só valem ao clicar em "Aplicar")
  const [rascunhoFiltro, setRascunhoFiltro] = useState<Filtros>(VAZIO);
  const [painel, setPainel] = useState(false);
  // participação alterada e ainda não salva (bcps → participa)
  const [mudancas, setMudancas] = useState<Map<string, boolean>>(new Map());
  const [gravando, setGravando] = useState(false);

  const participa = (l: LojaCompleta) => mudancas.get(l.bcps) ?? l.participa;
  const avisos = (l: LojaCompleta) => {
    if (!participa(l) || !l.ativo || !cobertura) return [];
    const r: string[] = [];
    if (!cobertura.comGerente.has(l.bcps)) r.push("Sem gerente na dGerentes");
    if (!cobertura.comUsuario.has(l.bcps)) r.push("Sem usuário ativo no escopo");
    return r;
  };

  const tipos = useMemo(() => {
    const presentes = new Set((lojas ?? []).map(tipoExibido));
    const extras = [...presentes].filter((t) => !ORDEM_TIPOS.includes(t)).sort();
    return [...ORDEM_TIPOS, ...extras];
  }, [lojas]);

  const filtradas = (lojas ?? []).filter(
    (l) =>
      (f.inativas || l.ativo) &&
      casaBusca(f.nome, l.nome, l.nome_completo) &&
      contem(l.bcps, f.bcps) &&
      contemSap(l.sap, f.sap) &&
      contem(l.centro_custo, f.centro) &&
      (f.tipos.size === 0 || f.tipos.has(tipoExibido(l))) &&
      (f.situacao === "todas" || participa(l) === (f.situacao === "sim")) &&
      (!f.soAviso || avisos(l).length > 0),
  );

  const ativas = (lojas ?? []).filter((l) => l.ativo);
  const participam = ativas.filter(participa);
  const semGerente = participam.filter((l) => !cobertura?.comGerente.has(l.bcps)).length;
  const semUsuario = participam.filter((l) => !cobertura?.comUsuario.has(l.bcps)).length;

  /** Marca no rascunho; voltar ao valor do banco tira a loja da lista de mudanças. */
  const mudar = (ls: LojaCompleta[], valor: boolean) => {
    const n = new Map(mudancas);
    for (const l of ls) {
      if (l.participa === valor) n.delete(l.bcps);
      else n.set(l.bcps, valor);
    }
    setMudancas(n);
  };

  const salvar = async () => {
    const sim = [...mudancas].filter(([, v]) => v).map(([b]) => b);
    const nao = [...mudancas].filter(([, v]) => !v).map(([b]) => b);
    setGravando(true);
    try {
      if (sim.length) await gravarParticipa(sim, true);
      if (nao.length) await gravarParticipa(nao, false);
      // a participação muda o motor, as metas e o upload da cobertura
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CHAVE_LOJAS_COMPLETAS }),
        queryClient.invalidateQueries({ queryKey: CHAVES.lojas }),
      ]);
      setMudancas(new Map());
      toast.success(
        `Participação salva: ${int(sim.length)} loja(s) passam a participar, ${int(nao.length)} deixam de participar.`,
      );
    } catch (e) {
      toast.error(`Não consegui gravar: ${(e as Error).message}`);
    } finally {
      setGravando(false);
    }
  };

  const abrirFiltros = () => {
    setRascunhoFiltro({ ...f, tipos: new Set(f.tipos) });
    setPainel(true);
  };
  const aplicar = () => {
    setF(rascunhoFiltro);
    setPainel(false);
  };
  const r = rascunhoFiltro;
  const alternarTipo = (t: string) => {
    const n = new Set(r.tipos);
    if (n.has(t)) n.delete(t);
    else n.add(t);
    setRascunhoFiltro({ ...r, tipos: n });
  };

  if (isLoading || !lojas) return <Carregando />;

  const ligados = quantosFiltros(f);
  const resumoFiltros = [
    f.nome && `Nome: ${f.nome}`,
    f.bcps && `BCPS: ${f.bcps}`,
    f.sap && `SAP: ${f.sap}`,
    f.centro && `Centro de custo: ${f.centro}`,
    f.tipos.size > 0 && `Tipo: ${[...f.tipos].map((t) => ROTULO_TIPO[t] ?? t).join(", ")}`,
    f.situacao !== "todas" &&
      (f.situacao === "sim" ? "Só as que participam" : "Só as que não participam"),
    f.soAviso && "Só com aviso",
    f.inativas && "Com inativas",
  ].filter(Boolean) as string[];

  return (
    <>
      <CabecalhoPagina
        titulo="Lojas"
        descricao="Todas as unidades da última dCentros. Marque quais entram no motor: só as que participam (e estão ativas) recebem kits e entram na divisão da meta. As mudanças só valem depois de Salvar."
      />

      <div className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          ["Participam", `${int(participam.length)} de ${int(ativas.length)} ativas`],
          ["Filtradas", int(filtradas.length)],
          ["Sem gerente na dGerentes", int(semGerente)],
          ["Sem usuário no escopo", int(semUsuario)],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-xl border bg-card px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {rotulo}
            </div>
            <div className="font-bold tabular-nums text-ink">{valor}</div>
          </div>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={abrirFiltros}>
          <Filter /> Filtros
          {ligados > 0 && (
            <span className="ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
              {ligados}
            </span>
          )}
        </Button>
        {resumoFiltros.map((x) => (
          <span key={x} className="rounded-full bg-muted px-2.5 py-1 text-xs">
            {x}
          </span>
        ))}
        {ligados > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setF(VAZIO)}>
            Limpar filtros
          </Button>
        )}
        {!soLeitura && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={gravando || !filtradas.length}
              onClick={() => mudar(filtradas, true)}
            >
              <CheckCheck /> Marcar filtradas
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={gravando || !filtradas.length}
              onClick={() => mudar(filtradas, false)}
            >
              <X /> Desmarcar filtradas
            </Button>
          </div>
        )}
      </div>

      {mudancas.size > 0 && (
        <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-primary bg-card px-4 py-2 shadow-sm">
          <span className="text-sm">
            <b>{int(mudancas.size)}</b> loja(s) com participação alterada, ainda não salva.
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" disabled={gravando} onClick={() => setMudancas(new Map())}>
              Cancelar
            </Button>
            <Button disabled={gravando} onClick={() => void salvar()}>
              <Save /> {gravando ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border bg-card">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 w-12 bg-card text-center" title="Participa">
                ✓
              </TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Tipo / Marca</TableHead>
              <TableHead>Praça</TableHead>
              <TableHead>Gerentes</TableHead>
              <TableHead>Avisos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.map((l) => {
              const h = cobertura?.hierarquia.get(l.bcps);
              const alterada = mudancas.has(l.bcps);
              return (
                <TableRow
                  key={l.bcps}
                  className={`${l.ativo ? "" : "opacity-60"} ${alterada ? "bg-primary/5" : ""}`}
                >
                  <TableCell className="sticky left-0 z-10 w-12 bg-card text-center">
                    <Checkbox
                      aria-label={`Participa: ${l.nome}`}
                      checked={participa(l)}
                      disabled={gravando || soLeitura}
                      onCheckedChange={(v) => mudar([l], v === true)}
                    />
                  </TableCell>
                  <TableCell className="min-w-40">
                    <div className="font-medium">
                      {l.nome_completo ?? l.nome}{" "}
                      <span className="text-muted-foreground">· {l.bcps}</span>
                      {!l.ativo && (
                        <span className="ml-1 text-xs text-muted-foreground">(inativa)</span>
                      )}
                      {alterada && (
                        <span className="ml-1 text-xs font-semibold text-primary">(não salva)</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      SAP {l.sap ?? "—"} · CC {l.centro_custo ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{ROTULO_TIPO[tipoExibido(l)] ?? tipoExibido(l)}</div>
                    <div className="text-xs text-muted-foreground">{marcaDe(l)}</div>
                  </TableCell>
                  <TableCell>{l.praca}</TableCell>
                  <TableCell className="min-w-44 text-xs">
                    {(["gvo", "gcvo_gpvo", "grvo"] as const).map((n) => (
                      <div key={n}>
                        <span className="text-muted-foreground">
                          {{ gvo: "GVO", gcvo_gpvo: "GCVO/GPVO", grvo: "GRVO" }[n]}:
                        </span>{" "}
                        {h?.[n] ?? "—"}
                      </div>
                    ))}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {avisos(l).map((a) => (
                        <Badge key={a} className="bg-warn-soft text-warn hover:bg-warn-soft">
                          {a}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!filtradas.length && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  Nenhuma loja com esses filtros.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={painel} onOpenChange={setPainel}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle>Filtrar lojas</SheetTitle>
            <SheetDescription>Monte o filtro e clique em Aplicar.</SheetDescription>
          </SheetHeader>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <div className="flex flex-wrap gap-2">
              {tipos.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={r.tipos.has(t)}
                  onClick={() => alternarTipo(t)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    r.tipos.has(t) ? "border-primary bg-primary text-primary-foreground" : "bg-card"
                  }`}
                >
                  {ROTULO_TIPO[t] ?? t}
                </button>
              ))}
            </div>
          </div>
          {(
            [
              ["nome", "Nome", "Nome completo ou parte"],
              ["bcps", "Código BCPS", "Ex.: 21432"],
              ["sap", "Código SAP", "Ex.: 4065, 4118 ou A118"],
              ["centro", "Centro de custo", ""],
            ] as const
          ).map(([campo, rotulo, dica]) => (
            <div key={campo} className="space-y-1.5">
              <Label htmlFor={`filtro-${campo}`}>{rotulo}</Label>
              <Input
                id={`filtro-${campo}`}
                placeholder={dica}
                value={r[campo]}
                onChange={(e) => setRascunhoFiltro({ ...r, [campo]: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && aplicar()}
              />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="filtro-situacao">Participa</Label>
            <select
              id="filtro-situacao"
              className="h-9 w-full rounded-md border bg-card px-3 text-sm"
              value={r.situacao}
              onChange={(e) =>
                setRascunhoFiltro({ ...r, situacao: e.target.value as Filtros["situacao"] })
              }
            >
              <option value="todas">Todas</option>
              <option value="sim">Só as que participam</option>
              <option value="nao">Só as que não participam</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={r.soAviso}
              onCheckedChange={(v) => setRascunhoFiltro({ ...r, soAviso: v === true })}
            />
            Só com aviso
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={r.inativas}
              onCheckedChange={(v) => setRascunhoFiltro({ ...r, inativas: v === true })}
            />
            Mostrar inativas
          </label>
          <SheetFooter className="mt-auto gap-2 sm:justify-between">
            <Button variant="ghost" onClick={() => setRascunhoFiltro(VAZIO)}>
              Limpar
            </Button>
            <Button onClick={aplicar}>
              <Filter /> Aplicar filtros
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
