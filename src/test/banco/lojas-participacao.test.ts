// @vitest-environment node
// Parte B (drizzle/migrations/0002a_lojas_participacao.sql): todas as lojas + "participa".
import { beforeAll, describe, expect, it } from "vitest";

import { como, criarBancoLocal, sqlDaMigracao, type BancoLocal } from "./banco-local";

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const GERENTE = "00000000-0000-0000-0000-00000000000b";

const participa = async (db: BancoLocal) =>
  Object.fromEntries(
    (
      await db.query<{ bcps: string; participa: boolean }>(
        "select bcps, participa from lojas order by bcps",
      )
    ).rows.map((r) => [r.bcps, r.participa]),
  );

describe("banco: lojas que participam (parte B)", () => {
  let db: BancoLocal;

  beforeAll(async () => {
    // banco como está hoje no Cloud (até a 0002), com lojas já cadastradas
    db = await criarBancoLocal({ antesDe: "0002a", pendente: false });
    await db.exec(`
      insert into auth.users values ('${ADMIN}','a'),('${GERENTE}','g');
      insert into lojas (bcps,nome,praca,tipo,ativo) values
        ('L1','Loja 1','P1','loja',true),
        ('L2','QDB Midway','P1','loja',true),
        ('L3','Loja inativa','P1','loja',false),
        ('H1','Hub Natal','P1','hub',true),
        ('E1','ER Nova Cruz','P1','er',true);
      insert into perfis (user_id,usuario,nome,perfil) values ('${ADMIN}','matheus','M','admin'),('${GERENTE}','gerente','G','grvo');
      insert into perfis_lojas (user_id,bcps) values ('${GERENTE}','L1');
    `);
    await db.exec(sqlDaMigracao("0002a_"));
  }, 120_000);

  it("primeira vez: Varejo/Híbrida ativas participam, menos QDB; o resto não", async () => {
    expect(await participa(db)).toEqual({ E1: false, H1: false, L1: true, L2: false, L3: false });
  });

  it("loja nova entra como não participa; o tipo 'outro' existe", async () => {
    await db.exec(`insert into lojas (bcps,nome,praca,tipo,tipo_dcentros,sap,centro_custo,marca)
      values ('V1','VD - Turu','P1','outro','Venda Direta','4049','402124049','O Boticário')`);
    expect((await participa(db))["V1"]).toBe(false);
  });

  it("rodar o SQL de novo não desfaz as escolhas", async () => {
    await db.exec("update lojas set participa = true where bcps = 'H1'");
    await db.exec("update lojas set participa = false where bcps = 'L1'");
    await db.exec(sqlDaMigracao("0002a_"));
    const p = await participa(db);
    expect(p["H1"]).toBe(true);
    expect(p["L1"]).toBe(false);
  });

  it("admin marca e desmarca; gerente não consegue", async () => {
    const admin = await como(
      db,
      ADMIN,
      "update lojas set participa = true where bcps = 'L1' returning bcps",
    );
    expect("linhas" in admin && admin.linhas).toHaveLength(1);
    const gerente = await como(
      db,
      GERENTE,
      "update lojas set participa = false where bcps = 'L1' returning bcps",
    );
    // a RLS não deixa o gerente alterar: nenhuma linha muda
    expect("erro" in gerente || gerente.linhas.length === 0).toBe(true);
    expect((await participa(db))["L1"]).toBe(true);
  });

  it("upsert da base de lojas não mexe em participa", async () => {
    await db.exec(`insert into lojas (bcps,nome,praca,tipo) values ('L1','Loja 1 nova','P1','loja')
      on conflict (bcps) do update set nome = excluded.nome`);
    expect((await participa(db))["L1"]).toBe(true);
  });
});
