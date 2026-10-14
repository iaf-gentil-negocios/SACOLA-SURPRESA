import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";

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
import { supabase } from "@/integrations/supabase/client";
import { ROTULO_PERFIL } from "@/lib/auth/rotulos";
import { sugerirUsuario, usuarioValido } from "@/lib/auth/usuario";
import type { UsuarioListado } from "@/lib/acessos/usuarios.functions";
import { EscopoEditor } from "./EscopoEditor";

type PerfilTipo = UsuarioListado["perfil"];

const PERFIS = Object.keys(ROTULO_PERFIL) as PerfilTipo[];

export interface DadosUsuario {
  nome: string;
  usuario: string;
  perfil: PerfilTipo;
  matricula: string | null;
  ve_todas: boolean;
}

/** Criar (sem `usuario`) ou editar (com `usuario`). O nome de usuário não muda depois de criado. */
export function UsuarioDialog({
  aberto,
  usuario,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  usuario: UsuarioListado | null;
  aoFechar: () => void;
  aoSalvar: (dados: DadosUsuario) => Promise<string | null>;
}) {
  const editando = usuario !== null;
  const [nome, setNome] = useState("");
  const [login, setLogin] = useState("");
  const [loginEditado, setLoginEditado] = useState(false);
  const [perfil, setPerfil] = useState<PerfilTipo>("gerente");
  const [matricula, setMatricula] = useState("");
  const [veTodas, setVeTodas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // gerentes da base de gerentes (para escolher a matrícula pelo nome)
  const { data: gerentes } = useQuery({
    queryKey: ["gerentes"],
    enabled: aberto,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gerentes")
        .select("matricula, nome")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });
  const nomeDoGerente = gerentes?.find((g) => g.matricula === matricula.trim())?.nome;

  useEffect(() => {
    if (!aberto) return;
    setNome(usuario?.nome ?? "");
    setLogin(usuario?.usuario ?? "");
    setLoginEditado(editando);
    setPerfil(usuario?.perfil ?? "gerente");
    setMatricula(usuario?.matricula ?? "");
    setVeTodas(usuario?.ve_todas ?? false);
    setErro(null);
  }, [aberto, usuario, editando]);

  const mudarNome = (valor: string) => {
    setNome(valor);
    if (!loginEditado) setLogin(sugerirUsuario(valor));
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (nome.trim().length < 2) return setErro("Informe o nome completo.");
    if (!usuarioValido(login)) {
      return setErro(
        "Usuário inválido: use 3 a 40 letras minúsculas, números, ponto, hífen ou _ (ex.: liane.seabra).",
      );
    }
    setSalvando(true);
    const falha = await aoSalvar({
      nome: nome.trim(),
      usuario: login,
      perfil,
      matricula: matricula.trim() || null,
      ve_todas: perfil !== "admin" && perfil !== "acompanhamento" && veTodas,
    });
    setSalvando(false);
    if (falha) setErro(falha);
  };

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={enviar} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editando ? `Editar ${usuario.nome}` : "Novo usuário"}</DialogTitle>
            <DialogDescription>
              {editando
                ? "Altere nome, perfil e matrícula. O nome de usuário não muda; o escopo vem da hierarquia."
                : "O sistema gera uma senha provisória, mostrada uma única vez ao final."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="nome">Nome completo</Label>
              <Input id="nome" value={nome} onChange={(e) => mudarNome(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login">Usuário</Label>
              <Input
                id="login"
                value={login}
                disabled={editando}
                autoCapitalize="none"
                spellCheck={false}
                placeholder="nome.sobrenome"
                onChange={(e) => {
                  setLogin(e.target.value.toLowerCase().replace(/\s/g, ""));
                  setLoginEditado(true);
                }}
                required
              />
              {!editando && (
                <p className="text-xs text-muted-foreground">Sugerido pelo nome; pode editar.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="perfil">Perfil</Label>
              <select
                id="perfil"
                className="h-9 w-full rounded-md border bg-card px-3 text-sm"
                value={perfil}
                onChange={(e) => setPerfil(e.target.value as PerfilTipo)}
              >
                {/* novos: Admin, Acompanhamento ou Gerente; GRVO e GCVO/GPVO só para quem já tem */}
                {PERFIS.filter(
                  (p) =>
                    p === "admin" ||
                    p === "acompanhamento" ||
                    p === "gerente" ||
                    p === usuario?.perfil,
                ).map((p) => (
                  <option key={p} value={p}>
                    {ROTULO_PERFIL[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="matricula">Matrícula (opcional)</Label>
              <Input
                id="matricula"
                list="lista-gerentes"
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
              />
              <datalist id="lista-gerentes">
                {gerentes?.map((g) => (
                  <option key={g.matricula} value={g.matricula}>
                    {g.nome}
                  </option>
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                Liga o usuário à hierarquia (dGerentes): define as lojas que ele vê
                {nomeDoGerente ? ` (${nomeDoGerente})` : ""}.
              </p>
            </div>
          </div>

          {perfil === "acompanhamento" && (
            <p className="rounded-lg bg-info px-3 py-2 text-sm text-info-foreground">
              <b>Acompanhamento:</b> vê o dashboard e as telas do admin só leitura, em todas as
              lojas, com custo e margem. Sem Motor do Mix, Bases e Acessos; não altera nada.
            </p>
          )}
          {perfil !== "admin" && perfil !== "acompanhamento" && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={veTodas}
                onCheckedChange={(v) => setVeTodas(v === true)}
              />
              <span>
                <b>Vê todas as lojas</b> (diretoria). Continua com perfil de gerente: sem custo,
                margem nem telas de admin.
              </span>
            </label>
          )}

          <div className="space-y-1.5">
            <Label>Escopo (lojas)</Label>
            <EscopoEditor perfil={perfil} matricula={matricula} veTodas={veTodas} />
          </div>

          {erro && (
            <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-destructive">
              {erro}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : editando ? "Salvar" : "Criar usuário"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
