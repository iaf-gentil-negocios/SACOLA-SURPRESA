# CLAUDE.md — Sacola Surpresa (Gentil Negócios)

Instruções para o Claude Code trabalhar neste repositório. Leia também `ESPECIFICACAO.md` (regras de negócio, telas, banco) antes de escrever código.

## Contexto em 3 linhas
- Aplicação web da estratégia "Sacola Surpresa" da Gentil Negócios (franqueada Grupo Boticário): gera os kits (sacolas) por praça, divide a meta por ciclo/praça/loja/vendedora e entrega metas, simuladores e kits aos gerentes do comercial.
- Dono do produto: **Matheus** (setor de Projetos). Fale com ele em **português**, de forma direta.
- O repositório é **sincronizado com o Lovable** (duas vias, ramo `main`). O Lovable publica a aplicação.

## Regras de trabalho com o Matheus
- **Pergunte antes de agir** em qualquer coisa fora do que ele pediu (criar recursos, instalar serviços, mudar estrutura). Ele decide; você recomenda.
- **Nunca presuma regra de negócio.** Se algo não está em `ESPECIFICACAO.md` ou está marcado como **PENDENTE**, pergunte. Não invente valores.
- Seja crítico: se um pedido conflita com a especificação ou tem risco, diga antes de fazer.
- Ao terminar uma etapa, diga em poucas linhas o que mudou e o que ele deve conferir.

## Stack (compatível com Lovable — não trocar sem perguntar)
- **TanStack Start** (template Lovable `tanstack_start_ts_current`) + React + TypeScript + Tailwind + shadcn/ui. **Um único `package.json` na raiz**, sem monorepo.
  - Rotas por arquivo em `src/routes/` (ver `src/routes/README.md`); o layout raiz é `src/routes/__root.tsx`. `src/routeTree.gen.ts` é gerado — não editar.
  - Lógica com privilégio roda em **funções de servidor** do TanStack Start (`createServerFn`), não em Edge Functions.
    - Padrão: `src/lib/<área>/<nome>.functions.ts` (as chamadas, que o navegador importa) + `<nome>.server.ts` (o que usa `supabaseAdmin`), carregado **só** com `await import(...)` dentro do handler. A proteção de imports do TanStack bloqueia o navegador de importar qualquer coisa de uma pasta `server/` — não crie `src/server/`.
    - Cada handler começa com `requireSupabaseAuth` e, se for de admin, `exigirAdmin`. Erro de negócio volta como `{ ok: false, erro }` (tipo `Resultado` em `src/lib/resultado.ts`).
    - Depois do build, confira que nada de `supabaseAdmin`/`SUPABASE_SERVICE_ROLE_KEY` aparece em `.output/public`.
  - Rotas que dependem do login usam `ssr: false` (a sessão fica no navegador) e protegem a entrada em `beforeLoad` (`exigirSessao`, em `src/lib/auth/sessao.ts`). A segurança real é a RLS + as funções de servidor.
  - A `service_role` não existe no computador: funções de admin só funcionam no preview do Lovable.
  - Deploy pelo Lovable no **Cloudflare** (nitro). Não mexer em `vite.config.ts` além do que o comentário dele permite.
- Gerenciador de pacotes: **bun** (lockfile `bun.lock`). Não usar `npm install` (geraria `package-lock.json` divergente).
- Banco e login: **Supabase via Lovable Cloud** (Postgres + Auth + Row Level Security).
- Arquivos gerados pelo Lovable (não editar): `src/integrations/supabase/*`, `drizzle/schema.ts`, `src/routeTree.gen.ts`.
- Excel: `xlsx` (SheetJS). CSV: `papaparse`.

## Segredos — regra obrigatória
- **Chaves secretas nunca vão para o Git**: `service_role`, `sb_secret_…`, senhas, tokens e similares. Ficam só nos Secrets do Lovable Cloud e são lidas no servidor (`process.env`). Nunca no front-end, nunca em variável `VITE_*`, nunca em commit.
- O `.env` versionado pelo próprio Lovable é a exceção aceita: contém só ID do projeto, URL e **chave pública** (`sb_publishable_…`), que vão para o navegador de qualquer forma — a proteção é a RLS. Não acrescente nada secreto nele; qualquer outro `.env.*` fica fora do Git (`.gitignore`). `.env.example` tem só nomes de variáveis, sem valores.
- Dados de negócio (bases, metas, nomes, custos) **nunca** no código nem no Git. Eles entram pelo upload da aplicação e ficam no banco. A pasta `seed/` está no `.gitignore`.
- Antes de cada commit, confira com `git status` / `git diff --cached` que nenhum CSV, XLSX, `.env.*` ou chave secreta entrou.

## Segurança de acesso
- Toda tabela com dado de negócio tem **RLS ligada**. Gerente só lê as lojas do seu escopo (ver `ESPECIFICACAO.md` §4).
- **Custo e margem são só do admin**: ficam em tabelas que o gerente não consegue ler (não basta esconder na tela).
- Criar/alterar usuários exige `service_role` → fazer em **função de servidor** com o middleware `requireSupabaseAuth` (identifica quem chama), conferir que é admin e só então usar `supabaseAdmin` (`@/integrations/supabase/client.server`, importado dentro do handler). Nunca importar `client.server` em código que vai para o navegador.

## Git e Lovable
- **Um ramo por parte** (ex.: `feat/f2a-dashboards`). Junte no `main` quando build, lint e testes passarem; código que depende de SQL só entra no `main` depois que o Matheus confirmar que rodou o SQL. Confira o `git remote -v` (`matheus-genti/surprise-bag-creator`) antes de cada commit e push.
- Commits pequenos, mensagem em português dizendo o que mudou.
- Não reescreva histórico (`push --force`) — o Lovable pode divergir e perder alterações.
- Antes de começar, `git fetch` e confira se o `main` mudou (edições pelo Lovable); se mudou, traga para o ramo da parte.

## Banco local e SQL pendente
- **Os créditos do Lovable acabaram (10/10/2026): evite mudar o banco.** Se for indispensável, explique antes ao Matheus e entregue o SQL para ele aplicar pelo **SQL editor** do Cloud. O SQL fica em `drizzle/migrations/0002x_<nome>.sql` (ver abaixo), sem "drop"; `banco/pendente.sql` **só aponta** para o arquivo até o Matheus confirmar que aplicou.
- Atenção: SQL aplicado pelo SQL editor **não** gera arquivo em `drizzle/migrations` nem atualiza o `types.ts`.
- **Registro do SQL do SQL editor (decidido em 10/10/2026, parte B):** o SQL vai num arquivo `drizzle/migrations/NNNNa_<nome>.sql` (letra depois do número da última migração do Lovable, para ficar na ordem certa e não colidir com a próxima dele), **sem** entrada em `meta/_journal.json` nem snapshot — assim a ferramenta do drizzle/Lovable não tenta rodá-lo. O arquivo tem de poder rodar mais de uma vez sem efeito (`if not exists`, dados iniciais só quando a coluna é criada). `banco/pendente.sql` só aponta para ele até o Matheus confirmar que aplicou. É a única exceção à regra 1 abaixo.
- Colunas criadas pelo SQL editor não estão no `types.ts`: declare o tipo delas num lugar só (ex.: `src/lib/lojas/lojas.ts`) e leia com `select("*")` + conversão.
- Teste localmente com PGlite: `src/test/banco/banco-local.ts` aplica `drizzle/migrations/*.sql` + `banco/pendente.sql` (se tiver algo); os testes ficam em `src/test/banco/*.test.ts`.
- Dados de teste: os arquivos da `seed/` (locais, não versionados).

## Banco: fluxo de migrações (decidido em 08/10/2026)
O banco só muda pela ferramenta do Lovable. Ela salva a migração em `drizzle/migrations/` (SQL + `meta/`) e regenera `src/integrations/supabase/types.ts`. SQL enviado pelo Git **não** é aplicado sozinho.
1. **Não crie nem edite** nada em `drizzle/` (migrações, `meta/`, `schema.ts`), `drizzle.config.ts` nem `src/integrations/supabase/types.ts`.
2. (Na etapa 5.2 e depois.) Escreva o SQL e entregue ao Matheus **pronto para colar no chat do Lovable**, com a frase de instrução junto. Antes do SQL, mostre um resumo (tabelas e regras de acesso) para ele aprovar.
3. Para economizar mensagens do Lovable (plano gratuito), junte numa entrega só tudo o que a etapa precisa (tabelas, funções, RLS, GRANTs, dados iniciais).
4. Inclua os **GRANTs** explicitamente: o Lovable dá `GRANT ALL ... TO service_role`; os papéis `authenticated`/`anon` só recebem o que o SQL conceder (a RLS filtra as linhas por cima disso).
5. Depois que o Matheus avisar que o Lovable aplicou, faça `git pull`, confira que a migração salva é igual ao SQL entregue e só então use as tabelas novas (os tipos vêm do `types.ts` regenerado).
6. **Funções:** toda função nova leva `revoke all ... from public, anon` e `grant execute ... to authenticated` explícito (e `service_role` se o servidor precisar). **Nenhuma** função com execute para `anon`. Desde a etapa 1 o banco não dá mais EXECUTE automático a PUBLIC em funções novas — sem o grant, a função falha para o usuário logado. Funções usadas em policies: `security definer`, `stable`, `set search_path = ''`.
   - Exceções: funções chamadas **só pelo servidor** (`supabaseAdmin.rpc`, ex.: `finalizar_envio`) levam `grant execute ... to service_role` e **nenhum** grant para `authenticated`; funções de **gatilho** não levam grant.
7. **O Lovable bloqueia `drop table`** (e provavelmente outros comandos destrutivos). Não inclua `drop` nem nada que apague dados sem combinar antes com o Matheus; se for necessário, entregue em mensagem separada e explique o motivo.
8. **Pendências do banco:** a tabela `teste_migracao` continua no banco (vazia, RLS ligada e sem policy — nenhum usuário lê nem grava; sem permissão para `anon`) — removê-la só quando o Matheus decidir como.

## Como validar
- Modo local: `bun run local` (http://127.0.0.1:5190, modo "seed", admin sem login, dados da `seed/`). `?perfil=acompanhamento` na URL testa o perfil Acompanhamento (`?perfil=admin` volta); o botão "Área do gerente (teste local)" abre as telas do gerente com todas as lojas das bases definidas neste navegador.
- `bun run build` sem erro, `bun run lint` e `bun run test` antes de cada push.
- Teste a lógica de geração de kits com os arquivos de `seed/` (locais, não versionados) e compare com a referência `referencia/app_atual.js` (mesmas regras, salvo as mudanças marcadas em `ESPECIFICACAO.md`).
- Teste a RLS logando com um usuário de cada perfil (admin, GRVO, GCVO/GPVO) e confirmando que o gerente não vê lojas de fora do escopo nem custo/margem.
