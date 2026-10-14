import { TriangleAlert } from "lucide-react";

/** Ciclo sem base de promoção: com a promoção "obrigatória", o herói sai dos de VMD alto. */
export function AvisoSemPromocao({ ciclo }: { ciclo: number }) {
  return (
    <p
      role="status"
      className="mb-4 flex items-start gap-2 rounded-xl bg-warn-soft px-4 py-2.5 text-sm text-warn"
    >
      <TriangleAlert className="mt-0.5 size-4 flex-none" aria-hidden />
      <span>
        <b>Ciclo {ciclo} sem base de promoção:</b> com a promoção “obrigatória” no herói, o herói
        sai dos produtos de VMD alto. Suba a promoção do ciclo em Bases.
      </span>
    </p>
  );
}
