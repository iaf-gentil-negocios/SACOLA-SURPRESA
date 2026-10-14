import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { supabase } from "@/integrations/supabase/client";
import { ROTULO_NIVEL, type Nivel } from "@/lib/acessos/hierarquia";
import { lerLojasCompletas } from "@/lib/lojas/lojas";

interface LojaComPapeis {
  bcps: string;
  nome: string;
  praca: string;
  papeis: Nivel[];
}

/** Lojas e papéis de uma matrícula na hierarquia (dGerentes). */
function useHierarquiaDa(matricula: string) {
  return useQuery({
    queryKey: ["hierarquia-da-matricula", matricula],
    enabled: matricula !== "",
    queryFn: async () => {
      const [vinculos, lojas] = await Promise.all([
        supabase.from("gerentes_lojas").select("bcps, nivel").eq("matricula", matricula),
        lerLojasCompletas(),
      ]);
      if (vinculos.error) throw vinculos.error;
      const porBcps = new Map(lojas.map((l) => [l.bcps, l]));
      return vinculos.data.map((v) => ({
        bcps: v.bcps,
        nivel: v.nivel as Nivel,
        nome: porBcps.get(v.bcps)?.nome ?? v.bcps,
        praca: porBcps.get(v.bcps)?.praca ?? "",
      }));
    },
  });
}

/**
 * Escopo (só leitura, parte C): calculado pela hierarquia da dGerentes, pela matrícula.
 * GVO vê as lojas onde é GVO, GCVO/GPVO onde é GCVO/GPVO, GRVO onde é GRVO; vários papéis = soma.
 */
export function EscopoEditor({
  perfil,
  matricula,
  veTodas,
}: {
  perfil: string;
  matricula: string;
  veTodas: boolean;
}) {
  const m = matricula.trim();
  const { data, isLoading } = useHierarquiaDa(m);

  const porPraca = useMemo(() => {
    const lojas = new Map<string, LojaComPapeis>();
    for (const v of data ?? []) {
      const l = lojas.get(v.bcps) ?? { bcps: v.bcps, nome: v.nome, praca: v.praca, papeis: [] };
      l.papeis.push(v.nivel);
      lojas.set(v.bcps, l);
    }
    const mapa = new Map<string, LojaComPapeis[]>();
    for (const l of [...lojas.values()].sort((a, b) => a.nome.localeCompare(b.nome))) {
      mapa.set(l.praca, [...(mapa.get(l.praca) ?? []), l]);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  const aviso = (texto: string) => (
    <p className="rounded-lg bg-info px-3 py-2 text-sm text-info-foreground">{texto}</p>
  );
  if (perfil === "admin") return aviso("Admin vê todas as lojas.");
  if (perfil === "acompanhamento")
    return aviso("Acompanhamento vê todas as lojas, só leitura, com custo e margem.");
  if (veTodas) return aviso("Vê todas as lojas (diretoria). Sem custo, margem nem telas de admin.");
  if (!m) {
    return (
      <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
        Sem matrícula: o escopo vem da hierarquia (dGerentes) pela matrícula. Sem ela, nenhuma loja.
      </p>
    );
  }
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando a hierarquia…</p>;
  if (!porPraca.length) {
    return (
      <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
        A matrícula {m} não aparece na hierarquia (dGerentes): nenhuma loja.
      </p>
    );
  }
  const total = porPraca.reduce((s, [, itens]) => s + itens.length, 0);
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {total} {total === 1 ? "loja" : "lojas"}, pela hierarquia da dGerentes (muda junto com ela).
      </p>
      <div className="max-h-72 space-y-3 overflow-auto rounded-xl border p-3">
        {porPraca.map(([praca, itens]) => (
          <div key={praca}>
            <div className="mb-1 text-sm font-bold text-ink">{praca}</div>
            <ul className="grid gap-1 sm:grid-cols-2">
              {itens.map((l) => (
                <li key={l.bcps} className="truncate text-sm">
                  {l.nome} <span className="text-muted-foreground">· {l.bcps}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    ({l.papeis.map((p) => ROTULO_NIVEL[p]).join(", ")})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
