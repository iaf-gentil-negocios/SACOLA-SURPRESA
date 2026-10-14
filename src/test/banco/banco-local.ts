// Banco local para testes (PGlite = Postgres em memória).
// Simula o que o Supabase tem (papéis anon/authenticated/service_role, auth.users,
// auth.uid()) e aplica: as migrações já aplicadas (drizzle/migrations, inclusive as do SQL editor)
// + o SQL pendente ainda não aplicado (banco/pendente.sql), se houver.
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(__dirname, "..", "..", "..");

const SUPABASE_SIMULADO = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  -- padrão do Supabase: objetos novos nascem liberados (a etapa 1 revoga para anon)
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  create schema auth; grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

/** SQL das migrações em ordem; com `antesDe`, só as de nome menor (ex.: "0002a" = até a 0002). */
export function sqlDasMigracoes(antesDe?: string): string[] {
  const pasta = join(RAIZ, "drizzle", "migrations");
  return readdirSync(pasta)
    .filter((f) => f.endsWith(".sql") && (!antesDe || f < antesDe))
    .sort()
    .map((f) => readFileSync(join(pasta, f), "utf8"));
}

/** SQL de uma migração pelo começo do nome do arquivo (ex.: "0002a_"). */
export function sqlDaMigracao(prefixo: string): string {
  const pasta = join(RAIZ, "drizzle", "migrations");
  const f = readdirSync(pasta).find((x) => x.startsWith(prefixo) && x.endsWith(".sql"));
  if (!f) throw new Error(`Migração ${prefixo} não encontrada.`);
  return readFileSync(join(pasta, f), "utf8");
}

export function sqlPendente(): string {
  return readFileSync(join(RAIZ, "banco", "pendente.sql"), "utf8");
}

export async function criarBancoLocal(opcoes: { pendente?: boolean; antesDe?: string } = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_SIMULADO);
  for (const sql of sqlDasMigracoes(opcoes.antesDe)) await db.exec(sql);
  // só comentários = nada pendente
  const pendente = sqlPendente();
  if (opcoes.pendente !== false && pendente.replace(/--.*$/gm, "").trim()) await db.exec(pendente);
  return db;
}

export type BancoLocal = Awaited<ReturnType<typeof criarBancoLocal>>;

/** Executa como um usuário logado (authenticated) ou anônimo (anon). */
export async function como<T = Record<string, unknown>>(
  db: BancoLocal,
  userId: string | null,
  sql: string,
): Promise<{ linhas: T[] } | { erro: string }> {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub', '${userId ?? ""}', false); set role ${userId ? "authenticated" : "anon"};`,
  );
  try {
    return { linhas: (await db.query<T>(sql)).rows };
  } catch (e) {
    return { erro: (e as Error).message };
  } finally {
    await db.exec("reset role;");
  }
}

export async function erroDe(db: BancoLocal, sql: string): Promise<string | null> {
  try {
    await db.exec(sql);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
