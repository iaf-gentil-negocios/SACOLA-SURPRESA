// Quem vê o mapa do dashboard (P3, 13/10/2026). Configuração única: para mudar, edite a lista.
// Papéis: admin, acompanhamento, diretoria ("vê todas"), e os níveis da hierarquia da dGerentes
// (grvo, gcvo_gpvo, gvo). Quem tem mais de um papel vê se algum deles estiver na lista.
export type PapelMapa = "admin" | "acompanhamento" | "diretoria" | "grvo" | "gcvo_gpvo" | "gvo";

export const PAPEIS_QUE_VEEM_O_MAPA: readonly PapelMapa[] = [
  "admin",
  "acompanhamento",
  "diretoria",
  "grvo",
  "gcvo_gpvo",
];

/** Papéis do usuário: perfil do app + "vê todas" + níveis dele na hierarquia (função meus_niveis). */
export function papeisDoUsuario(
  perfil: { perfil: string; ve_todas?: boolean | null },
  niveis: readonly string[],
): PapelMapa[] {
  const p = new Set<PapelMapa>();
  if (perfil.perfil === "admin") p.add("admin");
  if (perfil.perfil === "acompanhamento") p.add("acompanhamento");
  if (perfil.ve_todas) p.add("diretoria");
  // perfis antigos (antes da parte C) ainda valem como o nível
  if (perfil.perfil === "grvo") p.add("grvo");
  if (perfil.perfil === "gcvo_gpvo") p.add("gcvo_gpvo");
  for (const n of niveis) if (n === "grvo" || n === "gcvo_gpvo" || n === "gvo") p.add(n);
  return [...p];
}

export const veOMapa = (papeis: readonly PapelMapa[]) =>
  papeis.some((p) => PAPEIS_QUE_VEEM_O_MAPA.includes(p));
