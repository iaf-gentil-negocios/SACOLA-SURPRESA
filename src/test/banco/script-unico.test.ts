// @vitest-environment node
// banco/script_unico_0002h-0002j.sql: aplicado sobre o banco de hoje (até o 0002g), duas vezes,
// e a consulta de conferência do fim volta tudo true.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { criarBancoLocal } from "./banco-local";

describe("banco: script único 0002h + 0002i + 0002j", () => {
  it("roda duas vezes sem erro e a conferência volta tudo true", async () => {
    const sql = readFileSync(
      join(__dirname, "..", "..", "..", "banco", "script_unico_0002h-0002j.sql"),
      "utf8",
    );
    const db = await criarBancoLocal({ antesDe: "0002h", pendente: false });
    await db.exec(sql);
    await db.exec(sql); // segunda vez: sem efeito
    const r = await db.query<Record<string, boolean>>(sql.slice(sql.lastIndexOf("select\n")));
    expect(r.rows[0]).toEqual({
      funcoes_ok: true,
      gatilhos_ok: true,
      tabelas_ok: true,
      colunas_ok: true,
      rls_ok: true,
      regras_ok: true,
    });
  }, 120_000);
});
