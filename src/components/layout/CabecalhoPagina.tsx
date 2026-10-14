import type { ReactNode } from "react";

export function CabecalhoPagina({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string;
  descricao?: string | undefined;
  acoes?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function EmConstrucao({
  titulo,
  descricao,
  etapa,
}: {
  titulo: string;
  descricao: string;
  etapa: string;
}) {
  return (
    <>
      <CabecalhoPagina titulo={titulo} descricao={descricao} />
      <div className="rounded-2xl border border-dashed bg-card p-8 text-center text-muted-foreground">
        Em construção — chega na {etapa}.
      </div>
    </>
  );
}

export function Carregando() {
  return <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>;
}
