// @vitest-environment node
// Parte F2b (drizzle/migrations/0002j_f2b_vendas.sql): vendas do canal App Delivery, ruído e
// declarações dos GVOs.
import { beforeAll, describe, expect, it } from "vitest";

import { como, criarBancoLocal, erroDe, sqlDaMigracao, type BancoLocal } from "./banco-local";

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const ACOMP = "00000000-0000-0000-0000-00000000000b";
const GVO = "00000000-0000-0000-0000-00000000000c";
const GCVO = "00000000-0000-0000-0000-00000000000d";
const DIRETORA = "00000000-0000-0000-0000-00000000000e";

const j = (x: unknown) => `'${JSON.stringify(x).replace(/'/g, "''")}'::jsonb`;
const erro = (r: { erro: string } | { linhas: unknown[] }) => ("erro" in r ? r.erro : null);
const linhas = async (db: BancoLocal, uid: string, sql: string) => {
  const r = await como<Record<string, unknown>>(db, uid, sql);
  if ("erro" in r) throw new Error(r.erro);
  return r.linhas;
};

describe("banco: vendas do canal, ruído e declarações (0002j)", () => {
  let db: BancoLocal;

  beforeAll(async () => {
    db = await criarBancoLocal();
    await db.exec(`
      insert into auth.users values ('${ADMIN}','a'),('${ACOMP}','b'),('${GVO}','c'),('${GCVO}','d'),('${DIRETORA}','e');
      insert into lojas (bcps,nome,praca) values ('L1','Loja 1','P1'),('L2','Loja 2','P1'),('L3','Loja 3','P2');
      insert into gerentes values ('900','Gvo'),('50','Gcvo'),('3140','Diretora');
      insert into gerentes_lojas (matricula,bcps,nivel) values
        ('900','L1','gvo'),('50','L1','gcvo_gpvo'),('50','L2','gcvo_gpvo'),('3140','L3','grvo');
      insert into perfis (user_id,usuario,nome,perfil,matricula,troca_senha) values
        ('${ADMIN}','matheus','M','admin',null,false),
        ('${ACOMP}','time.um','T','acompanhamento',null,false),
        ('${GVO}','gvo.um','G','gerente','900',false),
        ('${GCVO}','gcvo.um','C','gerente','50',false),
        ('${DIRETORA}','fabiana','F','gerente','3140',false);
      update perfis set ve_todas = true where user_id = '${DIRETORA}';
      insert into planos (id,ciclo,vigente,nome,inicio,fim) overriding system value values
        (10,15,false,'Base','2026-10-01','2026-10-31');
      insert into base_lojas (plano_id,bcps,sacolas_meta,sacolas_planejadas,receita,custo) values
        (10,'L1',20,10,1900,800),(10,'L2',10,10,2000,900),(10,'L3',5,5,1000,400);
    `);
  }, 120_000);

  it("o SQL pode rodar de novo sem erro", async () => {
    expect(await erroDe(db, sqlDaMigracao("0002j_"))).toBeNull();
  });

  describe("vendas", () => {
    it("admin grava; o período do arquivo substitui (dia sem linha = 0); soma linhas repetidas", async () => {
      const v1 = [
        { bcps: "L1", dia: "2026-10-01", gmv: 100, boletos: 1, itens: 2 },
        { bcps: "L1", dia: "2026-10-02", gmv: 50, boletos: 1, itens: 1 },
        { bcps: "L3", dia: "2026-10-02", gmv: 80, boletos: 1, itens: 3 },
      ];
      expect(
        erro(
          await como(
            db,
            ADMIN,
            `select gravar_vendas_canal('2026-10-01','2026-10-02','a.csv',${j(v1)})`,
          ),
        ),
      ).toBeNull();
      // reenvio do dia 2: L1 some (venda 0 nesse dia), L3 muda; linhas repetidas somam
      const v2 = [
        { bcps: "L3", dia: "2026-10-02", gmv: 30, boletos: 1, itens: 1 },
        { bcps: "L3", dia: "2026-10-02", gmv: 20, boletos: 1, itens: 1 },
      ];
      await como(
        db,
        ADMIN,
        `select gravar_vendas_canal('2026-10-02','2026-10-02','b.csv',${j(v2)})`,
      );
      const r = await linhas(
        db,
        ADMIN,
        "select bcps, dia::text, gmv::float, boletos from vendas_canal_dia order by dia, bcps",
      );
      expect(r).toEqual([
        { bcps: "L1", dia: "2026-10-01", gmv: 100, boletos: 1 },
        { bcps: "L3", dia: "2026-10-02", gmv: 50, boletos: 2 },
      ]);
      expect(await linhas(db, ADMIN, "select * from vendas_envios")).toHaveLength(2);
    });

    it("linha fora do período ou inválida recusa o arquivo; só admin grava", async () => {
      const fora = [{ bcps: "L1", dia: "2026-09-30", gmv: 1, boletos: 1, itens: 1 }];
      expect(
        erro(
          await como(
            db,
            ADMIN,
            `select gravar_vendas_canal('2026-10-01','2026-10-02','x',${j(fora)})`,
          ),
        ),
      ).toMatch(/Linha inválida/);
      expect(
        erro(
          await como(db, ACOMP, `select gravar_vendas_canal('2026-10-01','2026-10-02','x','[]')`),
        ),
      ).toMatch(/Só o admin/);
      expect(
        erro(
          await como(
            db,
            GVO,
            "insert into vendas_canal_dia (bcps,dia,gmv) values ('L1','2026-10-05',1)",
          ),
        ),
      ).not.toBeNull();
    });

    it("gerente lê só as lojas do escopo; acompanhamento e diretoria leem todas", async () => {
      expect(
        (await linhas(db, GVO, "select bcps from vendas_canal_dia")).map((x) => x["bcps"]),
      ).toEqual(["L1"]);
      expect(await linhas(db, ACOMP, "select bcps from vendas_canal_dia")).toHaveLength(2);
      expect(await linhas(db, DIRETORA, "select bcps from vendas_canal_dia")).toHaveLength(2);
      expect(await linhas(db, GVO, "select fim from vendas_envios")).toHaveLength(2); // só as datas
    });
  });

  describe("ruído", () => {
    it("admin grava o ruído do ciclo (substitui); gerente lê só o escopo", async () => {
      const r = [
        { bcps: "L1", dow: 1, ruido: 10, dias_historico: 56, outliers: 1 },
        { bcps: "L3", dow: 1, ruido: -5, dias_historico: 56, outliers: 0 },
      ];
      expect(
        erro(await como(db, ADMIN, `select gravar_ruido(15::smallint,'2026-10-16',${j(r)})`)),
      ).toBeNull();
      await como(db, ADMIN, `select gravar_ruido(15::smallint,'2026-10-16',${j(r)})`);
      expect(await linhas(db, ADMIN, "select * from ruido_lojas")).toHaveLength(2);
      expect(
        (await linhas(db, ADMIN, "select ruido::float from ruido_lojas where bcps='L3'"))[0]![
          "ruido"
        ],
      ).toBe(0);
      expect(await linhas(db, GVO, "select * from ruido_lojas")).toHaveLength(1);
      expect(
        erro(await como(db, GVO, `select gravar_ruido(15::smallint,'2026-10-16','[]')`)),
      ).toMatch(/Só o admin/);
    });
  });

  describe("declarações", () => {
    const declarar = (
      uid: string,
      bcps: string,
      inicio = "2026-10-05",
      tipo = "dia",
      sacolas = 4,
    ) =>
      como(
        db,
        uid,
        `insert into declaracoes_vendas (bcps,ciclo,tipo,inicio,fim,sacolas)
         values ('${bcps}',15,'${tipo}','${inicio}','${inicio}'::date + ${tipo === "semana" ? 6 : 0},${sacolas})`,
      );

    it("o GVO declara a loja dele; preço médio da praça vem do banco (ponderado)", async () => {
      expect(erro(await declarar(GVO, "L1"))).toBeNull();
      const d = await linhas(
        db,
        GVO,
        "select user_id::text, status, preco_medio::float from declaracoes_vendas",
      );
      // praça P1: (1900 + 2000) ÷ (10 + 10) = 195
      expect(d).toEqual([{ user_id: GVO, status: "pendente", preco_medio: 195 }]);
    });

    it("GCVO/GPVO, GRVO e diretoria não declaram; GVO não declara loja de outro", async () => {
      expect(erro(await declarar(GCVO, "L1", "2026-10-06"))).not.toBeNull();
      expect(erro(await declarar(DIRETORA, "L3", "2026-10-06"))).not.toBeNull();
      expect(erro(await declarar(GVO, "L2", "2026-10-06"))).not.toBeNull();
    });

    it("mesmo período não duplica; semana = 7 dias; futuro não", async () => {
      expect(erro(await declarar(GVO, "L1"))).not.toBeNull();
      expect(erro(await declarar(GVO, "L1", "2026-10-06", "semana"))).toBeNull();
      expect(erro(await declarar(GVO, "L1", "2099-01-01"))).toMatch(/ainda não começou/);
    });

    it("GCVO e diretoria veem as declarações do escopo; acompanhamento vê todas", async () => {
      expect(await linhas(db, GCVO, "select id from declaracoes_vendas")).toHaveLength(2);
      expect(await linhas(db, DIRETORA, "select id from declaracoes_vendas")).toHaveLength(2);
      expect(await linhas(db, ACOMP, "select id from declaracoes_vendas")).toHaveLength(2);
    });

    it("só o admin decide; a decisão vale uma vez; GVO apaga só a própria pendente", async () => {
      const id = (
        (await linhas(db, ADMIN, "select id::int from declaracoes_vendas order by id limit 1")) as {
          id: number;
        }[]
      )[0]!.id;
      expect(erro(await como(db, GVO, `select decidir_declaracao(${id}, true, null)`))).toMatch(
        /Só o admin/,
      );
      expect(
        erro(await como(db, ADMIN, `select decidir_declaracao(${id}, false, 'sem base')`)),
      ).toBeNull();
      expect(erro(await como(db, ADMIN, `select decidir_declaracao(${id}, true, null)`))).toMatch(
        /já decidida/,
      );
      const [d] = await linhas(
        db,
        ADMIN,
        `select status, motivo, decidido_por::text from declaracoes_vendas where id=${id}`,
      );
      expect(d).toEqual({ status: "recusada", motivo: "sem base", decidido_por: ADMIN });
      // recusada não bloqueia uma nova para o mesmo período
      expect(erro(await declarar(GVO, "L1"))).toBeNull();
      await como(db, GVO, "delete from declaracoes_vendas where status = 'recusada'");
      expect(
        await linhas(db, ADMIN, "select id from declaracoes_vendas where status='recusada'"),
      ).toHaveLength(1);
      await como(db, GVO, "delete from declaracoes_vendas where tipo = 'semana'");
      expect(
        await linhas(db, ADMIN, "select id from declaracoes_vendas where tipo='semana'"),
      ).toHaveLength(0);
    });
  });

  it("início da campanha por ciclo: só o admin muda", async () => {
    await como(db, GVO, "update ciclos set inicio_campanha = '2026-10-01' where id = 15");
    expect(
      (await linhas(db, ADMIN, "select inicio_campanha from ciclos where id = 15"))[0]![
        "inicio_campanha"
      ],
    ).toBeNull();
    await como(db, ADMIN, "update ciclos set inicio_campanha = '2026-10-16' where id = 15");
    expect(
      (await linhas(db, GVO, "select inicio_campanha::text from ciclos where id = 15"))[0]![
        "inicio_campanha"
      ],
    ).toBe("2026-10-16");
  });
});
