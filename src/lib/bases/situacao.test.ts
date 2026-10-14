import { describe, expect, it } from "vitest";

import {
  basesDesatualizadas,
  classificacaoDe,
  CLASSIFICACAO_PADRAO,
  envioVencido,
  haQuanto,
  ultimoEnvio,
} from "./situacao";

const AGORA = new Date("2026-10-10T12:00:00Z").getTime();
const horasAtras = (h: number) => new Date(AGORA - h * 3_600_000).toISOString();
const envio = (base: string, h: number, extra: object = {}) => ({
  base,
  ciclo: null,
  status: "concluido",
  concluido_em: horasAtras(h),
  detalhes: {},
  ...extra,
});

describe("fixa e variável", () => {
  it("padrão: só a Cobertura é variável", () => {
    expect(Object.entries(CLASSIFICACAO_PADRAO).filter(([, c]) => c === "variavel")).toEqual([
      ["cobertura", "variavel"],
    ]);
  });

  it("valor salvo sobrepõe o padrão; valor estranho é ignorado", () => {
    const c = classificacaoDe({ faturamento: "variavel", cobertura: "fixa", lojas: "outra" });
    expect(c.faturamento).toBe("variavel");
    expect(c.cobertura).toBe("fixa");
    expect(c.lojas).toBe("fixa");
    expect(classificacaoDe(null)).toEqual(CLASSIFICACAO_PADRAO);
  });
});

describe("desatualização (24 h)", () => {
  it("vence depois de 24 h, sem envio ou com a base excluída", () => {
    expect(envioVencido(envio("cobertura", 23), AGORA)).toBe(false);
    expect(envioVencido(envio("cobertura", 25), AGORA)).toBe(true);
    expect(envioVencido(undefined, AGORA)).toBe(true);
    expect(
      envioVencido(envio("cobertura", 1, { detalhes: { excluida_em: horasAtras(0) } }), AGORA),
    ).toBe(true);
  });

  it("só as variáveis geram aviso; usa o último envio concluído", () => {
    const envios = [
      envio("cobertura", 30),
      envio("faturamento", 200),
      { ...envio("cobertura", 1), status: "em_andamento" },
    ];
    expect(basesDesatualizadas(envios, CLASSIFICACAO_PADRAO, null, AGORA)).toEqual([
      { base: "cobertura", desde: horasAtras(30) },
    ]);
    const c = classificacaoDe({ cobertura: "fixa" });
    expect(basesDesatualizadas(envios, c, null, AGORA)).toEqual([]);
  });

  it("promoção variável olha o ciclo escolhido", () => {
    const envios = [{ ...envio("promocao", 2), ciclo: 15 }];
    const c = classificacaoDe({ promocao: "variavel", cobertura: "fixa" });
    expect(basesDesatualizadas(envios, c, 15, AGORA)).toEqual([]);
    expect(basesDesatualizadas(envios, c, 16, AGORA)).toEqual([{ base: "promocao", desde: null }]);
    expect(ultimoEnvio(envios, "promocao", 15)?.ciclo).toBe(15);
  });

  it("texto do tempo", () => {
    expect(haQuanto(horasAtras(30), AGORA)).toBe("há 30 horas");
    expect(haQuanto(horasAtras(24 * 3 + 2), AGORA)).toBe("há 3 dias");
  });
});
