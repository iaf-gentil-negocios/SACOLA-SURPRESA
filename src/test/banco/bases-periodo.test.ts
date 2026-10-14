// @vitest-environment node
// Simulações salvas → base por período (parte 2 do SQL pendente).
import { beforeAll, describe, expect, it } from "vitest";

import { como, criarBancoLocal, erroDe, sqlPendente, type BancoLocal } from "./banco-local";

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const GERENTE = "00000000-0000-0000-0000-00000000000b";

const hojeSP = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

describe("SQL pendente", () => {
  it("não tem a palavra drop (o Lovable bloqueia)", () => {
    expect(/drop/i.test(sqlPendente())).toBe(false);
  });
});

describe("banco: simulação salva → base por período", () => {
  let db: BancoLocal;
  const qtd = async (uid: string, sql: string) => {
    const r = await como(db, uid, sql);
    return "erro" in r ? r.erro : r.linhas.length;
  };

  beforeAll(async () => {
    db = await criarBancoLocal();
    // ciclo 15 cobrindo hoje, para testar base "já iniciada" x "futura"
    const hoje = hojeSP();
    await db.exec(`
      update ciclos set inicio = date '${hoje}' - 10, fim = date '${hoje}' + 20 where id = 15;
      insert into auth.users values ('${ADMIN}','a'),('${GERENTE}','g');
      insert into lojas (bcps,nome,praca) values ('L1','Loja 1','P1'),('L2','Loja 2','P1');
      insert into perfis (user_id,usuario,nome,perfil) values ('${ADMIN}','matheus','M','admin');
      insert into perfis (user_id,usuario,nome,perfil,matricula) values ('${GERENTE}','gerente','G','grvo','G1');
      -- escopo pela hierarquia (parte C): GRVO de L1
      insert into gerentes values ('G1','G');
      insert into gerentes_lojas (matricula,bcps,nivel) values ('G1','L1','grvo');
      insert into simulacoes (id,nome,ciclo,semente,parametros,status) overriding system value
        values (1,'Teste',15,42,'{"x":1}','salva'),(2,'Gravando',15,1,'{}','gravando');
      insert into simulacao_kits values (1,'C15-0001','ela','F',189.9,290,34.5,'S1','S1-S2-S3|189.90',2),
                                        (1,'C15-0002','ele','M',194.9,300,35,'S9','S9-S8-S7|194.90',1);
      insert into simulacao_kit_itens values (1,'C15-0001',1,'heroi','S1','Herói',120,20),(1,'C15-0001',2,'surpresa','S2','B',90,null),
                                             (1,'C15-0002',1,'heroi','S9','Outro',150,10);
      insert into simulacao_kit_lojas values (1,'C15-0001','L1',10,80,109.9,290,34.5,false,'[]'),
                                             (1,'C15-0001','L2',5,80,109.9,290,34.5,true,'[]'),
                                             (1,'C15-0002','L2',0,90,104.9,300,35,false,'[]');
      insert into simulacao_lojas (simulacao_id,bcps,praca,vendedoras,meta,meta_semana,metas_mes,sacolas_meta,sacolas_possiveis,sacolas_planejadas,receita,custo)
        values (1,'L1','P1',2,1900,500,'{"2026-10":1600,"2026-11":300}',10,30,10,1899,800),
               (1,'L2','P1',1,950,250,'{"2026-10":800,"2026-11":150}',5,6,5,949.5,400);
    `);
  }, 120_000);

  it("define a base copiando só os kits com sacolas", async () => {
    const hoje = hojeSP();
    const r = await db.query<{ id: number }>(
      `select definir_base(1, ' Semana 1 ', date '${hoje}' - 2, date '${hoje}' + 4, '${ADMIN}') id`,
    );
    const id = r.rows[0]!.id;
    const conta = async (t: string) =>
      (await db.query<{ n: number }>(`select count(*)::int n from ${t} where plano_id = ${id}`))
        .rows[0]!.n;
    expect(await conta("base_kits")).toBe(1); // C15-0002 tem 0 sacolas
    expect(await conta("base_kit_itens")).toBe(2);
    expect(await conta("base_kit_lojas")).toBe(2);
    expect(await conta("base_kit_lojas_admin")).toBe(2);
    expect(await conta("base_lojas")).toBe(2);
    expect(await conta("base_metas_mensais")).toBe(4);
    expect(await conta("plano_metas")).toBe(2);
    const p = (
      await db.query<{ nome: string; simulacao_id: number }>(
        `select nome, simulacao_id from planos where id = ${id}`,
      )
    ).rows[0]!;
    expect(p).toMatchObject({ nome: "Semana 1", simulacao_id: 1 });
  });

  it("recusa simulação não salva e sobreposição; fora do ciclo é aceito (0002c)", async () => {
    const hoje = hojeSP();
    expect(
      await erroDe(db, `select definir_base(2,'x',date '${hoje}',date '${hoje}','${ADMIN}')`),
    ).toMatch(/não encontrada ou ainda não salva/);
    // fora do ciclo, sem sobrepor: aceito (desfeito em seguida para não mudar os outros testes)
    expect(
      await erroDe(
        db,
        `begin; select definir_base(1,'fora',date '${hoje}' + 400,date '${hoje}' + 401,'${ADMIN}'); rollback;`,
      ),
    ).toBeNull();
    expect(
      await erroDe(
        db,
        `select definir_base(1,'x',date '${hoje}' + 3,date '${hoje}' + 8,'${ADMIN}')`,
      ),
    ).toMatch(/sobrep/);
    expect(
      await erroDe(
        db,
        `select definir_base(1,'x',date '${hoje}' + 9,date '${hoje}' + 5,'${ADMIN}')`,
      ),
    ).toMatch(/inválido/);
  });

  it("gerente vê a base iniciada só do seu escopo, sem custo nem cobertura", async () => {
    expect(await qtd(GERENTE, "select * from planos")).toBe(1);
    expect(await qtd(GERENTE, "select * from base_kit_lojas")).toBe(1); // só L1
    expect(await qtd(GERENTE, "select * from base_kits")).toBe(1);
    expect(await qtd(GERENTE, "select * from base_kit_itens")).toBe(2);
    expect(await qtd(GERENTE, "select * from base_metas_mensais")).toBe(2);
    expect(await qtd(GERENTE, "select * from plano_metas")).toBe(1);
    expect(await qtd(GERENTE, "select * from base_kit_lojas_admin")).toBe(0);
    expect(await qtd(GERENTE, "select * from base_lojas")).toBe(0);
    expect(await qtd(GERENTE, "select * from simulacoes")).toBe(0);
    expect(await qtd(GERENTE, "select * from simulacao_kit_lojas")).toBe(0);
  });

  it("base futura: só o admin vê", async () => {
    const hoje = hojeSP();
    await db.exec(
      `select definir_base(1,'Futura',date '${hoje}' + 10,date '${hoje}' + 15,'${ADMIN}')`,
    );
    expect(await qtd(GERENTE, "select * from planos")).toBe(1);
    expect(await qtd(ADMIN, "select * from planos")).toBe(2);
    expect(await qtd(GERENTE, "select * from base_kit_lojas")).toBe(1);
  });

  it("anon e authenticated não executam definir_base", async () => {
    const r = await como(
      db,
      ADMIN,
      `select public.definir_base(1,'x',current_date,current_date,'${ADMIN}')`,
    );
    expect("erro" in r).toBe(true);
  });
});
