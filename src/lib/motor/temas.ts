// Temas das sacolas (referencia/app_atual.js: TEMAS, BANHO, ROSTO).
import { MARCA_F, MARCA_M, type Nicho } from "@/lib/bases/nicho";

export interface ItemTema {
  nicho: Nicho;
  categoria: string;
  marca: string;
}

export interface Tema {
  chave: string;
  nome: string;
  heroi: (x: ItemTema) => boolean;
  agrega: (x: ItemTema, heroi: ItemTema) => boolean;
  /** Linha completa: precisa de 3+ itens da marca do herói. */
  linha?: boolean;
}

const BANHO = new Set([
  "SABONETE CORPO",
  "CUIDADOS COM A PELE",
  "ÓLEOS",
  "DESODORANTES",
  "PERFUMARIA",
]);
const ROSTO = new Set(["CUIDADOS FACIAIS", "SOLAR", "MAQUIAGEM", "CUIDADOS COM A BARBA"]);

export const TEMAS: Tema[] = [
  {
    chave: "ela",
    nome: "Presente para Ela",
    heroi: (s) => s.nicho === "F",
    agrega: (s) => s.nicho === "F" || s.nicho === "U",
  },
  {
    chave: "ele",
    nome: "Presente para Ele",
    heroi: (s) => s.nicho === "M",
    agrega: (s) => s.nicho === "M" || s.nicho === "U",
  },
  {
    chave: "inf",
    nome: "Infantil",
    heroi: (s) => s.nicho === "I",
    agrega: (s) => s.nicho === "I" || (s.nicho === "U" && BANHO.has(s.categoria)),
  },
  {
    chave: "linha",
    nome: "Linha completa",
    heroi: (s) => !!s.marca && s.marca !== "SEM CLASSIFICACAO",
    agrega: (s, h) => s.marca === h.marca,
    linha: true,
  },
  {
    chave: "banho",
    nome: "Ritual de banho e corpo",
    heroi: (s) => BANHO.has(s.categoria) && s.nicho !== "I",
    agrega: (s, h) =>
      BANHO.has(s.categoria) &&
      s.categoria !== "PERFUMARIA" &&
      (s.nicho === "U" || s.nicho === h.nicho),
  },
  {
    chave: "rosto",
    nome: "Rotina de rosto e make",
    heroi: (s) => ROSTO.has(s.categoria) && s.nicho !== "I",
    agrega: (s, h) => ROSTO.has(s.categoria) && (s.nicho === "U" || s.nicho === h.nicho),
  },
  {
    chave: "cabelo",
    nome: "Cuidado com os cabelos",
    heroi: (s) => s.categoria === "CABELOS",
    agrega: (s, h) => s.categoria === "CABELOS" && (s.nicho === "U" || s.nicho === h.nicho),
  },
];

export const NOME_TEMA = Object.fromEntries(TEMAS.map((t) => [t.chave, t.nome]));

/** Nicho U corrigido pela marca, como na referência. */
export function nichoCorrigido(nicho: Nicho | null, marca: string): Nicho {
  if (nicho && nicho !== "U") return nicho;
  if (MARCA_F.has(marca)) return "F";
  if (MARCA_M.has(marca)) return "M";
  return "U";
}

/** Tema criado pelo admin (parte F1a): mesma regra de Banho e Rosto, com as categorias dele. */
export function temaPersonalizado(t: { nome: string; categorias: string[] }): Tema {
  const cats = new Set(t.categorias.map((c) => c.toUpperCase()));
  return {
    // a chave é o próprio nome: o kit guarda o nome e o gerente o vê sem acesso aos parâmetros
    chave: t.nome,
    nome: t.nome,
    heroi: (s) => cats.has(s.categoria) && s.nicho !== "I",
    agrega: (s, h) => cats.has(s.categoria) && (s.nicho === "U" || s.nicho === h.nicho),
  };
}

/** Temas ligados para o motor: os fixos ligados + os personalizados ligados (pelo nome). */
export function temasDoMotor(p: {
  temas: string[];
  temas_personalizados: { nome: string; categorias: string[] }[];
}): Tema[] {
  return [
    ...TEMAS.filter((t) => p.temas.includes(t.chave)),
    ...p.temas_personalizados.filter((t) => p.temas.includes(t.nome)).map(temaPersonalizado),
  ];
}

/** Opções de filtro por tema a partir dos kits: fixos primeiro (na ordem), depois os do admin. */
export function opcoesDeTema(chaves: string[]): [string, string][] {
  const presentes = new Set(chaves);
  const fixos = TEMAS.filter((t) => presentes.has(t.chave)).map((t): [string, string] => [
    t.chave,
    t.nome,
  ]);
  const outros = [...presentes]
    .filter((c) => !NOME_TEMA[c])
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((c): [string, string] => [c, c]);
  return [...fixos, ...outros];
}
