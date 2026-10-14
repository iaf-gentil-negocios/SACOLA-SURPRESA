// @vitest-environment node
// Parte F1b (drizzle/migrations/0002d_divergencias_disponibilidade.sql): disponibilidade diária,
// fotos do estoque por loja e troca de kits por loja na base.
import { beforeAll, describe, expect, it } from "vitest";

import { como, criarBancoLocal, sqlDaMigracao, type BancoLocal } from "./banco-local";

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const GERENTE = "00000000-0000-0000-0000-00000000000b";
const hojeSP = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

describe("banco: disponibilidade e troca de kits por loja (F1b)", () => {
  let db: BancoLocal;
  let plano = 0;
  const um = async <T>(sql: string) => (await db.query<T>(sql)).rows[0]!;
  const conta = async (sql: string) => (await um<{ n: number }>(`select count(*)::int n ${sql}`)).n;

  beforeAll(async () => {
    db = await criarBancoLocal();
    const hoje = hojeSP();
    await db.exec(`
      update ciclos set inicio = date '${hoje}' - 10, fim = date '${hoje}' + 20 where id = 15;
      insert into auth.users values ('${ADMIN}','a'),('${GERENTE}','g');
      insert into lojas (bcps,nome,praca) values ('L1','Loja 1','P1'),('L2','Loja 2','P1');
      insert into perfis (user_id,usuario,nome,perfil) values ('${ADMIN}','matheus','M','admin');
      insert into perfis (user_id,usuario,nome,perfil,matricula) values ('${GERENTE}','gerente','G','gerente','G1');
      insert into gerentes values ('G1','G');
      insert into gerentes_lojas (matricula,bcps,nivel) values ('G1','L1','grvo');
      insert into simulacoes (id,nome,ciclo,semente,parametros,status) overriding system value
        values (1,'Teste',15,42,'{}','salva');
      insert into simulacao_kits values (1,'C15-0001','ela','F',189.9,290,34.5,'S1','a',2),
                                        (1,'C15-0002','ele','M',194.9,300,35,'S9','b',1);
      insert into simulacao_kit_itens values (1,'C15-0001',1,'heroi','S1','Herói',120,20),
                                             (1,'C15-0001',2,'surpresa','S2','B',90,null),
                                             (1,'C15-0002',1,'heroi','S9','Outro',150,10);
      insert into simulacao_kit_lojas values
        (1,'C15-0001','L1',10,80,109.9,290,34.5,false,'[{"sku":"S1","estoque":30},{"sku":"S2","estoque":40}]'),
        (1,'C15-0002','L1',4,90,104.9,300,35,false,'[{"sku":"S9","estoque":9}]'),
        (1,'C15-0001','L2',5,80,109.9,290,34.5,true,'[]');
      insert into simulacao_lojas (simulacao_id,bcps,praca,vendedoras,meta,meta_semana,metas_mes,sacolas_meta,sacolas_possiveis,sacolas_planejadas,receita,custo)
        values (1,'L1','P1',2,1900,500,'{}',14,30,14,1899,800),(1,'L2','P1',1,950,250,'{}',5,6,5,949.5,400);
    `);
    plano = (
      await um<{ id: number }>(
        `select definir_base(1,'Base',date '${hoje}' - 1,date '${hoje}' + 5,'${ADMIN}') id`,
      )
    ).id;
  }, 120_000);

  it("o SQL roda de novo sem efeito", async () => {
    await db.exec(sqlDaMigracao("0002d_"));
    expect(await conta("from base_lojas_estoque")).toBe(0);
  });

  it("disponibilidade: Cobertura nova passa a foto atual para 'anterior'", async () => {
    const gravar = (ref: string, s1: number) =>
      como(
        db,
        ADMIN,
        `select gravar_disponibilidade(${plano}, date '${ref}', '${JSON.stringify({
          lojas: [
            {
              bcps: "L1",
              estoque: { S1: s1, S2: 40, S9: 9 },
              capacidade: 12,
              kits: [
                { codigo: "C15-0001", disponivel: Math.min(s1, 40) },
                { codigo: "C15-0002", disponivel: 9 },
              ],
            },
          ],
        })}') n`,
      );
    expect(await gravar("2026-10-10", 30)).toMatchObject({ linhas: [{ n: 1 }] });
    await gravar("2026-10-11", 12);
    const e = await um<{ atual: Record<string, number>; anterior: Record<string, number> }>(
      `select atual, anterior from base_lojas_estoque where plano_id = ${plano} and bcps = 'L1'`,
    );
    expect(e.atual["S1"]).toBe(12);
    expect(e.anterior["S1"]).toBe(30);
    // mesma Cobertura de novo: não mexe na anterior
    await gravar("2026-10-11", 11);
    const e2 = await um<{ anterior: Record<string, number> }>(
      `select anterior from base_lojas_estoque where plano_id = ${plano} and bcps = 'L1'`,
    );
    expect(e2.anterior["S1"]).toBe(30);
    const kl = await um<{ disponivel: number; capacidade_loja: number }>(
      `select disponivel, capacidade_loja from base_kit_lojas where plano_id = ${plano} and bcps = 'L1' and codigo = 'C15-0001'`,
    );
    expect(kl).toEqual({ disponivel: 11, capacidade_loja: 12 });
  });

  it("gerente lê a disponibilidade e (desde o 0002k) a foto das lojas do escopo, mas não grava", async () => {
    const r = await como<{ disponivel: number }>(
      db,
      GERENTE,
      "select disponivel, capacidade_loja from base_kit_lojas",
    );
    expect("linhas" in r && r.linhas.length).toBe(2); // só L1
    const g = await como(
      db,
      GERENTE,
      `select gravar_disponibilidade(${plano}, current_date, '{}')`,
    );
    expect("erro" in g && g.erro).toMatch(/apenas admin/);
    // 0002k (P4): o gerente lê a foto do estoque dos kits só das lojas do escopo (L1)
    const f = await como<{ bcps: string }>(db, GERENTE, "select bcps from base_lojas_estoque");
    expect("linhas" in f && f.linhas.every((x) => x.bcps === "L1")).toBe(true);
  });

  it("troca de kits: tira o indisponível, mantém o outro, entra o novo, apaga kit sem loja", async () => {
    const antes = (
      await um<{ v: string }>(`select kits_versao::text v from planos where id = ${plano}`)
    ).v;
    const dados = {
      ref: hojeSP(),
      remover: ["C15-0002"],
      manter: [{ codigo: "C15-0001", qtd: 8, disponivel: 11 }],
      kits: [
        {
          codigo: "C15-0003",
          tema: "ela",
          nicho: "F",
          preco: 184.9,
          valor_cheio: 280,
          desconto_pct: 34,
          heroi_sku: "S5",
          itens: [
            {
              ordem: 1,
              papel: "heroi",
              sku: "S5",
              descricao: "Novo",
              preco_item: 130,
              promo_pct: 15,
            },
            { ordem: 2, papel: "surpresa", sku: "S6", descricao: "Outro", preco_item: 150 },
          ],
        },
      ],
      novos: [
        {
          codigo: "C15-0003",
          qtd: 6,
          disponivel: 7,
          custo: 70,
          margem: 114.9,
          valor_cheio: 280,
          desconto_pct: 34,
          detalhes: [{ sku: "S5", estoque: 7 }],
        },
      ],
      loja: {
        sacolas_possiveis: 18,
        sacolas_planejadas: 14,
        receita: 2650,
        custo: 1060,
        capacidade: 18,
      },
    };
    const r = await como<{ r: Record<string, number> }>(
      db,
      ADMIN,
      `select regerar_kits_loja(${plano}, 'L1', '${JSON.stringify(dados)}') r`,
    );
    expect("linhas" in r && r.linhas[0]!.r).toEqual({ removidos: 1, novos: 1, kits_apagados: 1 });
    const kits = (
      await db.query<{ codigo: string; qtd: number; capacidade_loja: number }>(
        `select codigo, qtd, capacidade_loja from base_kit_lojas where plano_id = ${plano} and bcps = 'L1' order by codigo`,
      )
    ).rows;
    expect(kits).toEqual([
      { codigo: "C15-0001", qtd: 8, capacidade_loja: 18 },
      { codigo: "C15-0003", qtd: 6, capacidade_loja: 18 },
    ]);
    // C15-0002 não tinha outra loja: saiu da base com os itens
    expect(await conta(`from base_kits where plano_id = ${plano} and codigo = 'C15-0002'`)).toBe(0);
    expect(
      await conta(`from base_kit_itens where plano_id = ${plano} and codigo = 'C15-0002'`),
    ).toBe(0);
    expect(
      await conta(`from base_kit_itens where plano_id = ${plano} and codigo = 'C15-0003'`),
    ).toBe(2);
    // L2 não mudou
    expect(await conta(`from base_kit_lojas where plano_id = ${plano} and bcps = 'L2'`)).toBe(1);
    const l1 = await um<{ sacolas_planejadas: number }>(
      `select sacolas_planejadas from base_lojas where plano_id = ${plano} and bcps = 'L1'`,
    );
    expect(l1.sacolas_planejadas).toBe(14);
    const depois = (
      await um<{ v: string }>(`select kits_versao::text v from planos where id = ${plano}`)
    ).v;
    expect(depois).not.toBe(antes);
  });

  it("gerente não troca kits", async () => {
    const r = await como(db, GERENTE, `select regerar_kits_loja(${plano}, 'L1', '{}')`);
    expect("erro" in r && r.erro).toMatch(/apenas admin/);
  });
});
