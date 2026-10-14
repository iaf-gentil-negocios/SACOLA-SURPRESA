import { describe, expect, it } from "vitest";

import { sugerirUsuario } from "@/lib/auth/usuario";

import { escopoDoPerfil, nomeProprio, pessoasDaHierarquia, type Vinculo } from "./hierarquia";

// Dados fictícios. Matrículas escolhidas para que a ordem numérica NÃO bata com a hierarquia.
const V: Vinculo[] = [
  { bcps: "L1", nivel: "gvo", matricula: "900" },
  { bcps: "L1", nivel: "gcvo_gpvo", matricula: "50" },
  { bcps: "L1", nivel: "grvo", matricula: "7" },
  { bcps: "L2", nivel: "gvo", matricula: "50" }, // 50 é GCVO em L1 e GVO em L2
  { bcps: "L2", nivel: "gcvo_gpvo", matricula: "50" },
  { bcps: "L2", nivel: "grvo", matricula: "7" },
  { bcps: "L3", nivel: "gvo", matricula: "901" },
  { bcps: "L3", nivel: "grvo", matricula: "8" },
];
const gerente = (matricula: string | null, extra = {}) => ({
  perfil: "gerente",
  ativo: true,
  matricula,
  ...extra,
});

describe("escopo pela hierarquia", () => {
  it("cada papel vê as lojas onde está na coluna; vários papéis = soma", () => {
    expect(escopoDoPerfil(gerente("900"), V)).toEqual({
      todas: false,
      lojas: ["L1"],
      papeis: ["gvo"],
    });
    expect(escopoDoPerfil(gerente("50"), V)).toEqual({
      todas: false,
      lojas: ["L1", "L2"],
      papeis: ["gvo", "gcvo_gpvo"],
    });
    expect(escopoDoPerfil(gerente("7"), V).lojas).toEqual(["L1", "L2"]);
  });

  it("a matrícula não define posição: número menor não vê lojas de quem tem número maior", () => {
    // 7 (GRVO de L1/L2) não vê L3, mesmo sendo "menor" que 901 e 8
    expect(escopoDoPerfil(gerente("7"), V).lojas).not.toContain("L3");
    expect(escopoDoPerfil(gerente("8"), V).lojas).toEqual(["L3"]);
  });

  it("vê todas (diretoria) e admin: todas; inativo ou sem matrícula: nenhuma", () => {
    expect(escopoDoPerfil(gerente("7", { ve_todas: true }), V).todas).toBe(true);
    expect(escopoDoPerfil({ perfil: "admin", ativo: true, matricula: null }, V).todas).toBe(true);
    expect(escopoDoPerfil(gerente("900", { ativo: false }), V)).toMatchObject({
      todas: false,
      lojas: [],
    });
    expect(escopoDoPerfil(gerente(null), V).lojas).toEqual([]);
  });

  it("mudar a hierarquia de uma loja muda o escopo junto", () => {
    const novo = V.map((v) =>
      v.bcps === "L3" && v.nivel === "gvo" ? { ...v, matricula: "900" } : v,
    );
    expect(escopoDoPerfil(gerente("900"), novo).lojas).toEqual(["L1", "L3"]);
    expect(escopoDoPerfil(gerente("901"), novo).lojas).toEqual([]);
  });
});

describe("pessoas para criar em lote", () => {
  const nomes = new Map([
    ["900", "PADÃ WEBSTER FEITOSA"],
    ["50", "MARIA DA SILVA SOUZA"],
    ["7", "FABIANA RODRIGUES NASCIMENTO"],
    ["901", "ZÉLIA PRADO"],
    ["8", "ANA LIMA"],
  ]);

  it("uma linha por matrícula, só das lojas que participam, em ordem de nome", () => {
    const p = pessoasDaHierarquia(V, nomes, new Set(["L1", "L2"]));
    expect(p.map((x) => x.matricula)).toEqual(["7", "50", "900"]);
    expect(p.find((x) => x.matricula === "50")).toMatchObject({
      nome: "Maria da Silva Souza",
      papeis: ["gvo", "gcvo_gpvo"],
      lojas: 2,
      usuarioSugerido: "maria.souza",
    });
  });

  it("login primeironome.ultimosobrenome, sem acento e minúsculo", () => {
    expect(sugerirUsuario(nomeProprio("PADÃ WEBSTER FEITOSA"))).toBe("pada.feitosa");
    expect(pessoasDaHierarquia(V, nomes, new Set(["L1"])).map((x) => x.usuarioSugerido)).toEqual([
      "fabiana.nascimento",
      "maria.souza",
      "pada.feitosa",
    ]);
  });
});
