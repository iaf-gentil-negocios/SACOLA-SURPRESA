import { ShoppingBag } from "lucide-react";

import { cn } from "@/lib/utils";

export function Marca({ subtitulo, compacta }: { subtitulo?: string; compacta?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className={cn(
          "grid flex-none place-items-center rounded-xl bg-primary text-primary-foreground",
          compacta ? "size-10" : "size-12",
        )}
      >
        <ShoppingBag className={compacta ? "size-5" : "size-6"} aria-hidden />
      </div>
      <div className="min-w-0">
        <div className="truncate font-extrabold text-ink">Sacola Surpresa</div>
        {subtitulo && <div className="truncate text-xs text-muted-foreground">{subtitulo}</div>}
      </div>
    </div>
  );
}
