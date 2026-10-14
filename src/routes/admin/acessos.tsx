import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, KeyRound, Pencil, Power, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { HistoricoAcessos } from "@/components/acessos/HistoricoAcessos";
import { LoteDialog } from "@/components/acessos/LoteDialog";
import { SenhaGeradaDialog, type SenhaGerada } from "@/components/acessos/SenhaGeradaDialog";
import { UsuarioDialog, type DadosUsuario } from "@/components/acessos/UsuarioDialog";
import { CabecalhoPagina } from "@/components/layout/CabecalhoPagina";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROTULO_NIVEL } from "@/lib/acessos/hierarquia";
import { soAdmin } from "@/lib/auth/leitura";
import { ROTULO_PERFIL } from "@/lib/auth/rotulos";
import { CHAVES } from "@/lib/dados";
import { iniciarVerComo } from "@/lib/gerente/visao";
import {
  criarUsuario,
  definirAtivo,
  editarUsuario,
  listarUsuarios,
  redefinirSenha,
  type UsuarioListado,
} from "@/lib/acessos/usuarios.functions";

export const Route = createFileRoute("/admin/acessos")({
  beforeLoad: soAdmin,
  component: Acessos,
});

function dataHora(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "Nunca";
}

function Acessos() {
  const { perfil: eu } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<UsuarioListado | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [senha, setSenha] = useState<SenhaGerada | null>(null);
  const [confirmarAtivo, setConfirmarAtivo] = useState<UsuarioListado | null>(null);
  const [loteAberto, setLoteAberto] = useState(false);
  const navigate = useNavigate();

  /** "Ver como gerente": abre as telas do gerente com o escopo dele, só leitura. */
  const verComo = (u: UsuarioListado) => {
    iniciarVerComo(u.user_id);
    void navigate({ to: "/gerente" });
  };

  const {
    data: usuarios,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["usuarios"],
    // relida só depois de uma alteração (recarregar) ou ao recarregar a página
    staleTime: Infinity,
    queryFn: async () => {
      const r = await listarUsuarios();
      if (!r.ok) throw new Error(r.erro);
      return r.usuarios;
    },
  });
  const recarregar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["usuarios"] }),
      // os avisos de Lojas e de Dados gerais dependem dos perfis
      queryClient.invalidateQueries({ queryKey: CHAVES.hierarquia }),
    ]);

  const abrirNovo = () => {
    setEditando(null);
    setDialogAberto(true);
  };
  const abrirEdicao = (u: UsuarioListado) => {
    setEditando(u);
    setDialogAberto(true);
  };

  const salvar = async (d: DadosUsuario): Promise<string | null> => {
    if (editando) {
      const r = await editarUsuario({
        data: {
          userId: editando.user_id,
          nome: d.nome,
          perfil: d.perfil,
          matricula: d.matricula,
          ve_todas: d.ve_todas,
        },
      });
      if (!r.ok) return r.erro;
      toast.success("Usuário atualizado.");
    } else {
      const r = await criarUsuario({ data: d });
      if (!r.ok) return r.erro;
      setSenha({ usuario: r.usuario, senha: r.senha, novo: true });
    }
    setDialogAberto(false);
    recarregar();
    return null;
  };

  const novaSenha = async (u: UsuarioListado) => {
    const r = await redefinirSenha({ data: { userId: u.user_id } });
    if (!r.ok) {
      toast.error(r.erro);
      return;
    }
    setSenha({ usuario: r.usuario, senha: r.senha, novo: false });
    recarregar();
  };

  const trocarAtivo = async (u: UsuarioListado) => {
    setConfirmarAtivo(null);
    const r = await definirAtivo({ data: { userId: u.user_id, ativo: !u.ativo } });
    if (!r.ok) {
      toast.error(r.erro);
      return;
    }
    toast.success(u.ativo ? `${u.nome} foi desativado(a).` : `${u.nome} foi reativado(a).`);
    recarregar();
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Acessos"
        descricao="Usuários, perfis e histórico de acessos. O escopo de cada gerente vem da hierarquia (dGerentes), pela matrícula."
        acoes={
          <>
            <Button variant="outline" onClick={() => setLoteAberto(true)}>
              <Users /> Criar usuários da hierarquia
            </Button>
            <Button onClick={abrirNovo}>
              <UserPlus /> Novo usuário
            </Button>
          </>
        }
      />

      <Tabs defaultValue="usuarios">
        <TabsList>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios" className="mt-4">
          {error && <p className="mb-3 text-sm text-destructive">{(error as Error).message}</p>}
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Escopo</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Último acesso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Carregando…
                    </TableCell>
                  </TableRow>
                )}
                {usuarios?.map((u) => (
                  <TableRow key={u.user_id}>
                    <TableCell className="font-semibold text-ink">{u.nome}</TableCell>
                    <TableCell className="font-mono text-xs">{u.usuario}</TableCell>
                    <TableCell>{ROTULO_PERFIL[u.perfil]}</TableCell>
                    <TableCell>
                      <div>
                        {u.todas
                          ? u.perfil === "admin" || u.perfil === "acompanhamento"
                            ? "Todas"
                            : "Todas (vê todas as lojas)"
                          : u.lojas.length
                            ? `${u.lojas.length} ${u.lojas.length === 1 ? "loja" : "lojas"}`
                            : "Nenhuma"}
                      </div>
                      {u.papeis.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {u.papeis.map((p) => ROTULO_NIVEL[p]).join(" + ")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.ativo ? (
                          <Badge className="bg-success-soft text-success-foreground hover:bg-success-soft">
                            Ativo
                          </Badge>
                        ) : (
                          <Badge className="bg-bad-soft text-destructive hover:bg-bad-soft">
                            Inativo
                          </Badge>
                        )}
                        {u.troca_senha && (
                          <Badge className="bg-warn-soft text-warn hover:bg-warn-soft">
                            Troca de senha pendente
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {dataHora(u.ultimo_acesso)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {u.perfil !== "admin" && u.perfil !== "acompanhamento" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!u.ativo}
                            onClick={() => verComo(u)}
                            aria-label={`Ver como ${u.nome}`}
                          >
                            <Eye /> Ver como
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => abrirEdicao(u)}
                          aria-label={`Editar ${u.nome}`}
                        >
                          <Pencil /> Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => novaSenha(u)}
                          aria-label={`Nova senha para ${u.nome}`}
                        >
                          <KeyRound /> Nova senha
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={u.user_id === eu.user_id}
                          title={
                            u.user_id === eu.user_id
                              ? "Você não pode desativar a própria conta"
                              : undefined
                          }
                          onClick={() => setConfirmarAtivo(u)}
                        >
                          <Power /> {u.ativo ? "Desativar" : "Reativar"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <HistoricoAcessos usuarios={usuarios ?? []} />
        </TabsContent>
      </Tabs>

      <LoteDialog
        aberto={loteAberto}
        aoFechar={() => setLoteAberto(false)}
        aoConcluir={recarregar}
      />
      <UsuarioDialog
        aberto={dialogAberto}
        usuario={editando}
        aoFechar={() => setDialogAberto(false)}
        aoSalvar={salvar}
      />
      <SenhaGeradaDialog dados={senha} aoFechar={() => setSenha(null)} />

      <AlertDialog
        open={confirmarAtivo !== null}
        onOpenChange={(a) => !a && setConfirmarAtivo(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmarAtivo?.ativo
                ? `Desativar ${confirmarAtivo?.nome}?`
                : `Reativar ${confirmarAtivo?.nome}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmarAtivo?.ativo
                ? "A pessoa não consegue mais entrar e perde o acesso aos dados. O histórico é mantido. Dá para reativar depois."
                : "A pessoa volta a entrar com a senha que tinha e recupera o acesso ao seu escopo."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmarAtivo && trocarAtivo(confirmarAtivo)}>
              {confirmarAtivo?.ativo ? "Desativar" : "Reativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
