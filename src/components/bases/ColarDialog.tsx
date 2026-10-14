import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { Cartao } from "@/lib/bases/cartoes";

/**
 * Colar do Excel (parte D): o texto copiado (com cabeçalho) vira um arquivo .txt e segue o mesmo
 * caminho do upload — mesmo leitor (tab, ";" ou ","), mesma validação e mesma prévia.
 */
export function ColarDialog({
  cartao,
  aoFechar,
  aoAnalisar,
}: {
  cartao: Cartao | null;
  aoFechar: () => void;
  aoAnalisar: (arquivo: File) => void;
}) {
  const [texto, setTexto] = useState("");
  useEffect(() => {
    if (cartao) setTexto("");
  }, [cartao]);

  const linhas = texto ? texto.split(/\r?\n/).filter((l) => l.trim()).length : 0;
  const analisar = () => {
    if (!cartao) return;
    aoAnalisar(new File([texto], `colado-${cartao.base}.txt`, { type: "text/plain" }));
  };

  return (
    <Dialog open={cartao !== null} onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Colar dados: {cartao?.titulo}</DialogTitle>
          <DialogDescription>
            No Excel, selecione a tabela <b>com a linha de cabeçalho</b>, copie (Ctrl+C) e cole
            aqui. Depois vem a mesma prévia e validação do envio de arquivo; ao confirmar, os dados
            substituem a base.
          </DialogDescription>
        </DialogHeader>
        {cartao?.grande && (
          <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            Esta base é muito grande (centenas de milhares de linhas): prefira <b>Enviar arquivo</b>
            . Colar só funciona para recortes pequenos e pode travar o navegador.
          </p>
        )}
        <Textarea
          className="h-72 font-mono text-xs"
          placeholder={"Cole aqui (cabeçalho na primeira linha)"}
          value={texto}
          spellCheck={false}
          onChange={(e) => setTexto(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {linhas ? `${linhas.toLocaleString("pt-BR")} linha(s), contando o cabeçalho.` : " "}
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={analisar} disabled={linhas < 2}>
            Ver prévia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
