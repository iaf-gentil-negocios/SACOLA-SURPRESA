// @vitest-environment node
// Parte F2a (drizzle/migrations/0002e_acompanhamento_dashboard.sql): perfil Acompanhamento,
// evento "abriu dashboard" e resumo de estoque por loja.
import { beforeAll, describe, expect, it } from "vitest";

import { como, criarBancoLocal, erroDe, sqlDaMigracao, type BancoLocal } from "./banco-local";

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const ACOMP = "00000000-0000-0000-0000-00000000000b";
const GVO = "00000000-0000-0000-0000-00000000000c";

const linhas = async (db: BancoLocal, uid: string, sql: string) => {
  const r = await como(db, uid, sql);
  if ("erro" in r) throw new Error(r.erro);
  return r.linhas;
};

describe("banco: perfil Acompanhamento e dashboard (parte F2a)", () => {
  let db: BancoLocal;

  beforeAll(async () => {
    db = await criarBancoLocal();
    await db.exec(`
      insert into auth.users values ('${ADMIN}','a'),('${ACOMP}','b'),('${GVO}','c');
      insert into lojas (bcps,nome,praca) values ('L1','Loja 1','P1'),('L2','Loja 2','P2');
      insert into gerentes values ('900','Gvo');
      insert into gerentes_lojas (matricula,bcps,nivel) values ('900','L1','gvo');
      insert into perfis (user_id,usuario,nome,perfil,matricula,troca_senha) values
        ('${ADMIN}','matheus','M','admin',null,false),
        ('${ACOMP}','time.um','T','acompanhamento',null,false),
        ('${GVO}','gvo.um','G','gerente','900',false);
      insert into estoque (bcps,sku,estoque,vmd,preco,custo,base_versao) values ('L1','S1',5,1,10,4,'2026-10-11');
      insert into planos (id,ciclo,vigente,nome,inicio,fim) overriding system value values
        (10,15,false,'Futura','2099-01-01','2099-01-02');
      insert into base_kits (plano_id,codigo,tema,preco,valor_cheio,desconto_pct,heroi_sku)
        values (10,'K1','Tema',189.9,300,37,'S1');
      insert into base_kit_lojas (plano_id,codigo,bcps,qtd) values (10,'K1','L1',3);
      insert into base_kit_lojas_admin (plano_id,codigo,bcps,custo,margem,valor_cheio,desconto_pct)
        values (10,'K1','L1',80,109.9,300,37);
      insert into resumo_estoque_lojas (bcps,ref,skus,unidades,valor_custo) values ('L1','2026-10-11',1,5,20);
    `);
  }, 120_000);

  it("o SQL pode rodar de novo sem erro", async () => {
    expect(await erroDe(db, sqlDaMigracao("0002e_"))).toBeNull();
  });

  it("acompanhamento vê todas as lojas, custo e margem, a base futura e os perfis", async () => {
    const lojas = await linhas(db, ACOMP, "select bcps from lojas order by 1");
    expect(lojas.map((l) => l["bcps"])).toEqual(["L1", "L2"]);
    expect(await linhas(db, ACOMP, "select margem from base_kit_lojas_admin")).toHaveLength(1);
    expect(await linhas(db, ACOMP, "select * from base_kits")).toHaveLength(1);
    expect(await linhas(db, ACOMP, "select * from resumo_estoque_lojas")).toHaveLength(1);
    expect(await linhas(db, ACOMP, "select * from perfis")).toHaveLength(3);
  });

  it("acompanhamento não lê estoque nem o histórico de acessos", async () => {
    expect(await linhas(db, ACOMP, "select * from estoque")).toHaveLength(0);
    await db.exec(`insert into acessos_log (user_id,evento) values ('${ADMIN}','login')`);
    expect(await linhas(db, ACOMP, "select * from acessos_log")).toHaveLength(0);
  });

  it("acompanhamento não altera nada", async () => {
    await linhas(db, ACOMP, "update parametros set valor = '1'::jsonb");
    await linhas(db, ACOMP, "update lojas set participa = true");
    await linhas(db, ACOMP, "delete from base_kits");
    expect(await linhas(db, ADMIN, "select * from base_kits")).toHaveLength(1);
    expect(await linhas(db, ADMIN, "select * from lojas where participa")).toHaveLength(0);
    const ins = await como(
      db,
      ACOMP,
      "insert into resumo_estoque_lojas (bcps,ref) values ('L2','2026-10-11')",
    );
    expect("erro" in ins).toBe(true);
  });

  it("gerente não lê o resumo de estoque nem custo", async () => {
    expect(await linhas(db, GVO, "select * from resumo_estoque_lojas")).toHaveLength(0);
    expect(await linhas(db, GVO, "select * from base_kit_lojas_admin")).toHaveLength(0);
  });

  it("qualquer usuário registra 'abriu_dashboard' para si mesmo", async () => {
    const r = await como(
      db,
      GVO,
      `insert into acessos_log (user_id,evento) values ('${GVO}','abriu_dashboard')`,
    );
    expect("erro" in r).toBe(false);
  });

  it("admin grava o resumo de estoque", async () => {
    const r = await como(
      db,
      ADMIN,
      "insert into resumo_estoque_lojas (bcps,ref) values ('L2','2026-10-11') on conflict (bcps) do update set ref = excluded.ref",
    );
    expect("erro" in r).toBe(false);
  });
});
