// @vitest-environment node
// Parte C (drizzle/migrations/0002b_hierarquia_gerentes.sql): escopo pela hierarquia (gerentes_lojas).
import { beforeAll, describe, expect, it } from "vitest";

import { como, criarBancoLocal, type BancoLocal } from "./banco-local";

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const GVO = "00000000-0000-0000-0000-00000000000b";
const DOIS_PAPEIS = "00000000-0000-0000-0000-00000000000c";
const DIRETORA = "00000000-0000-0000-0000-00000000000d";
const ANTIGO = "00000000-0000-0000-0000-00000000000e";

const lojasVistas = async (db: BancoLocal, uid: string, sql = "select bcps from lojas") => {
  const r = await como<{ bcps: string }>(db, uid, `${sql} order by 1`);
  if ("erro" in r) throw new Error(r.erro);
  return r.linhas.map((l) => l.bcps);
};

describe("banco: acesso pela hierarquia (parte C)", () => {
  let db: BancoLocal;

  beforeAll(async () => {
    db = await criarBancoLocal();
    await db.exec(`
      insert into auth.users values ('${ADMIN}','a'),('${GVO}','g'),('${DOIS_PAPEIS}','d'),('${DIRETORA}','f'),('${ANTIGO}','x');
      insert into lojas (bcps,nome,praca) values ('L1','Loja 1','P1'),('L2','Loja 2','P1'),('L3','Loja 3','P2');
      insert into gerentes values ('900','Gvo'),('50','Dois papéis'),('7','Grvo'),('3140','Diretora');
      insert into gerentes_lojas (matricula,bcps,nivel) values
        ('900','L1','gvo'),('50','L1','gcvo_gpvo'),('7','L1','grvo'),
        ('50','L2','gvo'),('50','L2','gcvo_gpvo'),('7','L2','grvo'),
        ('3140','L3','grvo');
      insert into perfis (user_id,usuario,nome,perfil,matricula,troca_senha) values
        ('${ADMIN}','matheus','M','admin',null,false),
        ('${GVO}','gvo.um','G','gerente','900',false),
        ('${DOIS_PAPEIS}','dois.papeis','D','gerente','50',false),
        ('${DIRETORA}','fabiana.nascimento','F','gerente','3140',false),
        ('${ANTIGO}','antigo','X','grvo',null,false);
      update perfis set ve_todas = true where user_id = '${DIRETORA}';
      -- escopo fixo antigo não vale mais
      insert into perfis_lojas (user_id,bcps) values ('${ANTIGO}','L1');
      -- ciclo de teste no futuro (só para a base ficar dentro dele; desde a 0002c, fora também vale)
      update ciclos set inicio = '2099-01-01', fim = '2099-12-31' where id = 17;
      insert into planos (id,ciclo,vigente,nome,inicio,fim) overriding system value values
        (10,17,false,'Futura','2099-01-01','2099-01-02');
      insert into base_metas_mensais (plano_id,bcps,mes,meta) values (10,'L1','2099-01-01',100);
    `);
  }, 120_000);

  it("GVO vê só as lojas onde é GVO; dois papéis veem a soma", async () => {
    expect(await lojasVistas(db, GVO)).toEqual(["L1"]);
    expect(await lojasVistas(db, DOIS_PAPEIS)).toEqual(["L1", "L2"]);
  });

  it("'vê todas as lojas' vê todas, mas continua sem custo (estoque) e sem parâmetros", async () => {
    expect(await lojasVistas(db, DIRETORA)).toEqual(["L1", "L2", "L3"]);
    const estoque = await como(db, DIRETORA, "select * from estoque");
    expect("linhas" in estoque && estoque.linhas).toHaveLength(0);
    const params = await como(db, DIRETORA, "select * from parametros");
    expect("linhas" in params && params.linhas).toHaveLength(0);
  });

  it("escopo fixo antigo (perfis_lojas) não dá mais acesso", async () => {
    expect(await lojasVistas(db, ANTIGO)).toEqual([]);
  });

  it("mudar a hierarquia de uma loja muda o acesso junto", async () => {
    await db.exec(
      "update gerentes_lojas set matricula = '900' where bcps = 'L2' and nivel = 'gvo'",
    );
    expect(await lojasVistas(db, GVO)).toEqual(["L1", "L2"]);
    await db.exec("update gerentes_lojas set matricula = '50' where bcps = 'L2' and nivel = 'gvo'");
    expect(await lojasVistas(db, GVO)).toEqual(["L1"]);
  });

  it("lojas_de: admin consulta qualquer um; gerente só a si mesmo", async () => {
    expect(await lojasVistas(db, ADMIN, `select lojas_de('${DOIS_PAPEIS}') as bcps`)).toEqual([
      "L1",
      "L2",
    ]);
    expect(await lojasVistas(db, GVO, `select lojas_de('${DOIS_PAPEIS}') as bcps`)).toEqual([]);
    expect(await lojasVistas(db, GVO, `select lojas_de('${GVO}') as bcps`)).toEqual(["L1"]);
  });

  it("gerente real não vê base que ainda não começou; o admin vê", async () => {
    expect(await lojasVistas(db, GVO, "select bcps from base_metas_mensais")).toEqual([]);
    expect(await lojasVistas(db, ADMIN, "select bcps from base_metas_mensais")).toEqual(["L1"]);
  });
});
