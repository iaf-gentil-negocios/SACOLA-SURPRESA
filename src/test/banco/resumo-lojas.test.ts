// @vitest-environment node
// 0002f: cidade/UF das lojas e resumo_lojas_da_base (dashboard e Painel do gerente).
import { beforeAll, describe, expect, it } from "vitest";

import { como, criarBancoLocal, erroDe, sqlDaMigracao, type BancoLocal } from "./banco-local";

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const ACOMP = "00000000-0000-0000-0000-00000000000b";
const GVO = "00000000-0000-0000-0000-00000000000c";

type Linha = {
  bcps: string;
  custo: string | null;
  capacidade: number | null;
  sacolas_meta: number;
};

const resumo = async (db: BancoLocal, uid: string, plano: number) => {
  const r = await como<Linha>(
    db,
    uid,
    `select * from resumo_lojas_da_base(${plano}) order by bcps`,
  );
  if ("erro" in r) throw new Error(r.erro);
  return r.linhas;
};

describe("banco: resumo_lojas_da_base (0002f)", () => {
  let db: BancoLocal;

  beforeAll(async () => {
    db = await criarBancoLocal();
    await db.exec(`
      insert into auth.users values ('${ADMIN}','a'),('${ACOMP}','b'),('${GVO}','c');
      insert into lojas (bcps,nome,praca,cidade,uf) values
        ('L1','Loja 1','P1','Natal','RN'),('L2','Loja 2','P2','Mossoró','RN');
      insert into gerentes values ('900','Gvo');
      insert into gerentes_lojas (matricula,bcps,nivel) values ('900','L1','gvo');
      insert into perfis (user_id,usuario,nome,perfil,matricula,troca_senha) values
        ('${ADMIN}','matheus','M','admin',null,false),
        ('${ACOMP}','time.um','T','acompanhamento',null,false),
        ('${GVO}','gvo.um','G','gerente','900',false);
      insert into planos (id,ciclo,vigente,nome,inicio,fim) overriding system value values
        (10,15,false,'Iniciada','2000-01-01','2099-01-02'),
        (11,15,false,'Futura','2099-02-01','2099-02-02');
      insert into base_lojas (plano_id,bcps,sacolas_meta,sacolas_planejadas,receita,custo) values
        (10,'L1',20,18,3400,1500),(10,'L2',10,10,1900,800),(11,'L1',5,5,900,400);
      insert into base_kits (plano_id,codigo,tema,preco,valor_cheio,desconto_pct,heroi_sku)
        values (10,'K1','Tema',189.9,300,37,'S1'),(10,'K2','Tema',189.9,300,37,'S2');
      insert into base_kit_lojas (plano_id,codigo,bcps,qtd,capacidade_loja,disponivel_ref) values
        (10,'K1','L1',10,7,'2026-10-11'),(10,'K2','L1',8,7,'2026-10-11'),(10,'K1','L2',10,null,null);
    `);
  }, 120_000);

  it("o SQL pode rodar de novo sem erro", async () => {
    expect(await erroDe(db, sqlDaMigracao("0002f_"))).toBeNull();
  });

  it("admin e acompanhamento: todas as lojas, com custo e capacidade por loja", async () => {
    for (const uid of [ADMIN, ACOMP]) {
      const r = await resumo(db, uid, 10);
      expect(r.map((l) => [l.bcps, Number(l.custo), l.capacidade])).toEqual([
        ["L1", 1500, 7],
        ["L2", 800, null],
      ]);
    }
  });

  it("gerente: só o escopo, custo nulo e nada de base futura", async () => {
    const r = await resumo(db, GVO, 10);
    expect(r.map((l) => [l.bcps, l.custo, l.sacolas_meta])).toEqual([["L1", null, 20]]);
    expect(await resumo(db, GVO, 11)).toEqual([]);
  });

  it("cidade e UF gravadas nas lojas", async () => {
    const r = await como<{ cidade: string; uf: string }>(
      db,
      ADMIN,
      "select cidade, uf from lojas order by bcps",
    );
    expect("linhas" in r && r.linhas).toEqual([
      { cidade: "Natal", uf: "RN" },
      { cidade: "Mossoró", uf: "RN" },
    ]);
  });
});
