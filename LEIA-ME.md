# Kit Sacola Surpresa → Claude Code + GitHub + Lovable

Passo a passo para o Matheus. Os passos 1 a 3 são feitos uma vez só.

## O que tem neste kit
| Arquivo | Para que serve | Vai para o GitHub? |
|---|---|---|
| `CLAUDE.md` | Regras para o Claude Code trabalhar no projeto | Sim |
| `ESPECIFICACAO.md` | Tudo que a aplicação deve fazer | Sim |
| `referencia/` | Código atual (lógica e design) | Sim (não tem dados) |
| `.gitignore` | Impede `.env`, CSV e XLSX de subir | Sim |
| `.env.example` | Modelo das variáveis, sem valores | Sim |
| `seed/` | Dados reais para teste (lojas, estoque, promoção, faturamento) | **Não** (bloqueado no `.gitignore`) |

## 1. Lovable: criar o projeto e conectar o GitHub
1. Em lovable.dev, crie um projeto novo. Na primeira mensagem, peça algo simples, como "Crie um projeto vazio chamado Sacola Surpresa com Lovable Cloud ativado".
2. **Project settings → Git → GitHub → Connect**. Autorize o Lovable no GitHub (botão "Install & Authorize"). O Lovable cria um repositório privado.
3. Copie o endereço do repositório (botão de clone nas configurações do GitHub do projeto).

## 2. Computador: preparar
1. Instale o **Git**, o **Node.js** (versão LTS) e o **Claude Code**.
2. Clone o repositório numa pasta, por exemplo `Documentos/sacola-surpresa`.
3. Copie para dentro dessa pasta **todo o conteúdo deste kit**, incluindo `seed/`.
   - Se já existir um `.gitignore` do Lovable, **não substitua**: peça ao Claude Code para juntar os dois.

## 3. Claude Code: primeira mensagem
Abra o Claude Code na pasta do repositório e cole:

> Leia o CLAUDE.md e o ESPECIFICACAO.md. Antes de escrever código:
> (1) confira se o .gitignore protege .env, seed/, CSV e XLSX, e se não há nenhum segredo já versionado;
> (2) me apresente o plano de construção em etapas (banco + RLS, login e acessos, upload das bases, motor de kits, telas admin, telas do gerente, exportação), dizendo o que você vai criar em cada uma;
> (3) liste as dúvidas sobre os itens PENDENTES que bloqueiam a etapa 1.
> Só comece a codar depois que eu aprovar o plano.

Depois disso, aprove etapa por etapa. Ao fim de cada uma, o Claude Code faz o commit e o push, e o Lovable sincroniza.

## 4. Lovable: conferir e publicar
- A pré-visualização do Lovable mostra a versão nova logo após o push.
- Os segredos (ex.: chave `service_role` para criar usuários) entram em **Lovable → Cloud → Secrets**. Nunca no código.
- Para os gerentes verem, clique em **Publish / Update** no Lovable.

## Cuidados
- Não edite o mesmo arquivo no Lovable e no Claude Code ao mesmo tempo. Se editar pelo Lovable, peça ao Claude Code `git pull` antes de continuar.
- O plano gratuito do Lovable tem limite de mensagens. Use o Lovable para conferir e ajustar detalhes, e o Claude Code para construir.
- Os dados reais entram **pela tela de Bases** da aplicação, nunca pelo GitHub.
