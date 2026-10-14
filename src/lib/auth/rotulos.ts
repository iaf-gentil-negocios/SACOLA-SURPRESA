import type { Database } from "@/integrations/supabase/types";

/** Inclui "gerente" (parte C) e "acompanhamento" (F2a), do SQL editor, que não estão no types.ts. */
type PerfilTipo = Database["public"]["Enums"]["perfil_tipo"] | "gerente" | "acompanhamento";
type EventoAcesso = Database["public"]["Enums"]["acesso_evento"] | "abriu_dashboard";

export const ROTULO_PERFIL: Record<PerfilTipo, string> = {
  admin: "Admin",
  acompanhamento: "Acompanhamento",
  gerente: "Gerente",
  grvo: "GRVO",
  gcvo_gpvo: "GCVO/GPVO",
};

export const ROTULO_EVENTO: Record<EventoAcesso, string> = {
  login: "Entrou",
  logout: "Saiu",
  exportou_excel: "Exportou Excel",
  abriu_kits: "Abriu kits",
  abriu_dashboard: "Abriu dashboard",
};
