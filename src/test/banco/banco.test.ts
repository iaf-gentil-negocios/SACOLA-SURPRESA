// @vitest-environment node
// Regras do banco (RLS, funções, gatilho, upload) testadas num Postgres local.
import { beforeAll, describe, expect, it } from "vitest";

import { como, criarBancoLocal, erroDe, type BancoLocal } from "./banco-local";

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const GERENTE = "00000000-0000-0000-0000-00000000000b";
const INATIVO = "00000000-0000-0000-0000-00000000000c";
const SEM_PERFIL = "00000000-0000-0000-0000-00000000000d";

const qtd = async (db: BancoLocal, uid: string | null, sql: string) => {
  const r = await como(db, uid, sql);
  return "erro" in r ? r.erro : r.linhas.length;
};
const nega = async (db: BancoLocal, uid: string | null, sql: string) =>
  typeof (await qtd(db, uid, sql)) === "string";

describe("banco: acesso (etapa 1 + gatilho da etapa 3)", () => {
  let db: BancoLocal;

  beforeAll(async () => {
    db = await criarBancoLocal();
    await db.exec(`
      insert into auth.users values ('${ADMIN}','a'),('${GERENTE}','g'),('${INATIVO}','x'),('${SEM_PERFIL}','s');
      insert into lojas (bcps,nome,praca) values ('L1','Loja 1','P1'),('L2','Loja 2','P2');
      insert into perfis (user_id,usuario,nome,perfil) values ('${ADMIN}','matheus','M','admin');
      insert into perfis (user_id,usuario,nome,perfil,matricula) values ('${GERENTE}','gerente','G','grvo','G1');
      insert into perfis (user_id,usuario,nome,perfil,ativo,matricula) values ('${INATIVO}','inativo','X','grvo',false,'X1');
      -- escopo pela hierarquia (parte C): GRVO de L1 e (inativo) de L2
      insert into gerentes values ('G1','G'),('X1','X');
      insert into gerentes_lojas (matricula,bcps,nivel) values ('G1','L1','grvo'),('X1','L2','grvo');
      insert into estoque (bcps,sku,estoque,vmd,preco,custo,base_versao) values ('L1','S1',10,1,100,50,'2026-10-07');
      insert into planos (id,ciclo,vigente) overriding system value values (1,15,false),(2,15,true);
      insert into plano_metas (plano_id,bcps,meta) values (1,'L1',999),(2,'L1',100),(2,'L2',200);
      insert into plano_kits values (2,'P1-01','P1','ela',null,189.9,290,35,10),(2,'P2-01','P2','ele',null,189.9,290,35,10);
      insert into plano_kit_lojas values (2,'P1-01','L1',5),(2,'P2-01','L2',5);
      insert into plano_kits_admin values (2,'P1-01',80,20,'{}');
    `);
  }, 120_000);

  it("anon não lê nada", async () => {
    expect(await nega(db, null, "select * from lojas")).toBe(true);
  });

  it("gerente vê só o seu escopo; plano sem período (modelo antigo) não aparece", async () => {
    expect(await qtd(db, GERENTE, "select * from lojas")).toBe(1);
    // desde a parte 2 do SQL, o gerente vê só bases com período já iniciado
    // (os casos com período estão em bases-periodo.test.ts)
    expect(await qtd(db, GERENTE, "select * from planos")).toBe(0);
    expect(await qtd(db, GERENTE, "select * from plano_metas")).toBe(0);
  });

  it("gerente não vê custo, estoque nem parâmetros", async () => {
    expect(await qtd(db, GERENTE, "select * from estoque")).toBe(0);
    expect(await qtd(db, GERENTE, "select * from plano_kits_admin")).toBe(0);
    expect(await qtd(db, GERENTE, "select * from parametros")).toBe(0);
  });

  it("inativo e sem perfil não veem nada", async () => {
    for (const uid of [INATIVO, SEM_PERFIL]) {
      expect(await qtd(db, uid, "select * from lojas")).toBe(0);
      expect(await qtd(db, uid, "select * from ciclos")).toBe(0);
      expect(await qtd(db, uid, "select * from planos")).toBe(0);
    }
  });

  it("admin vê tudo", async () => {
    expect(await qtd(db, ADMIN, "select * from lojas")).toBe(2);
    expect(await qtd(db, ADMIN, "select * from estoque")).toBe(1);
  });

  it("registro de acessos: só o próprio, sem apagar", async () => {
    expect(
      await qtd(db, GERENTE, "insert into acessos_log (evento) values ('login') returning 1"),
    ).toBe(1);
    expect(
      await nega(
        db,
        GERENTE,
        `insert into acessos_log (user_id,evento) values ('${ADMIN}','login') returning 1`,
      ),
    ).toBe(true);
    expect(await nega(db, ADMIN, "delete from acessos_log returning 1")).toBe(true);
  });

  it("funções do upload não são executáveis por usuário logado", async () => {
    for (const f of [
      "finalizar_envio(1)",
      "completar_produtos()",
      "aplicar_vendedoras('{}')",
      "aplicar_info_lojas('[]')",
    ]) {
      expect(await nega(db, ADMIN, `select public.${f}`)).toBe(true);
    }
  });

  it("gatilho: nunca fica sem admin ativo", async () => {
    expect(await erroDe(db, `update perfis set ativo=false where user_id='${ADMIN}'`)).toMatch(
      /pelo menos um admin/,
    );
    expect(await erroDe(db, `update perfis set perfil='grvo' where user_id='${ADMIN}'`)).toMatch(
      /pelo menos um admin/,
    );
    expect(await erroDe(db, `delete from auth.users where id='${ADMIN}'`)).toMatch(
      /pelo menos um admin/,
    );
    expect(
      await erroDe(db, `update perfis set nome='Matheus' where user_id='${ADMIN}'`),
    ).toBeNull();
  });
});

describe("banco: upload das bases (etapa 3)", () => {
  let db: BancoLocal;
  const fim = async (id: number) =>
    (await db.query<{ r: Record<string, number> }>(`select finalizar_envio(${id}) r`)).rows[0]!.r;
  const produto = async (sku: string) =>
    (await db.query<Record<string, unknown>>(`select * from produtos where sku='${sku}'`)).rows[0]!;

  beforeAll(async () => {
    db = await criarBancoLocal();
  }, 120_000);

  it("lojas: a que não veio no envio novo fica inativa", async () => {
    await db.exec(`insert into bases_envios (id,base) overriding system value values (1,'lojas');
      insert into lojas (bcps,nome,praca,tipo,envio_id) values ('L1','Loja 1','P1','loja',1),('L2','Loja 2','P1','loja',1);`);
    expect((await fim(1))["linhas"]).toBe(2);
    await db.exec(`insert into bases_envios (id,base) overriding system value values (2,'lojas');
      insert into lojas (bcps,nome,praca,tipo,envio_id) values ('L1','Loja 1','P1','loja',2)
        on conflict (bcps) do update set envio_id=excluded.envio_id;`);
    expect((await fim(2))["removidas"]).toBe(1);
    expect(
      (await db.query<{ ativo: boolean }>(`select ativo from lojas where bcps='L2'`)).rows[0]!
        .ativo,
    ).toBe(false);
    expect(await erroDe(db, "select finalizar_envio(2)")).toMatch(/não está em andamento/);
  });

  it("produtos da cobertura: fornecedor/marca pela 1ª palavra, nicho e regular pela regra", async () => {
    await db.exec(`insert into bases_envios (id,base) overriding system value values (3,'produtos');
      insert into produtos (sku,descricao,marca,fornecedor,nicho,origem_nicho,origem_fornecedor,origem_cadastro,envio_id) values
        ('1','FLORATTA DES COL A','FLORATTA','BOT','F','marca','dsku','dsku',3),
        ('3','QDB LAP X','QUEM DISSE BERENICE','QDB','U','padrao_u','dsku','dsku',3);`);
    await fim(3);
    await db.exec(`insert into bases_envios (id,base) overriding system value values (4,'cobertura');
      insert into produtos (sku,descricao,origem_cadastro,origem_fornecedor) values
        ('9','FLORATTA DES COL PRM 10ml','cobertura','nao_encontrado'),
        ('8','QDB BATOM','cobertura','nao_encontrado'),
        ('7','XYZ BABY LOCAO','cobertura','nao_encontrado') on conflict do nothing;
      insert into estoque (bcps,sku,estoque,vmd,preco,custo,base_versao,envio_id) values
        ('L1','1',10,1,100,50,'2026-10-07',4),('L1','9',5,0,0,3,'2026-10-07',4),('L1','99',1,0,10,5,'2026-10-07',4);`);
    const r = await fim(4);
    expect(r).toMatchObject({ linhas: 3, preco_zero: 1, skus_sem_cadastro: 1 });
    expect(await produto("9")).toMatchObject({
      fornecedor: "BOT",
      marca: "FLORATTA",
      origem_fornecedor: "primeira_palavra",
      regular: false,
      nicho: "F",
      origem_nicho: "marca",
    });
    expect(await produto("8")).toMatchObject({
      fornecedor: "QDB",
      marca: "QUEM DISSE BERENICE",
      nicho: "U",
      origem_nicho: "padrao_u",
    });
    expect(await produto("7")).toMatchObject({
      fornecedor: null,
      marca: "XYZ",
      origem_fornecedor: "nao_encontrado",
      nicho: "I",
      origem_nicho: "descricao",
    });
  });

  it("cobertura nova substitui a anterior", async () => {
    await db.exec(`insert into bases_envios (id,base) overriding system value values (5,'cobertura');
      insert into estoque (bcps,sku,estoque,vmd,preco,custo,base_versao,envio_id) values ('L1','1',20,1,100,50,'2026-10-08',5)
        on conflict (bcps,sku) do update set estoque=excluded.estoque, envio_id=excluded.envio_id;`);
    expect(await fim(5)).toMatchObject({ linhas: 1, removidas: 2 });
  });

  it("promoção de um ciclo não mexe nos outros", async () => {
    await db.exec(`insert into promocoes (ciclo,sku,desconto_pct) values (16,'1',20);
      insert into bases_envios (id,base,ciclo) overriding system value values (6,'promocao',15);
      insert into promocoes (ciclo,sku,desconto_pct,envio_id) values (15,'1',30,6);`);
    expect((await fim(6))["linhas"]).toBe(1);
    expect((await db.query("select * from promocoes")).rows).toHaveLength(2);
  });

  it("vendedoras: loja fora do arquivo fica com 0", async () => {
    await db.exec(`update lojas set ativo=true`);
    expect(
      (await db.query<{ n: number }>(`select aplicar_vendedoras('{"L1":3,"ZZ":9}') n`)).rows[0]!.n,
    ).toBe(1);
    expect(
      (await db.query<{ v: number }>(`select vendedoras v from lojas where bcps='L2'`)).rows[0]!.v,
    ).toBe(0);
  });

  it("divisão e canais vindos dos gerentes: só lojas existentes, campo ausente não apaga", async () => {
    await db.exec(
      `select aplicar_info_lojas('[{"bcps":"L1","divisao":"4082","canais":["Varejo","Venda Direta"]},{"bcps":"XX","divisao":"1"}]')`,
    );
    await db.exec(`select aplicar_info_lojas('[{"bcps":"L1","canal_geral":"Híbrida"}]')`);
    const l1 = (
      await db.query<Record<string, unknown>>(
        `select divisao, canal_geral, canais from lojas where bcps='L1'`,
      )
    ).rows[0]!;
    expect(l1).toMatchObject({
      divisao: "4082",
      canal_geral: "Híbrida",
      canais: ["Varejo", "Venda Direta"],
    });
  });
});
