import { describe, expect, it } from "vitest";

import { avisoDoPeriodo, basesParaAnalise, erroDoPeriodo } from "./periodo";

const C15 = { id: 15, nome: "C15", inicio: "2026-10-16", fim: "2026-11-01" };

describe("período da base (datas livres desde 11/10/2026)", () => {
  it("fora do ciclo: só aviso, não bloqueia", () => {
    expect(erroDoPeriodo(C15, "2026-10-11", "2026-10-20", [])).toBeNull();
    expect(avisoDoPeriodo(C15, "2026-10-11", "2026-10-20")).toMatch(/fora do C15/);
    expect(avisoDoPeriodo(C15, "2026-10-16", "2026-11-01")).toBeNull();
  });

  it("bloqueia fim antes do início e sobreposição com outra base do ciclo", () => {
    expect(erroDoPeriodo(C15, "2026-10-20", "2026-10-18", [])).toMatch(/inválido/);
    expect(
      erroDoPeriodo(C15, "2026-10-11", "2026-10-17", [
        { id: 1, inicio: "2026-10-16", fim: "2026-11-01" },
      ]),
    ).toMatch(/sobrepõe/);
  });
});

describe("bases para a análise de divergências (ajuste da F1b)", () => {
  const b = (id: number, ciclo: number, inicio: string, fim: string) => ({
    id,
    ciclo,
    inicio,
    fim,
  });
  const bases = [
    b(1, 15, "2026-10-01", "2026-10-10"), // encerrada
    b(2, 15, "2026-10-11", "2026-10-20"), // atual C15
    b(3, 16, "2026-10-12", "2026-11-05"), // atual C16
    b(4, 15, "2026-10-21", "2026-10-31"), // futura
  ];

  it("atuais primeiro, começando pelo ciclo do menu", () => {
    expect(basesParaAnalise(bases, 16, "2026-10-12").map((x) => x.id)).toEqual([3, 2]);
    expect(basesParaAnalise(bases, 15, "2026-10-12").map((x) => x.id)).toEqual([2, 3]);
  });

  it("sem atual, a próxima a começar; sem nenhuma, vazio", () => {
    expect(basesParaAnalise([bases[0]!, bases[3]!], 15, "2026-10-15").map((x) => x.id)).toEqual([
      4,
    ]);
    expect(basesParaAnalise([bases[0]!], 15, "2026-10-15")).toEqual([]);
  });
});
