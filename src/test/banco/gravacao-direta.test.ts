// @vitest-environment node
// 0002h (revisão de consumo, item 9): Cobertura e "Salvar simulação" gravados direto no banco,
// com a mesma segurança (só admin, envio/simulação em andamento) e a mesma validação de antes.
import { beforeAll, describe, expect, it } from "vitest";

import { como, criarBancoLocal, erroDe, sqlDaMigracao, type BancoLocal } from "./banco-local";

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const ACOMP = "00000000-0000-0000-0000-00000000000b";
const GVO = "00000000-0000-0000-0000-00000000000c";

const j = (x: unknown) => `'${JSON.stringify(x).replace(/'/g, "''")}'::jsonb`;
const erro = (r: { erro: string } | { linhas: unknown[] }) => ("erro" in r ? r.erro : null);
const conta = async (db: BancoLocal, sql: string) =>
  (await db.query<{ n: number }>(`select count(*)::int as n from ${sql}`)).rows[0]!.n;

const linhaEstoque = (i: number, extra: Record<string, unknown> = {}) => ({
  bcps: "L1",
  sku: `S${i}`,
  estoque: 5,
  vmd: 0.5,
  preco: 99.9,
  custo: 40,
  situacao: "Ativo",
  ...extra,
});

describe("banco: gravação direta da Cobertura e da simulação (0002h)", () => {
  let db: BancoLocal;

  beforeAll(async () => {
    db = await criarBancoLocal();
    await db.exec(`
      insert into auth.users values ('${ADMIN}','a'),('${ACOMP}','b'),('${GVO}','c');
      insert into lojas (bcps,nome,praca) values ('L1','Loja 1','P1');
      insert into perfis (user_id,usuario,nome,perfil,matricula,troca_senha) values
        ('${ADMIN}','matheus','M','admin',null,false),
        ('${ACOMP}','time.um','T','acompanhamento',null,false),
        ('${GVO}','gvo.um','G','gerente','900',false);
      insert into bases_envios (id,base,versao_ref,status,enviado_por) overriding system value values
        (1,'cobertura','2026-10-12','em_andamento','${ADMIN}'),
        (2,'cobertura','2026-10-11','concluido','${ADMIN}'),
        (3,'promocao',null,'em_andamento','${ADMIN}');
      insert into simulacoes (id,nome,ciclo,semente,parametros,status) overriding system value values
        (1,'S1',15,1,'{}','gravando'),(2,'S2',15,2,'{}','salva');
    `);
  }, 120_000);

  it("o SQL pode rodar de novo sem erro", async () => {
    expect(await erroDe(db, sqlDaMigracao("0002h_"))).toBeNull();
  });

  describe("Cobertura", () => {
    it("admin grava SKUs novos e o estoque (base_versao e envio_id do envio)", async () => {
      expect(
        erro(
          await como(
            db,
            ADMIN,
            `select gravar_skus_cobertura(1, ${j([{ sku: "S1", descricao: "PERFUME X" }])})`,
          ),
        ),
      ).toBeNull();
      const r = await como(
        db,
        ADMIN,
        `select gravar_lote_cobertura(1, ${j([
          linhaEstoque(1, { situacao: "x".repeat(80) }),
          linhaEstoque(2, { custo: null }),
        ])}) as n`,
      );
      expect(erro(r)).toBeNull();
      const e = await db.query<{ situacao: string; base_versao: string; envio_id: number }>(
        "select situacao, base_versao::text, envio_id::int from estoque order by sku",
      );
      expect(e.rows).toHaveLength(2);
      expect(e.rows[0]!.situacao).toHaveLength(60); // cortada com "…", como antes
      expect(e.rows[0]!).toMatchObject({ base_versao: "2026-10-12", envio_id: 1 });
      const p = await db.query<{ origem_cadastro: string }>(
        "select origem_cadastro from produtos where sku = 'S1'",
      );
      expect(p.rows[0]!.origem_cadastro).toBe("cobertura");
    });

    it("a mesma linha de novo atualiza (não duplica)", async () => {
      await como(
        db,
        ADMIN,
        `select gravar_lote_cobertura(1, ${j([linhaEstoque(1, { estoque: 9 })])})`,
      );
      expect(await conta(db, "estoque where sku = 'S1' and estoque = 9")).toBe(1);
      expect(await conta(db, "estoque")).toBe(2);
    });

    it("linha inválida recusa o lote inteiro", async () => {
      for (const ruim of [
        { vmd: -1 },
        { preco: -2 },
        { custo: -3 },
        { bcps: "" },
        { sku: "x".repeat(41) },
        { estoque: null },
      ]) {
        const r = await como(
          db,
          ADMIN,
          `select gravar_lote_cobertura(1, ${j([linhaEstoque(10), linhaEstoque(11, ruim)])})`,
        );
        expect(erro(r)).toMatch(/Linha inválida/);
      }
      expect(await conta(db, "estoque where sku in ('S10','S11')")).toBe(0);
    });

    it("só admin; só envio de Cobertura em andamento; no máximo 5.000 linhas", async () => {
      const lote = j([linhaEstoque(20)]);
      expect(erro(await como(db, ACOMP, `select gravar_lote_cobertura(1, ${lote})`))).toMatch(
        /Só o admin/,
      );
      expect(erro(await como(db, GVO, `select gravar_lote_cobertura(1, ${lote})`))).toMatch(
        /Só o admin/,
      );
      expect(erro(await como(db, ADMIN, `select gravar_lote_cobertura(2, ${lote})`))).toMatch(
        /encerrado/,
      );
      expect(erro(await como(db, ADMIN, `select gravar_lote_cobertura(3, ${lote})`))).toMatch(
        /não encontrado/,
      );
      const grande = j(Array.from({ length: 5001 }, (_, i) => linhaEstoque(i)));
      expect(erro(await como(db, ADMIN, `select gravar_lote_cobertura(1, ${grande})`))).toMatch(
        /grande demais/,
      );
    });

    it("a função interna não pode ser chamada direto", async () => {
      expect(
        erro(await como(db, ADMIN, `select envio_cobertura_aberto(1, ${j([linhaEstoque(1)])})`)),
      ).toMatch(/permission denied/);
    });

    it("lote de 5.000 linhas grava inteiro", async () => {
      const lote = j(Array.from({ length: 5000 }, (_, i) => linhaEstoque(1000 + i)));
      expect(erro(await como(db, ADMIN, `select gravar_lote_cobertura(1, ${lote})`))).toBeNull();
      expect(await conta(db, "estoque")).toBe(5002);
    }, 60_000);
  });

  describe("Salvar simulação", () => {
    const kit = {
      codigo: "C15-0001",
      tema: "ela",
      nicho: "F",
      preco: 189.9,
      valor_cheio: 300,
      desconto_pct: 37,
      heroi_sku: "S1",
      composicao: "S1|S2",
      lojas: 1,
    };
    const item = {
      codigo: "C15-0001",
      ordem: 1,
      papel: "heroi",
      sku: "S1",
      descricao: "PERFUME X",
      preco_item: 120,
      promo_pct: 30,
    };
    const kitLoja = {
      codigo: "C15-0001",
      bcps: "L1",
      qtd: 3,
      custo: 80,
      margem: 109.9,
      valor_cheio: 300,
      desconto_pct: 37,
      reaproveitado: false,
      detalhes: [{ sku: "S1", estoque: 5 }],
    };
    const loja = {
      bcps: "L1",
      praca: "P1",
      vendedoras: 2,
      meta: 1000,
      meta_semana: 400,
      meta_vend_semana: null,
      metas_mes: { "2026-10": 1000 },
      sacolas_meta: 6,
      sacolas_possiveis: 8,
      sacolas_planejadas: 6,
      receita: 1139.4,
      custo: 480,
      pool_tamanho: 300,
      avisos: [],
    };

    it("admin grava as 4 partes", async () => {
      for (const [parte, linha] of [
        ["kits", kit],
        ["itens", item],
        ["kit_lojas", kitLoja],
        ["lojas", loja],
      ] as const) {
        const r = await como(
          db,
          ADMIN,
          `select gravar_parte_simulacao(1, '${parte}', ${j([linha])})`,
        );
        expect(erro(r)).toBeNull();
      }
      expect(await conta(db, "simulacao_kits where simulacao_id = 1")).toBe(1);
      expect(await conta(db, "simulacao_kit_itens where simulacao_id = 1")).toBe(1);
      expect(await conta(db, "simulacao_kit_lojas where simulacao_id = 1")).toBe(1);
      expect(await conta(db, "simulacao_lojas where simulacao_id = 1")).toBe(1);
    });

    it("validação: linha inválida, parte inexistente, simulação concluída, só admin", async () => {
      const casos: [string, string, RegExp][] = [
        [
          ADMIN,
          `select gravar_parte_simulacao(1, 'kits', ${j([{ ...kit, codigo: "K2", desconto_pct: 120 }])})`,
          /inválida/,
        ],
        [
          ADMIN,
          `select gravar_parte_simulacao(1, 'itens', ${j([{ ...item, ordem: 2, papel: "brinde" }])})`,
          /inválida/,
        ],
        [
          ADMIN,
          `select gravar_parte_simulacao(1, 'lojas', ${j([{ ...loja, bcps: "L2", avisos: "x" }])})`,
          /inválida/,
        ],
        [ADMIN, `select gravar_parte_simulacao(1, 'outra', ${j([kit])})`, /não existe/],
        [ADMIN, `select gravar_parte_simulacao(2, 'kits', ${j([kit])})`, /concluída/],
        [
          ACOMP,
          `select gravar_parte_simulacao(1, 'kits', ${j([{ ...kit, codigo: "K3" }])})`,
          /Só o admin/,
        ],
      ];
      for (const [uid, sql, msg] of casos) expect(erro(await como(db, uid, sql))).toMatch(msg);
    });
  });

  it("item 8: simulação que virou base não pode ser excluída (nem pelo banco)", async () => {
    await db.exec(`
      insert into planos (id,ciclo,vigente,nome,inicio,fim,simulacao_id) overriding system value
        values (10,15,false,'B','2099-01-01','2099-01-02',2);
    `);
    expect(erro(await como(db, ADMIN, "delete from simulacoes where id = 2"))).toMatch(
      /virou base/,
    );
    expect(erro(await como(db, ADMIN, "delete from simulacoes where id = 1"))).toBeNull();
  });
});
