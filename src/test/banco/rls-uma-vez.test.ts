// @vitest-environment node
// 0002g (revisão de consumo, item 1): as funções das regras de acesso passam a rodar uma vez por
// consulta ("(select …)"), sem mudar quem vê o quê. As regras em si continuam testadas nos outros
// testes do banco, que rodam com esta migração aplicada.
import { beforeAll, describe, expect, it } from "vitest";

import { criarBancoLocal, erroDe, sqlDaMigracao, type BancoLocal } from "./banco-local";

describe("banco: RLS calculada uma vez por consulta (0002g)", () => {
  let db: BancoLocal;
  beforeAll(async () => {
    db = await criarBancoLocal();
  }, 120_000);

  it("o SQL pode rodar de novo sem erro", async () => {
    expect(await erroDe(db, sqlDaMigracao("0002g_"))).toBeNull();
  });

  it("nenhuma regra chama is_admin/ve_dados_admin/usuario_ativo fora de um (select …)", async () => {
    const r = await db.query<{ tabela: string; regra: string; expr: string }>(`
      select tablename as tabela, policyname as regra,
             coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
        from pg_policies where schemaname = 'public'`);
    const soltas = r.rows.filter((p) =>
      /(?<!SELECT )(is_admin|ve_dados_admin|usuario_ativo)\(\)/i.test(
        p.expr.replace(/\(\s*SELECT\s+(public\.)?/gi, "SELECT "),
      ),
    );
    expect(soltas.map((p) => `${p.tabela}.${p.regra}: ${p.expr}`)).toEqual([]);
    expect(r.rows.filter((p) => p.regra === "admin_tudo").length).toBeGreaterThan(20);
  });
});
