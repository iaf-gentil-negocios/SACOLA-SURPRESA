import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

/**
 * Lista em ordem de prioridade (1º = mais importante). Arrastar muda a ordem; os botões ↑↓
 * fazem o mesmo no celular (onde arrastar não funciona bem). Sem biblioteca nova.
 * Cada item tem a chave "Usar / Não usar": desligado não influencia nada (a posição fica guardada).
 */
export function OrdemArrastavel<T extends string>({
  itens,
  rotulos,
  desligados,
  primeiraPosicao = 1,
  aoMudar,
  aoAlternar,
}: {
  itens: T[];
  rotulos: Record<T, { nome: string; detalhe?: string }>;
  desligados: T[];
  /** Número do 1º item ligado (ex.: 2 quando a promoção ocupa o 1º lugar). */
  primeiraPosicao?: number;
  aoMudar: (novo: T[]) => void;
  aoAlternar: (item: T, usar: boolean) => void;
}) {
  const [arrastando, setArrastando] = useState<number | null>(null);
  const mover = (de: number, para: number) => {
    if (para < 0 || para >= itens.length || de === para) return;
    const novo = [...itens];
    const [x] = novo.splice(de, 1);
    novo.splice(para, 0, x!);
    aoMudar(novo);
  };
  let posicao = primeiraPosicao - 1;

  return (
    <ol className="space-y-1.5">
      {itens.map((k, i) => {
        const usar = !desligados.includes(k);
        if (usar) posicao++;
        return (
          <li
            key={k}
            draggable
            onDragStart={(e) => {
              setArrastando(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (arrastando !== null) mover(arrastando, i);
              setArrastando(null);
            }}
            onDragEnd={() => setArrastando(null)}
            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${
              usar ? "bg-card" : "bg-muted text-muted-foreground"
            } ${arrastando === i ? "opacity-50" : ""}`}
          >
            <GripVertical
              className="size-4 flex-none cursor-grab text-muted-foreground"
              aria-hidden
            />
            <span className="w-5 flex-none text-right font-bold tabular-nums text-muted-foreground">
              {usar ? posicao : "–"}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`font-semibold ${usar ? "" : "line-through"}`}>
                {rotulos[k].nome}
              </span>
              {rotulos[k].detalhe && (
                <span className="block text-xs text-muted-foreground">{rotulos[k].detalhe}</span>
              )}
            </span>
            <label className="flex flex-none items-center gap-1.5 text-xs">
              <Switch
                checked={usar}
                onCheckedChange={(v) => aoAlternar(k, v)}
                aria-label={`Usar ${rotulos[k].nome}`}
              />
              <span className="hidden w-14 sm:inline">{usar ? "Usar" : "Não usar"}</span>
            </label>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7"
              disabled={i === 0}
              onClick={() => mover(i, i - 1)}
              aria-label={`Subir ${rotulos[k].nome}`}
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7"
              disabled={i === itens.length - 1}
              onClick={() => mover(i, i + 1)}
              aria-label={`Descer ${rotulos[k].nome}`}
            >
              <ArrowDown />
            </Button>
          </li>
        );
      })}
    </ol>
  );
}
