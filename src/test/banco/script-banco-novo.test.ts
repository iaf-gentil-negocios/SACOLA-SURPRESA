// @vitest-environment node
// banco/script_banco_novo.sql: num banco vazio, chega à mesma estrutura das migrações aplicadas uma a
// uma (o banco de hoje), pela banco/conferencia_banco.sql. E o script está em dia com as migrações.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { criarBancoLocal, sqlDasMigracoes } from "./banco-local";

const RAIZ = join(__dirname, "..", "..", "..");
const ler = (arquivo: string) => readFileSync(join(RAIZ, "banco", arquivo), "utf8");

describe("banco: script do banco novo", () => {
  it("contém todas as migrações menos a 0000, na ordem", () => {
    const script = ler("script_banco_novo.sql");
    const migracoes = sqlDasMigracoes().slice(1);
    let desde = 0;
    for (const m of migracoes) {
      const i = script.indexOf(m.trimEnd(), desde);
      expect(i, "rode: bun scripts/gerar-script-banco-novo.ts").toBeGreaterThanOrEqual(0);
      desde = i;
    }
    expect(sqlDasMigracoes()[0]).toContain("teste_migracao");
  });

  it("num banco vazio chega à mesma estrutura do banco de hoje", async () => {
    const conferencia = ler("conferencia_banco.sql");
    const hoje = await criarBancoLocal({ pendente: false });
    const novo = await criarBancoLocal({ antesDe: "0000", pendente: false });
    await novo.exec(ler("script_banco_novo.sql"));
    const a = (await hoje.query(conferencia)).rows;
    const b = (await novo.query(conferencia)).rows;
    expect(b).toEqual(a);
    expect(a.length).toBe(10);
  }, 120_000);
});
