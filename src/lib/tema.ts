// Tema claro/escuro: segue o sistema, com escolha manual guardada no navegador.
const CHAVE = "sacola.tema";

export type Tema = "claro" | "escuro";

/** Roda no <head> antes da página aparecer, para não piscar o tema errado. */
export const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem("${CHAVE}");var e=t?t==="escuro":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",e)}catch(_){}})();`;

export function temaAtual(): Tema {
  return document.documentElement.classList.contains("dark") ? "escuro" : "claro";
}

export function definirTema(tema: Tema) {
  document.documentElement.classList.toggle("dark", tema === "escuro");
  try {
    localStorage.setItem(CHAVE, tema);
  } catch {
    // navegador sem armazenamento: o tema vale só nesta visita
  }
}
