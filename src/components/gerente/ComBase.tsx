import type { ReactNode } from "react";

import { Carregando } from "@/components/layout/CabecalhoPagina";
import {
  useBaseEscolhida,
  useBasesGerente,
  useDadosBase,
  type DadosBase,
} from "@/lib/gerente/base";
import { useVisao } from "@/lib/gerente/visao";

/** Carrega a base escolhida no cabeçalho e entrega os dados para a página. */
export function ComBase({ children }: { children: (d: DadosBase) => ReactNode }) {
  const visao = useVisao();
  const { data: bases, isLoading } = useBasesGerente(visao);
  const [base] = useBaseEscolhida(bases);
  const { data, error, isLoading: carregando } = useDadosBase(base, visao);

  if (isLoading || carregando) return <Carregando />;
  if (error)
    return (
      <p className="text-sm text-destructive">Falha ao carregar: {(error as Error).message}</p>
    );
  if (!bases?.length || !data) {
    return (
      <div className="rounded-2xl border border-dashed bg-card p-8 text-center text-muted-foreground">
        Ainda não há base publicada para o seu escopo. Assim que o admin definir uma base, ela
        aparece aqui.
      </div>
    );
  }
  return <>{children(data)}</>;
}

export function Cartao({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string | undefined;
}) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </div>
      <div className="text-lg font-bold tabular-nums text-ink">{valor}</div>
      {detalhe && <div className="text-xs text-muted-foreground">{detalhe}</div>}
    </div>
  );
}

export function FiltroPraca({
  pracas,
  valor,
  aoMudar,
}: {
  pracas: string[];
  valor: string;
  aoMudar: (v: string) => void;
}) {
  if (pracas.length < 2) return null;
  return (
    <select
      className="h-9 rounded-md border bg-card px-3 text-sm"
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
    >
      <option value="">Todas as praças</option>
      {pracas.map((p) => (
        <option key={p}>{p}</option>
      ))}
    </select>
  );
}
