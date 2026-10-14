// Gera banco/script_banco_novo.sql: todas as migrações de drizzle/migrations (menos a 0000, que era
// só o teste de migração), na ordem, num script só para criar o banco do zero no Cloud da empresa.
// Uso: bun scripts/gerar-script-banco-novo.ts
// Rode de novo sempre que entrar migração nova, para o script continuar igual às migrações.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const raiz = join(import.meta.dirname, "..");
const pasta = join(raiz, "drizzle", "migrations");
const arquivos = readdirSync(pasta)
  .filter((f) => f.endsWith(".sql") && !f.startsWith("0000_"))
  .sort();

const partes = arquivos.map(
  (f) =>
    `-- ======================================================================\n` +
    `-- ${f}\n` +
    `-- ======================================================================\n` +
    readFileSync(join(pasta, f), "utf8").trimEnd() +
    "\n",
);

const cabecalho = `-- SCRIPT DO BANCO NOVO (gerado por scripts/gerar-script-banco-novo.ts — não editar à mão).
-- Cria o banco inteiro do zero, no SQL editor do Lovable Cloud de um projeto NOVO (vazio):
-- ${arquivos.length} migrações, de ${arquivos[0]} a ${arquivos.at(-1)}, na ordem.
-- Roda tudo numa transação: se der erro em qualquer ponto, nada fica gravado e dá para rodar de novo.
-- NÃO rodar no banco antigo (que já tem tudo isso).
-- Depois, confira com banco/conferencia_banco.sql (rodado no banco antigo e no novo).

begin;

`;

writeFileSync(
  join(raiz, "banco", "script_banco_novo.sql"),
  cabecalho + partes.join("\n") + "\ncommit;\n",
);
console.log(`banco/script_banco_novo.sql: ${arquivos.length} migrações.`);
