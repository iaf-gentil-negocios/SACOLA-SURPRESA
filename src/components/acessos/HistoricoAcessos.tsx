import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

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
import { supabase } from "@/integrations/supabase/client";
import { ROTULO_EVENTO } from "@/lib/auth/rotulos";
import type { UsuarioListado } from "@/lib/acessos/usuarios.functions";

const LIMITE = 500;

function dataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function detalheTexto(d: unknown): string {
  if (d == null) return "";
  if (typeof d === "object") {
    return Object.entries(d as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(" · ");
  }
  return String(d);
}

export function HistoricoAcessos({ usuarios }: { usuarios: UsuarioListado[] }) {
  const [pessoa, setPessoa] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const nomes = new Map(usuarios.map((u) => [u.user_id, u.nome]));

  const { data, isLoading, error } = useQuery({
    queryKey: ["acessos", pessoa, de, ate],
    queryFn: async () => {
      let q = supabase
        .from("acessos_log")
        .select("id, user_id, evento, detalhe, criado_em")
        .order("criado_em", { ascending: false })
        .limit(LIMITE);
      if (pessoa) q = q.eq("user_id", pessoa);
      if (de) q = q.gte("criado_em", new Date(`${de}T00:00:00`).toISOString());
      if (ate) q = q.lte("criado_em", new Date(`${ate}T23:59:59.999`).toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="h-pessoa">Pessoa</Label>
          <select
            id="h-pessoa"
            className="h-9 rounded-md border bg-card px-3 text-sm"
            value={pessoa}
            onChange={(e) => setPessoa(e.target.value)}
          >
            <option value="">Todas</option>
            {usuarios.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="h-de">De</Label>
          <Input id="h-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="h-ate">Até</Label>
          <Input id="h-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">Falha ao carregar o histórico.</p>}
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data e hora</TableHead>
              <TableHead>Pessoa</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Detalhe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Nenhum acesso no período.
                </TableCell>
              </TableRow>
            )}
            {data?.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {dataHora(a.criado_em)}
                </TableCell>
                <TableCell>{(a.user_id && nomes.get(a.user_id)) ?? "—"}</TableCell>
                <TableCell>{ROTULO_EVENTO[a.evento]}</TableCell>
                <TableCell className="text-muted-foreground">{detalheTexto(a.detalhe)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {data?.length === LIMITE && (
        <p className="text-xs text-muted-foreground">
          Mostrando os {LIMITE} mais recentes. Use os filtros para refinar.
        </p>
      )}
    </div>
  );
}
