import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface SenhaGerada {
  usuario: string;
  senha: string;
  novo: boolean;
}

/** Mostra a senha provisória UMA vez. Ao fechar, ela some (não fica guardada em lugar nenhum). */
export function SenhaGeradaDialog({
  dados,
  aoFechar,
}: {
  dados: SenhaGerada | null;
  aoFechar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    if (!dados) return;
    try {
      await navigator.clipboard.writeText(
        `Usuário: ${dados.usuario}\nSenha provisória: ${dados.senha}`,
      );
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <Dialog
      open={dados !== null}
      onOpenChange={(aberto) => {
        if (!aberto) {
          setCopiado(false);
          aoFechar();
        }
      }}
    >
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{dados?.novo ? "Usuário criado" : "Senha redefinida"}</DialogTitle>
          <DialogDescription>
            Passe estes dados para a pessoa. A senha aparece <b>só agora</b>: depois de fechar, não
            dá para ver de novo (só gerar outra). No primeiro acesso ela vai ter que criar uma senha
            própria.
          </DialogDescription>
        </DialogHeader>
        {dados && (
          <div className="space-y-2 rounded-xl bg-muted p-4 font-mono text-sm">
            <div>
              <span className="text-muted-foreground">Usuário: </span>
              <b>{dados.usuario}</b>
            </div>
            <div>
              <span className="text-muted-foreground">Senha provisória: </span>
              <b className="select-all">{dados.senha}</b>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={copiar}>
            {copiado ? <Check /> : <Copy />}
            {copiado ? "Copiado" : "Copiar usuário e senha"}
          </Button>
          <Button onClick={aoFechar}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
