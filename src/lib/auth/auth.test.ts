import { describe, expect, it } from "vitest";

import { bloqueioDeAdmin } from "./regras";
import { gerarSenhaProvisoria } from "./senha";
import { emailDoUsuario, senhaValida, sugerirUsuario, usuarioValido } from "./usuario";

describe("sugerirUsuario", () => {
  it.each([
    ["Liane Seabra", "liane.seabra"],
    ["Maria da Silva Souza", "maria.souza"],
    ["  JOSÉ  Ângelo  ", "jose.angelo"],
    ["Fabiana Rodrigues Nascimento", "fabiana.nascimento"],
    ["Conceição", "conceicao"],
    ["Ana D'Ávila", "ana.avila"],
    ["", ""],
  ])("%s → %s", (nome, esperado) => {
    expect(sugerirUsuario(nome)).toBe(esperado);
  });

  it("a sugestão é sempre um usuário válido quando há nome", () => {
    expect(usuarioValido(sugerirUsuario("Liane Seabra"))).toBe(true);
  });
});

describe("usuário e e-mail interno", () => {
  it("valida o formato do banco", () => {
    expect(usuarioValido("liane.seabra")).toBe(true);
    expect(usuarioValido("Liane.Seabra")).toBe(false);
    expect(usuarioValido("ab")).toBe(false);
    expect(usuarioValido("joão")).toBe(false);
  });

  it("monta o e-mail técnico", () => {
    expect(emailDoUsuario(" Matheus ")).toBe("matheus@sacola.gentilnegocios.com.br");
  });
});

describe("senha", () => {
  it("exige 8+ caracteres, letra e número", () => {
    expect(senhaValida("abc12345")).toBe(true);
    expect(senhaValida("abcdefgh")).toBe(false);
    expect(senhaValida("12345678")).toBe(false);
    expect(senhaValida("abc1234")).toBe(false);
  });

  it("senha provisória sempre cumpre a regra e varia", () => {
    const senhas = new Set(Array.from({ length: 200 }, () => gerarSenhaProvisoria()));
    for (const s of senhas) {
      expect(s).toHaveLength(10);
      expect(senhaValida(s)).toBe(true);
      expect(s).not.toMatch(/[01lIO]/);
    }
    expect(senhas.size).toBeGreaterThan(190);
  });
});

describe("trava de admin", () => {
  const base = { solicitanteId: "a", alvoId: "b", alvoEraAdminAtivo: true, outrosAdminsAtivos: 1 };

  it("permite mudança que não tira admin", () => {
    expect(bloqueioDeAdmin({ ...base, alvoContinuaAdminAtivo: true })).toBeNull();
    expect(
      bloqueioDeAdmin({
        ...base,
        alvoEraAdminAtivo: false,
        alvoContinuaAdminAtivo: false,
        outrosAdminsAtivos: 0,
      }),
    ).toBeNull();
  });

  it("bloqueia tirar o próprio admin ou se desativar", () => {
    expect(bloqueioDeAdmin({ ...base, alvoId: "a", alvoContinuaAdminAtivo: false })).toMatch(
      /própria conta/,
    );
  });

  it("bloqueia ficar sem nenhum admin ativo", () => {
    expect(
      bloqueioDeAdmin({ ...base, alvoContinuaAdminAtivo: false, outrosAdminsAtivos: 0 }),
    ).toMatch(/pelo menos um admin/);
  });

  it("permite tirar admin de outro quando sobra admin ativo", () => {
    expect(
      bloqueioDeAdmin({ ...base, alvoContinuaAdminAtivo: false, outrosAdminsAtivos: 1 }),
    ).toBeNull();
  });
});
