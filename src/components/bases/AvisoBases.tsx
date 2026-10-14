import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

import { TITULO_BASE } from "@/lib/bases/cartoes";
import { haQuanto } from "@/lib/bases/situacao";
import { useBasesDesatualizadas } from "@/lib/bases/useSituacao";

/** Faixa amarela no topo das telas do admin: bases variáveis sem atualização há mais de 24 h. */
export function AvisoBases({ ciclo, soLeitura }: { ciclo: number | null; soLeitura: boolean }) {
  const desatualizadas = useBasesDesatualizadas(ciclo);
  if (!desatualizadas.length) return null;
  const agora = Date.now();
  return (
    <div
      role="status"
      className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-warn-soft px-4 py-2.5 text-sm text-warn"
    >
      <TriangleAlert className="size-4 flex-none" aria-hidden />
      <span>
        <b>Base variável desatualizada (mais de 24 h):</b>{" "}
        {desatualizadas
          .map(
            (d) =>
              `${TITULO_BASE[d.base]}${d.base === "promocao" && ciclo ? ` (ciclo ${ciclo})` : ""} — ${
                d.desde ? `último envio ${haQuanto(d.desde, agora)}` : "sem envio"
              }`,
          )
          .join(" · ")}
      </span>
      {!soLeitura && (
        <Link to="/admin/bases" className="font-semibold underline underline-offset-2">
          Ir para Bases
        </Link>
      )}
    </div>
  );
}
