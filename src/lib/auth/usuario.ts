// Regras de usuário e senha (puras — usadas no navegador e no servidor).

/** Domínio técnico do e-mail interno do Supabase Auth. O usuário nunca vê isso. */
export const DOMINIO_INTERNO = "sacola.gentilnegocios.com.br";

/** Mesmo formato exigido pela coluna `perfis.usuario` no banco. */
const USUARIO_RE = /^[a-z0-9._-]{3,40}$/;

/** Palavras ignoradas ao sugerir o usuário a partir do nome. */
const CONECTORES = new Set(["de", "da", "do", "das", "dos", "e"]);

export function normalizarUsuario(valor: string): string {
  return valor.trim().toLowerCase();
}

export function usuarioValido(usuario: string): boolean {
  return USUARIO_RE.test(usuario);
}

export function emailDoUsuario(usuario: string): string {
  return `${normalizarUsuario(usuario)}@${DOMINIO_INTERNO}`;
}

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Sugere `nome.sobrenome` (primeiro e último nome), em minúsculas e sem acento.
 * Ex.: "Liane Seabra" → "liane.seabra"; "Maria da Silva Souza" → "maria.souza".
 */
export function sugerirUsuario(nome: string): string {
  const partes = semAcento(nome)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p && !CONECTORES.has(p));
  const primeiro = partes[0];
  if (primeiro === undefined) return "";
  const ultimo = partes.length > 1 ? partes[partes.length - 1] : undefined;
  const sugestao = ultimo ? `${primeiro}.${ultimo}` : primeiro;
  return sugestao.slice(0, 40);
}

export const REGRA_SENHA = "Mínimo de 8 caracteres, com pelo menos uma letra e um número.";

export function senhaValida(senha: string): boolean {
  return senha.length >= 8 && /[A-Za-z]/.test(senha) && /[0-9]/.test(senha);
}
