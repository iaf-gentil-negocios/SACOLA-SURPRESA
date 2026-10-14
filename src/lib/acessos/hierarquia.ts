// Hierarquia de gerentes (parte C, 10/10/2026) — regras puras, usadas no navegador e no servidor.
// A hierarquia vem só das colunas da dGerentes, loja por loja: GVO → GCVO/GPVO → GRVO
// (tabela gerentes_lojas). A matrícula só identifica a pessoa: o número nunca define quem está acima.
// O escopo segue a mesma regra da função `lojas_de` do banco (drizzle/migrations/0002b_*.sql).
import { sugerirUsuario } from "@/lib/auth/usuario";

export type Nivel = "gvo" | "gcvo_gpvo" | "grvo";

export const ROTULO_NIVEL: Record<Nivel, string> = {
  gvo: "GVO",
  gcvo_gpvo: "GCVO/GPVO",
  grvo: "GRVO",
};

const ORDEM_NIVEL: Nivel[] = ["gvo", "gcvo_gpvo", "grvo"];

export interface Vinculo {
  matricula: string;
  bcps: string;
  nivel: Nivel;
}

export interface PerfilEscopo {
  perfil: string;
  ativo: boolean;
  matricula: string | null;
  ve_todas?: boolean | null | undefined;
}

export interface Escopo {
  /** Admin ou "vê todas as lojas". */
  todas: boolean;
  /** Lojas onde a pessoa é GVO, GCVO/GPVO ou GRVO (a soma dos papéis). */
  lojas: string[];
  papeis: Nivel[];
}

/** Lojas que o usuário vê: todas (admin, acompanhamento ou diretoria) ou a soma das lojas dos seus papéis. */
export function escopoDoPerfil(p: PerfilEscopo, vinculos: Vinculo[]): Escopo {
  const meus = p.matricula ? vinculos.filter((v) => v.matricula === p.matricula) : [];
  const papeis = ORDEM_NIVEL.filter((n) => meus.some((v) => v.nivel === n));
  if (!p.ativo) return { todas: false, lojas: [], papeis };
  return {
    todas: p.perfil === "admin" || p.perfil === "acompanhamento" || p.ve_todas === true,
    lojas: [...new Set(meus.map((v) => v.bcps))].sort(),
    papeis,
  };
}

export interface PessoaHierarquia {
  matricula: string;
  nome: string;
  papeis: Nivel[];
  lojas: number;
  usuarioSugerido: string;
}

/** Uma linha por pessoa (matrícula) da hierarquia das lojas indicadas, em ordem de nome. */
export function pessoasDaHierarquia(
  vinculos: Vinculo[],
  nomes: Map<string, string>,
  lojas: Set<string>,
): PessoaHierarquia[] {
  const por = new Map<string, { papeis: Set<Nivel>; lojas: Set<string> }>();
  for (const v of vinculos) {
    if (!lojas.has(v.bcps)) continue;
    const p = por.get(v.matricula) ?? { papeis: new Set<Nivel>(), lojas: new Set<string>() };
    p.papeis.add(v.nivel);
    p.lojas.add(v.bcps);
    por.set(v.matricula, p);
  }
  return [...por.entries()]
    .map(([matricula, p]) => {
      const nome = nomeProprio(nomes.get(matricula) ?? matricula);
      return {
        matricula,
        nome,
        papeis: ORDEM_NIVEL.filter((n) => p.papeis.has(n)),
        lojas: p.lojas.size,
        usuarioSugerido: sugerirUsuario(nome),
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e"]);

/** "PADÃ WEBSTER FEITOSA" → "Padã Webster Feitosa" (conectores em minúsculas). */
export function nomeProprio(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) =>
      i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1),
    )
    .join(" ");
}
