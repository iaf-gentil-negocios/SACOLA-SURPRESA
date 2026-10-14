// @vitest-environment node
import { describe, expect, it } from "vitest";

import { analisar } from "./analise";
import { promocaoSchema } from "./esquemas";
import { lerArquivo } from "./leitor";

const ctx = {
  nomeArquivo: "vendedoras.csv",
  lojas: [{ bcps: "100", tipo: "loja", divisao: "4001" }],
  versaoRef: null,
  ciclo: null,
  mes: null,
};

describe("leitor", () => {
  it.each([
    ["vírgula", "bcps,vendedoras\n100,3\n"],
    ["ponto e vírgula", "bcps;vendedoras\r\n100;3\r\n"],
  ])("CSV de 2 colunas com %s", async (_, conteudo) => {
    const planilhas = await lerArquivo(new File([conteudo], "vendedoras.csv"));
    const a = analisar("vendedoras", planilhas, ctx);
    expect(a.partes[0]!.linhas).toEqual([{ bcps: "100", vendedoras: 3 }]);
  });

  it("colado do Excel (tab, vírgula dentro da célula, número brasileiro) segue o mesmo caminho", async () => {
    // o que a tela Bases monta ao colar: um .txt com o texto copiado
    const colado =
      "Praça\tBPCS\tLoja\tFaturamento\tBoletos\tData\n" +
      "Natal\t100\tLoja Um, reformada\t1.234,56\t10\t01/08/2026\n";
    const planilhas = await lerArquivo(new File([colado], "colado-faturamento.txt"));
    expect(planilhas[0]!.cabecalho).toHaveLength(6);
    const a = analisar("faturamento", planilhas, { ...ctx, nomeArquivo: "colado-faturamento.txt" });
    expect(a.erros).toEqual([]);
    expect(a.partes[0]!.linhas).toEqual([
      { bcps: "100", mes: "2026-08-01", faturamento: 1234.56, boletos: 10 },
    ]);
  });

  it("arquivo sem cabeçalho mostra o cabeçalho esperado", async () => {
    const planilhas = await lerArquivo(new File([""], "vendedoras.csv"));
    expect(() => analisar("vendedoras", planilhas, ctx)).toThrow(/bcps,vendedoras/);
  });
});

describe("textos longos", () => {
  it("são cortados com … em vez de recusar a linha", () => {
    const r = promocaoSchema.parse({
      sku: "1",
      desconto_pct: 10,
      ressarcimento_bso: false,
      texto: "x".repeat(2500),
    });
    expect(r.texto).toHaveLength(2000);
    expect(r.texto!.endsWith("…")).toBe(true);
  });
});
