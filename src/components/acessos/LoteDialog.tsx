import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  pessoasDaHierarquia,
  ROTULO_NIVEL,
  type PessoaHierarquia,
  type Vinculo,
} from "@/lib/acessos/hierarquia";
import { criarUsuariosEmLote, type ResultadoLote } from "@/lib/acessos/usuarios.functions";
import { REGRA_SENHA, senhaValida, usuarioValido } from "@/lib/auth/usuario";
import { lerLojasCompletas } from "@/lib/lojas/lojas";
import { entraNoPlano } from "@/lib/lojas/regras";

interface Linha extends PessoaHierarquia {
  incluir: boolean;
  usuario: string;
  veTodas: boolean;
}

/** Pessoas da hierarquia das lojas que participam (e estão ativas) e os usuários que já existem. */
function useDadosDoLote(aberto: boolean) {
  return useQuery({
    queryKey: ["lote-hierarquia"],
    enabled: aberto,
    queryFn: async () => {
      const vinculos: Vinculo[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase
          .from("gerentes_lojas")
          .select("matricula, bcps, nivel")
          .order("matricula")
          .order("bcps")
          .range(de, de + 999);
        if (error) throw error;
        vinculos.push(...data);
        if (data.length < 1000) break;
      }
      const [gerentes, perfis, lojas] = await Promise.all([
        supabase.from("gerentes").select("matricula, nome"),
        supabase.from("perfis").select("usuario, matricula"),
        lerLojasCompletas(),
      ]);
      if (gerentes.error) throw gerentes.error;
      if (perfis.error) throw perfis.error;
      const participam = new Set(lojas.filter(entraNoPlano).map((l) => l.bcps));
      return {
        pessoas: pessoasDaHierarquia(
          vinculos,
          new Map(gerentes.data.map((g) => [g.matricula, g.nome])),
          participam,
        ),
        usuarios: new Set(perfis.data.map((p) => p.usuario)),
        matriculas: new Set(perfis.data.map((p) => p.matricula).filter((m): m is string => !!m)),
      };
    },
  });
}

/**
 * Cria em lote os usuários da hierarquia (parte C): revisar a lista, digitar a senha padrão
 * (não fica gravada em lugar nenhum) e criar. Quem já existe é pulado.
 */
export function LoteDialog({
  aberto,
  aoFechar,
  aoConcluir,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const { data, isLoading, error } = useDadosDoLote(aberto);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [senha, setSenha] = useState("");
  const [criando, setCriando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoLote | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) {
      setSenha("");
      setResultado(null);
      setErro(null);
      return;
    }
    if (!data) return;
    setLinhas(
      data.pessoas.map((p) => ({
        ...p,
        usuario: p.usuarioSugerido,
        incluir: !data.matriculas.has(p.matricula),
        veTodas: false,
      })),
    );
  }, [aberto, data]);

  // situação de cada linha: já existe, login em uso, repetido na lista ou inválido
  const situacoes = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const l of linhas)
      if (l.incluir) contagem.set(l.usuario, (contagem.get(l.usuario) ?? 0) + 1);
    return linhas.map((l) => {
      if (data?.matriculas.has(l.matricula)) return { ok: false, texto: "Já tem usuário" };
      if (!usuarioValido(l.usuario)) return { ok: false, texto: "Usuário inválido" };
      if (data?.usuarios.has(l.usuario)) return { ok: false, texto: "Usuário em uso" };
      if (l.incluir && (contagem.get(l.usuario) ?? 0) > 1)
        return { ok: false, texto: "Repetido na lista" };
      return { ok: true, texto: "Novo" };
    });
  }, [linhas, data]);

  const aCriar = linhas.filter((l, i) => l.incluir && situacoes[i]?.ok);
  const bloqueadas = linhas.filter(
    (l, i) => l.incluir && !situacoes[i]?.ok && situacoes[i]?.texto !== "Já tem usuário",
  ).length;

  const mudar = (i: number, m: Partial<Linha>) =>
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...m } : l)));

  const criar = async () => {
    setErro(null);
    if (!senhaValida(senha)) return setErro(`Senha padrão: ${REGRA_SENHA}`);
    if (!aCriar.length) return setErro("Nenhum usuário novo para criar.");
    setCriando(true);
    try {
      const r = await criarUsuariosEmLote({
        data: {
          senha,
          pessoas: aCriar.map((l) => ({
            matricula: l.matricula,
            nome: l.nome,
            usuario: l.usuario,
            ve_todas: l.veTodas,
          })),
        },
      });
      if (!r.ok) return setErro(r.erro);
      setResultado({ criados: r.criados, pulados: r.pulados });
      setSenha("");
      aoConcluir();
    } finally {
      setCriando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Criar usuários da hierarquia</DialogTitle>
          <DialogDescription>
            Uma pessoa por matrícula da dGerentes nas lojas que participam. Revise o usuário
            sugerido (primeiro nome + último sobrenome). Quem já tem usuário é pulado. Todos trocam
            a senha no primeiro acesso.
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando a hierarquia…</p>}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

        {resultado ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-lg bg-success-soft px-3 py-2 text-success-foreground">
              {resultado.criados.length} usuário(s) criado(s). {resultado.pulados.length} pulado(s).
            </p>
            {resultado.pulados.length > 0 && (
              <ul className="list-inside list-disc text-muted-foreground">
                {resultado.pulados.map((p) => (
                  <li key={p.matricula}>
                    {p.usuario} ({p.matricula}): {p.motivo}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          data && (
            <>
              <p className="text-sm">
                <b>{linhas.length}</b> pessoa(s) na hierarquia ·{" "}
                <b>{linhas.length - aCriar.length}</b> já existem ou ficam de fora ·{" "}
                <b>{aCriar.length}</b> a criar
                {bloqueadas > 0 && (
                  <span className="text-warn"> · {bloqueadas} com problema no usuário</span>
                )}
              </p>
              <div className="max-h-[45vh] overflow-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Nome</TableHead>
                      <TableHead>Matrícula</TableHead>
                      <TableHead>Papéis</TableHead>
                      <TableHead className="text-right">Lojas</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Vê todas</TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map((l, i) => {
                      const s = situacoes[i]!;
                      const existe = s.texto === "Já tem usuário";
                      return (
                        <TableRow key={l.matricula} className={existe ? "opacity-60" : ""}>
                          <TableCell>
                            <Checkbox
                              aria-label={`Incluir ${l.nome}`}
                              checked={l.incluir && !existe}
                              disabled={existe}
                              onCheckedChange={(v) => mudar(i, { incluir: v === true })}
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{l.nome}</TableCell>
                          <TableCell className="tabular-nums">{l.matricula}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {l.papeis.map((p) => ROTULO_NIVEL[p]).join(", ")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{l.lojas}</TableCell>
                          <TableCell>
                            <Input
                              className="h-8 w-44 font-mono text-xs"
                              value={l.usuario}
                              disabled={existe}
                              autoCapitalize="none"
                              spellCheck={false}
                              onChange={(e) =>
                                mudar(i, {
                                  usuario: e.target.value.toLowerCase().replace(/\s/g, ""),
                                })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Checkbox
                              aria-label={`${l.nome} vê todas as lojas`}
                              checked={l.veTodas}
                              disabled={existe}
                              onCheckedChange={(v) => mudar(i, { veTodas: v === true })}
                            />
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                s.ok
                                  ? "bg-success-soft text-success-foreground hover:bg-success-soft"
                                  : existe
                                    ? "bg-muted text-muted-foreground hover:bg-muted"
                                    : "bg-warn-soft text-warn hover:bg-warn-soft"
                              }
                            >
                              {s.texto}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="senha-lote">Senha padrão (provisória)</Label>
                <Input
                  id="senha-lote"
                  type="password"
                  autoComplete="new-password"
                  className="max-w-xs"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {REGRA_SENHA} Não fica gravada no app: passe para os gerentes por um canal seguro.
                </p>
              </div>
            </>
          )
        )}

        {erro && (
          <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-destructive">
            {erro}
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={aoFechar}>
            {resultado ? "Fechar" : "Cancelar"}
          </Button>
          {!resultado && (
            <Button onClick={criar} disabled={criando || !aCriar.length || bloqueadas > 0}>
              {criando ? "Criando…" : `Criar ${aCriar.length} usuário(s)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
