import { senhaValida } from "./usuario";

// Sem caracteres que se confundem ao ditar ou copiar à mão (0/O, 1/l/I).
const LETRAS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const NUMEROS = "23456789";
const TODOS = LETRAS + NUMEROS;

function sortear(alfabeto: string, n: number): string[] {
  const bytes = new Uint32Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alfabeto.charAt(b % alfabeto.length));
}

/** Senha provisória aleatória que sempre cumpre a regra (letra + número, 10 caracteres). */
export function gerarSenhaProvisoria(tamanho = 10): string {
  for (;;) {
    const senha = [...sortear(LETRAS, 1), ...sortear(NUMEROS, 1), ...sortear(TODOS, tamanho - 2)];
    // embaralha para a letra e o número não ficarem sempre no começo
    const ordem = new Uint32Array(senha.length);
    crypto.getRandomValues(ordem);
    const final = senha
      .map((c, i) => [ordem[i] ?? 0, c] as const)
      .sort((a, b) => a[0] - b[0])
      .map(([, c]) => c)
      .join("");
    if (senhaValida(final)) return final;
  }
}
