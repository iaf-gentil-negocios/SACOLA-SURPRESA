// Modo de teste local: `bun run local` (servidor de desenvolvimento com --mode seed;
// o Vite não aceita mais "local" como nome de modo, por causa dos arquivos .env.local).
// Sem login e sem Lovable: os dados vêm da pasta seed/ e as simulações ficam no navegador.
// Só existe no servidor de desenvolvimento: na build de produção `import.meta.env.DEV` é false,
// então este modo some do código publicado.
import type { Perfil } from "@/lib/auth/sessao";

export const MODO_LOCAL: boolean = import.meta.env.DEV && import.meta.env.MODE === "seed";

export const PERFIL_LOCAL: Perfil = {
  user_id: "00000000-0000-0000-0000-000000000000",
  usuario: "modo.local",
  nome: "Modo local (teste)",
  perfil: "admin",
  ativo: true,
  troca_senha: false,
  matricula: null,
  ve_todas: true,
  criado_em: new Date(0).toISOString(),
  atualizado_em: new Date(0).toISOString(),
};

const CHAVE_PERFIL = "sacola.perfil-local";

/**
 * Perfil do modo local. `?perfil=acompanhamento` na URL testa o perfil Acompanhamento (F2a);
 * `?perfil=admin` volta ao admin. A escolha vale para esta aba.
 */
export function perfilLocal(): Perfil {
  let escolhido: string | null = null;
  try {
    const daUrl = new URLSearchParams(window.location.search).get("perfil");
    if (daUrl) sessionStorage.setItem(CHAVE_PERFIL, daUrl);
    escolhido = sessionStorage.getItem(CHAVE_PERFIL);
  } catch {
    // sem sessionStorage: fica o admin
  }
  if (escolhido !== "acompanhamento") return PERFIL_LOCAL;
  return {
    ...PERFIL_LOCAL,
    nome: "Modo local (Acompanhamento)",
    perfil: "acompanhamento" as Perfil["perfil"],
  };
}
