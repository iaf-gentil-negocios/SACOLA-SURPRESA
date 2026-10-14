// P3 (13/10/2026): mapa de calor por município, escala contínua e quem vê o mapa.
import { describe, expect, it } from "vitest";

import { PAPEIS_QUE_VEEM_O_MAPA, papeisDoUsuario, veOMapa } from "./acesso";
import { agruparPorMunicipio, corDoPct, ESCALA_MAPA } from "./mapa";
import { CAIXAS_UF, MUNICIPIOS_MAPA } from "./municipios-dados";

const gerente = { perfil: "gerente", ve_todas: false };

describe("quem vê o mapa (P3)", () => {
  it("a lista fica num lugar só e não inclui o GVO", () => {
    expect([...PAPEIS_QUE_VEEM_O_MAPA].sort()).toEqual(
      ["acompanhamento", "admin", "diretoria", "gcvo_gpvo", "grvo"].sort(),
    );
  });

  it("GVO não vê; GCVO/GPVO, GRVO, diretoria, admin e Acompanhamento veem", () => {
    expect(veOMapa(papeisDoUsuario(gerente, ["gvo"]))).toBe(false);
    expect(veOMapa(papeisDoUsuario(gerente, []))).toBe(false); // sem hierarquia
    expect(veOMapa(papeisDoUsuario(gerente, ["gcvo_gpvo"]))).toBe(true);
    expect(veOMapa(papeisDoUsuario(gerente, ["grvo"]))).toBe(true);
    expect(veOMapa(papeisDoUsuario({ ...gerente, ve_todas: true }, []))).toBe(true);
    expect(veOMapa(papeisDoUsuario({ perfil: "admin" }, []))).toBe(true);
    expect(veOMapa(papeisDoUsuario({ perfil: "acompanhamento" }, []))).toBe(true);
  });

  it("quem tem dois papéis vê se um deles estiver na lista; perfis antigos valem como o nível", () => {
    expect(veOMapa(papeisDoUsuario(gerente, ["gvo", "gcvo_gpvo"]))).toBe(true);
    expect(veOMapa(papeisDoUsuario({ perfil: "grvo" }, []))).toBe(true);
    expect(veOMapa(papeisDoUsuario({ perfil: "gcvo_gpvo" }, []))).toBe(true);
  });
});

describe("escala de cor contínua (azul → vermelho)", () => {
  it("0% é azul, o fim da escala é vermelho, e acima dele continua vermelho", () => {
    expect(corDoPct(0)).toBe(ESCALA_MAPA.paradas[0]);
    expect(corDoPct(ESCALA_MAPA.max)).toBe(ESCALA_MAPA.paradas[4]);
    expect(corDoPct(ESCALA_MAPA.max * 2)).toBe(ESCALA_MAPA.paradas[4]);
    expect(corDoPct(-1)).toBe(ESCALA_MAPA.paradas[0]);
  });

  it("é contínua: valores próximos dão cores próximas e o meio é o amarelo", () => {
    expect(corDoPct(0.5)).toBe(ESCALA_MAPA.paradas[2]);
    const r = (c: string) => parseInt(c.slice(1, 3), 16);
    expect(Math.abs(r(corDoPct(0.6)) - r(corDoPct(0.61)))).toBeLessThan(6);
    expect(corDoPct(0.6)).not.toBe(corDoPct(0.7));
  });
});

describe("dados do mapa por município", () => {
  it("malha do IBGE dos 4 estados com lojas, com caixa de zoom de cada um", () => {
    expect(MUNICIPIOS_MAPA).toHaveLength(791);
    expect(Object.keys(CAIXAS_UF).sort()).toEqual(["CE", "MA", "PB", "RN"]);
    for (const uf of ["CE", "MA", "PB", "RN"])
      expect(MUNICIPIOS_MAPA.some((m) => m.uf === uf && m.d.startsWith("M"))).toBe(true);
  });

  it("soma as lojas por município (sem acento/maiúscula); sem venda = sem dado; sem cidade = lista", () => {
    const lojas = [
      { bcps: "1", nome: "A", cidade: "NATAL", uf: "rn", meta: 100, vendido: 50 },
      { bcps: "2", nome: "B", cidade: "Natal", uf: "RN", meta: 300, vendido: 150 },
      { bcps: "3", nome: "C", cidade: "Sao Luis", uf: "MA", meta: 100, vendido: null },
      { bcps: "4", nome: "D", cidade: null, uf: null, meta: 100, vendido: 10 },
      { bcps: "5", nome: "E", cidade: "Cidade Inventada", uf: "RN", meta: 100, vendido: 10 },
    ];
    const r = agruparPorMunicipio(lojas, MUNICIPIOS_MAPA);
    const natal = [...r.porMunicipio.values()].find((m) => m.nome === "Natal")!;
    expect(natal.lojas).toHaveLength(2);
    expect(natal.pct).toBeCloseTo(0.5, 9);
    expect([...r.porMunicipio.values()].find((m) => m.nome === "São Luís")!.pct).toBeNull();
    expect(r.naoReconhecidas.map((l) => l.bcps)).toEqual(["4", "5"]);
  });
});
