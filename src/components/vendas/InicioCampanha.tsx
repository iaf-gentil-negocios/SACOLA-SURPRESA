// Início da campanha por ciclo (F2b): define a janela do ruído (8 semanas antes) e o começo do
// período de vendas do ciclo (até o fim do ciclo). Vazio = início do ciclo.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CHAVES, repositorio } from "@/lib/dados";
import type { CicloMotor } from "@/lib/motor/metas";
import { janelaDoHistorico } from "@/lib/vendas/ruido";
import { CHAVE_VENDAS, periodoDaCampanha, recalcularRuido } from "@/lib/vendas/usaVendas";

const dataBR = (d: string) => d.split("-").reverse().join("/");

export function InicioCampanha({ ciclo, soLeitura }: { ciclo: CicloMotor; soLeitura: boolean }) {
  const queryClient = useQueryClient();
  const [valor, setValor] = useState(ciclo.inicioCampanha ?? "");
  const [gravando, setGravando] = useState(false);
  useEffect(() => setValor(ciclo.inicioCampanha ?? ""), [ciclo]);
  const p = periodoDaCampanha({ ...ciclo, inicioCampanha: valor || null });
  const j = janelaDoHistorico(p.inicio);
  const mudou = (valor || null) !== (ciclo.inicioCampanha ?? null);

  const salvar = async () => {
    setGravando(true);
    try {
      await repositorio.salvarInicioCampanha(ciclo.id, valor || null);
      await recalcularRuido([{ ...ciclo, inicioCampanha: valor || null }]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ciclos"] }),
        queryClient.invalidateQueries({ queryKey: CHAVES.ciclos }),
        queryClient.invalidateQueries({ queryKey: CHAVE_VENDAS }),
      ]);
      toast.success(`Início da campanha do ${ciclo.nome} salvo; ruído recalculado.`);
    } catch (e) {
      toast.error(`Não foi possível salvar: ${(e as Error).message}`);
    } finally {
      setGravando(false);
    }
  };

  return (
    <section className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
      <div className="space-y-1.5">
        <Label htmlFor="inicio-campanha">Início da campanha — {ciclo.nome}</Label>
        <Input
          id="inicio-campanha"
          type="date"
          className="w-44"
          value={valor}
          disabled={soLeitura || gravando}
          onChange={(e) => setValor(e.target.value)}
        />
      </div>
      {!soLeitura && (
        <Button onClick={() => void salvar()} disabled={!mudou || gravando}>
          {gravando ? "Salvando…" : "Salvar início"}
        </Button>
      )}
      <p className="max-w-xl text-xs text-muted-foreground">
        Vendas da Sacola contam de <b>{dataBR(p.inicio)}</b> até o fim do ciclo ({dataBR(p.fim)}).
        Ruído = mediana das vendas do App Delivery de {dataBR(j.inicio)} a {dataBR(j.fim)} (8
        semanas antes), por loja e dia da semana. {valor ? "" : "Vazio = início do ciclo."}
      </p>
    </section>
  );
}
