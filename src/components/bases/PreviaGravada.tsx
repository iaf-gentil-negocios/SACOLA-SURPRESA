import { useQuery } from "@tanstack/react-query";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { BaseId } from "@/lib/bases/esquemas";

type Linha = Record<string, unknown>;
const N = 5;

/** As primeiras linhas gravadas de cada base (admin). */
async function primeirasLinhas(base: BaseId, ciclo: number | null): Promise<Linha[]> {
  const r = await (() => {
    switch (base) {
      case "lojas":
        return supabase
          .from("lojas")
          .select("bcps, nome, praca, tipo, ativo")
          .order("bcps")
          .limit(N);
      case "gerentes":
        return supabase
          .from("gerentes_lojas")
          .select("bcps, nivel, matricula")
          .order("bcps")
          .limit(N);
      case "vendedoras":
        return supabase
          .from("lojas")
          .select("bcps, nome, vendedoras")
          .gt("vendedoras", 0)
          .order("bcps")
          .limit(N);
      case "produtos":
        return supabase
          .from("produtos")
          .select("sku, descricao, marca, fornecedor")
          .order("sku")
          .limit(N);
      case "cobertura":
        return supabase.from("estoque").select("bcps, sku, estoque, preco, vmd").limit(N);
      case "promocao":
        return supabase
          .from("promocoes")
          .select("sku, desconto_pct, ressarcimento_bso")
          .eq("ciclo", ciclo ?? 0)
          .order("sku")
          .limit(N);
      case "faturamento":
        return supabase
          .from("faturamento_mensal")
          .select("bcps, mes, faturamento, boletos")
          .order("mes", { ascending: false })
          .limit(N);
    }
  })();
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as unknown as Linha[];
}

const valor = (v: unknown) =>
  v === null || v === undefined
    ? "—"
    : typeof v === "boolean"
      ? v
        ? "sim"
        : "não"
      : typeof v === "number"
        ? v.toLocaleString("pt-BR")
        : String(v);

/** Prévia do que está gravado hoje (não do arquivo). */
export function PreviaGravada({ base, ciclo }: { base: BaseId; ciclo: number | null }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["bases-previa-gravada", base, base === "promocao" ? ciclo : null],
    queryFn: () => primeirasLinhas(base, ciclo),
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando a prévia…</p>;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!data?.length)
    return <p className="text-sm text-muted-foreground">Nada gravado nesta base.</p>;
  const colunas = Object.keys(data[0]!);
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            {colunas.map((c) => (
              <TableHead key={c} className="whitespace-nowrap">
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((l, i) => (
            <TableRow key={i}>
              {colunas.map((c) => (
                <TableCell key={c} className="max-w-64 truncate whitespace-nowrap text-xs">
                  {valor(l[c])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
