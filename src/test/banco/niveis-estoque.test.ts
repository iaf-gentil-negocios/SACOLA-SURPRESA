// @vitest-environment node
// Lote de 13/10/2026 (drizzle/migrations/0002k_niveis_e_estoque_do_gerente.sql):
// P3 — meus_niveis() (níveis do próprio usuário na hierarquia, para esconder o mapa do GVO);
// P4 — o gerente lê a foto do estoque dos kits (base_lojas_estoque) só das lojas do escopo.
import { beforeAll, describe, expect, it } from "vitest";

import { como, criarBancoLocal, sqlDaMigracao, type BancoLocal } from "./banco-local";

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const GRVO = "00000000-0000-0000-0000-00000000000b";
const GVO = "00000000-0000-0000-0000-00000000000c";
const ACOMP = "00000000-0000-0000-0000-00000000000d";
const hojeSP = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

describe("banco: níveis do usuário e estoque dos kits para o gerente (0002k)", () => {
  let db: BancoLocal;
  let plano = 0;
  let futura = 0;
  const um = async <T>(sql: string) => (await db.query<T>(sql)).rows[0]!;

  beforeAll(async () => {
    db = await criarBancoLocal();
    const hoje = hojeSP();
    await db.exec(`
      update ciclos set inicio = date '${hoje}' - 10, fim = date '${hoje}' + 20 where id = 15;
      insert into auth.users values ('${ADMIN}','a'),('${GRVO}','r'),('${GVO}','v'),('${ACOMP}','c');
      insert into lojas (bcps,nome,praca) values ('L1','Loja 1','P1'),('L2','Loja 2','P1');
      insert into perfis (user_id,usuario,nome,perfil) values ('${ADMIN}','matheus','M','admin');
      insert into perfis (user_id,usuario,nome,perfil) values ('${ACOMP}','acomp','A','acompanhamento');
      insert into perfis (user_id,usuario,nome,perfil,matricula) values
        ('${GRVO}','grvo','R','gerente','R1'), ('${GVO}','gvo','V','gerente','V1');
      insert into gerentes values ('R1','R'),('V1','V');
      insert into gerentes_lojas (matricula,bcps,nivel) values
        ('R1','L1','grvo'),('R1','L2','grvo'),('V1','L2','gvo');
      insert into simulacoes (id,nome,ciclo,semente,parametros,status) overriding system value
        values (1,'Teste',15,42,'{}','salva');
      insert into simulacao_kits values (1,'C15-0001','ela','F',189.9,290,34.5,'S1','a',2);
      insert into simulacao_kit_itens values (1,'C15-0001',1,'heroi','S1','Herói',120,20),
                                             (1,'C15-0001',2,'surpresa','S2','B',90,null);
      insert into simulacao_kit_lojas values
        (1,'C15-0001','L1',10,80,109.9,290,34.5,false,'[]'),
        (1,'C15-0001','L2',5,80,109.9,290,34.5,false,'[]');
      insert into simulacao_lojas (simulacao_id,bcps,praca,vendedoras,meta,meta_semana,metas_mes,sacolas_meta,sacolas_possiveis,sacolas_planejadas,receita,custo)
        values (1,'L1','P1',2,1900,500,'{}',14,30,14,1899,800),(1,'L2','P1',1,950,250,'{}',5,6,5,949.5,400);
    `);
    plano = (
      await um<{ id: number }>(
        `select definir_base(1,'Atual',date '${hoje}' - 1,date '${hoje}' + 5,'${ADMIN}') id`,
      )
    ).id;
    futura = (
      await um<{ id: number }>(
        `select definir_base(1,'Futura',date '${hoje}' + 6,date '${hoje}' + 9,'${ADMIN}') id`,
      )
    ).id;
    for (const p of [plano, futura])
      await como(
        db,
        ADMIN,
        `select gravar_disponibilidade(${p}, date '${hoje}', '${JSON.stringify({
          lojas: [
            { bcps: "L1", estoque: { S1: 7, S2: 3 }, capacidade: 3, kits: [] },
            { bcps: "L2", estoque: { S1: 1, S2: 9 }, capacidade: 1, kits: [] },
          ],
        })}')`,
      );
  }, 120_000);

  it("o SQL roda de novo sem efeito", async () => {
    await db.exec(sqlDaMigracao("0002k_"));
    await db.exec(sqlDaMigracao("0002k_"));
    expect((await um<{ n: number }>("select count(*)::int n from base_lojas_estoque")).n).toBe(4);
  });

  it("meus_niveis: só os níveis do próprio usuário", async () => {
    const niveis = async (u: string) => {
      const r = await como<{ n: string }>(db, u, "select meus_niveis() n order by 1");
      if ("erro" in r) throw new Error(r.erro);
      return r.linhas.map((x) => x.n);
    };
    expect(await niveis(GRVO)).toEqual(["grvo"]);
    expect(await niveis(GVO)).toEqual(["gvo"]);
    expect(await niveis(ADMIN)).toEqual([]);
    expect(await como(db, null, "select meus_niveis()")).toHaveProperty("erro");
  });

  it("gerente lê a foto do estoque só das lojas do escopo e só de bases já iniciadas", async () => {
    const lojas = async (u: string) => {
      const r = await como<{ plano_id: number; bcps: string }>(
        db,
        u,
        "select plano_id, bcps from base_lojas_estoque order by plano_id, bcps",
      );
      if ("erro" in r) throw new Error(r.erro);
      return r.linhas.map((x) => `${x.plano_id === plano ? "atual" : "futura"}:${x.bcps}`);
    };
    expect(await lojas(GVO)).toEqual(["atual:L2"]);
    expect(await lojas(GRVO)).toEqual(["atual:L1", "atual:L2"]);
    // admin e Acompanhamento continuam lendo tudo
    expect(await lojas(ADMIN)).toHaveLength(4);
    expect(await lojas(ACOMP)).toHaveLength(4);
  });

  it("gerente não grava a foto e continua sem ler o estoque com custo", async () => {
    const r = await como(
      db,
      GVO,
      `update base_lojas_estoque set atual = '{}' where bcps = 'L2' returning bcps`,
    );
    expect("linhas" in r ? r.linhas : []).toHaveLength(0);
    const e = await como<{ n: number }>(db, GVO, "select count(*)::int n from estoque");
    expect("linhas" in e ? e.linhas[0]!.n : 0).toBe(0);
  });
});
