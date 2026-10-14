// @vitest-environment node
// Revisão de consumo, item 8: excluir simulação salva — só o admin, e os kits saem junto.
import { beforeAll, describe, expect, it } from "vitest";

import { como, criarBancoLocal, type BancoLocal } from "./banco-local";

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const ACOMP = "00000000-0000-0000-0000-00000000000b";

const conta = async (db: BancoLocal, tabela: string) =>
  (await db.query<{ n: number }>(`select count(*)::int as n from ${tabela}`)).rows[0]!.n;

describe("banco: excluir simulação salva", () => {
  let db: BancoLocal;
  beforeAll(async () => {
    db = await criarBancoLocal();
    await db.exec(`
      insert into auth.users values ('${ADMIN}','a'),('${ACOMP}','b');
      insert into perfis (user_id,usuario,nome,perfil,troca_senha) values
        ('${ADMIN}','matheus','M','admin',false),('${ACOMP}','time.um','T','acompanhamento',false);
      insert into simulacoes (id,nome,ciclo,semente,parametros) overriding system value values
        (1,'S1',15,1,'{}'),(2,'S2',15,2,'{}');
      insert into simulacao_kits (simulacao_id,codigo,tema,preco,valor_cheio,desconto_pct,heroi_sku,composicao)
        values (1,'K1','T',189.9,300,37,'A','A'),(2,'K1','T',189.9,300,37,'A','A');
      insert into simulacao_kit_itens (simulacao_id,codigo,ordem,papel,sku,descricao,preco_item)
        values (1,'K1',1,'heroi','A','A',120),(2,'K1',1,'heroi','A','A',120);
    `);
  }, 120_000);

  it("acompanhamento não exclui", async () => {
    await como(db, ACOMP, "delete from simulacoes where id = 1");
    expect(await conta(db, "simulacoes")).toBe(2);
  });

  it("admin exclui e os kits e itens saem junto", async () => {
    const r = await como(db, ADMIN, "delete from simulacoes where id = 1");
    expect("erro" in r).toBe(false);
    expect(await conta(db, "simulacoes")).toBe(1);
    expect(await conta(db, "simulacao_kits")).toBe(1);
    expect(await conta(db, "simulacao_kit_itens")).toBe(1);
  });
});
