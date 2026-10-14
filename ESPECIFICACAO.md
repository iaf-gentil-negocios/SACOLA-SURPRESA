# Especificação — Aplicação Sacola Surpresa (v1 Lovable)

**Dono:** Matheus (Projetos, Gentil Negócios) · **Versão:** 10/10/2026
**Base desta especificação:** a aplicação HTML atual (`referencia/app_atual.js`), o registro do projeto e as decisões de 07–08/10/2026.
Itens marcados **PENDENTE** não estão decididos: pergunte ao Matheus antes de implementar a regra final; use o padrão indicado só como provisório e deixe-o configurável.

---

## 1. Objetivo

A estratégia "Sacola Surpresa" vende sacolas com desconto (preço final R$ 180–200) para ajudar a fechar o GAP de receita até 25/12/2026. Cada sacola tem um **herói** (produto à mostra, da promoção do ciclo) e **surpresas** ocultas (produtos com força, priorizando os parados). As vendas são feitas preferencialmente **fora da loja** e registradas no canal **App Delivery** do sistema da empresa (é assim que o resultado é medido; o canal também tem vendas que não são da Sacola — o "ruído" —, descontadas na conta, ver §8.8).

A aplicação tem duas áreas:
- **Admin** (Matheus e quem ele liberar): sobe as bases, define metas e regras, gera os kits, publica o plano e controla acessos.
- **Gerentes do comercial**: veem metas, simuladores e kits **só do seu escopo**, e exportam para Excel.

---

## 2. Glossário

| Termo | Significado |
|---|---|
| BCPS | Código da loja/centro (chave das lojas) |
| Praça | Agrupamento regional de lojas (8: Campina Grande, Litoral Norte, Mossoró, Natal, Oeste do Ceará, Oeste do Maranhão, RN Sul, São Luís) |
| Canal | Varejo ou Venda Direta. Loja **híbrida** aparece nos dois canais com o mesmo BCPS |
| HUB / galpão / ER | Centros de estoque. HUB e galpão somam estoque à praça onde ficam; ER desmembrado só se o admin ligar |
| GVO | Gerente de vendas operacional (nível loja) |
| GCVO / GPVO | Gerente de canal / praça (nível acima do GVO) |
| GRVO | Gerente acima do GCVO/GPVO (o Matheus o chama de gerente de praça; nos dados um GRVO cobre 1 a 3 praças) |
| VMD | Venda média diária (da planilha de cobertura) |
| Cobertura (dias) | Estoque ÷ VMD |
| Herói | Produto à mostra na sacola, sempre da promoção do ciclo |
| Surpresa | Produto oculto da sacola |
| Mimo | Produto fraco usado só para completar valor (máx. 1 por sacola) |
| Ciclo | C15: 16/10–01/11/2026 · C16: 02/11–29/11 · C17: 30/11–25/12 |

---

## 3. Perfis

| Perfil | Quem | Escopo | Pode |
|---|---|---|---|
| `admin` | Matheus + quem ele liberar | Tudo | Tudo: bases, metas, regras, gerar e publicar plano, acessos, ver custo e margem |
| `grvo` | Gerentes da coluna GRVO | Lojas onde ele é GRVO | Ver metas, simuladores, kits, exportar |
| `gcvo_gpvo` | Gerentes da coluna GCVO/GPVO | Lojas onde ele é GCVO/GPVO | Ver metas, simuladores, kits, exportar |
| `acompanhamento` | Time do Matheus (parte F2a) | Todas as lojas | Ver o dashboard do admin e as telas Dados gerais, Limites e metas, Kits, Lojas e Como funciona **só leitura**, com custo e margem. Sem Motor do Mix, Bases e Acessos; não simula nem altera nada |

- **Escopo pela hierarquia (parte C, 10/10/2026):** calculado na hora pela **matrícula** do usuário e pela hierarquia da dGerentes (§5.6), loja por loja: GVO vê as lojas onde é GVO, GCVO/GPVO onde é GCVO/GPVO, GRVO onde é GRVO; quem tem mais de um papel vê a **soma**. Não é uma lista fixa: mudou a hierarquia de uma loja, o acesso muda junto. A matrícula só identifica a pessoa — o número nunca define quem está acima. O escopo manual antigo (`perfis_lojas`) não vale mais.
- **Vê todas as lojas** (`perfis.ve_todas`, ligado pelo admin em Acessos): perfil de gerente que vê todas as lojas (diretoria — ex.: a Diretora Comercial). Continua sem custo, margem e telas de admin.
- Perfil `gerente` (parte C) para os usuários da hierarquia; `grvo` e `gcvo_gpvo` continuam valendo para quem já tinha (o escopo também vem da matrícula).
- Na dGerentes de 01/08/2026, nas 107 lojas Varejo/Híbrida (sem QDB): 36 pessoas — 29 GVO, 8 GCVO/GPVO e 4 GRVO (5 com dois papéis).
- Gerente **não** vê: custo, margem, força, curva, cobertura, estoque, regras do mix, outras praças/lojas.
- **Acompanhamento (parte F2a, 11/10/2026; SQL 0002e):** no banco só ganha leitura (policies de SELECT pela função `ve_dados_admin()` = admin ou acompanhamento ativo) nas tabelas do admin, menos `estoque` (não simula) e `acessos_log` (não vê Acessos); lê `perfis`. `lojas_de` dá todas as lojas. As funções de servidor continuam exigindo admin. Na tela, Motor/Bases/Acessos somem do menu (e redirecionam), e os botões de alterar somem (Limites com os campos travados; Kits sem Simular, Salvar, Definir como base e Divergências; Lojas sem marcar/desmarcar). Não usa "Ver como" nem a área do gerente.
- **PENDENTE:** perfil por canal dentro da praça (ex.: só o Varejo de uma praça). Hoje o escopo por lojas já cobre o que a base mostra; confirmar se haverá gerente que deva ver só um canal de uma loja híbrida.

---

## 4. Login, acessos e segurança

### 4.1 Login
- Tela de login com **usuário + senha** (não e-mail). Internamente, o usuário vira um e-mail técnico para o Supabase Auth (ex.: `<usuario>@sacola.gentilnegocios.com.br`) — ninguém digita nem vê esse e-mail; o login é só pelo nickname. (O Lovable Cloud recusa domínios reservados como `.local`.)
- Admin cria o usuário com **senha provisória**; no primeiro acesso o usuário é obrigado a trocar a senha.
  - **Padrão de usuário:** `nome.sobrenome` (primeiro e último nome), minúsculas e sem acento (ex.: `liane.seabra`). A tela sugere a partir do nome digitado; o admin pode editar. O usuário não muda depois de criado.
  - **Senha provisória:** gerada pelo sistema (10 caracteres), mostrada **uma única vez** ao admin, com botão de copiar.
  - **Regra de senha:** mínimo de 8 caracteres, com letra e número.
  - **Trava:** o sistema nunca fica sem admin ativo; o admin não pode se desativar nem tirar o próprio perfil de admin.
- Admin pode: criar, editar perfil/matrícula/"vê todas", redefinir senha, **desativar** (bloqueia login sem apagar histórico).
- **Criação em lote (parte C):** Acessos → "Criar usuários da hierarquia": uma linha por matrícula da hierarquia das lojas que participam e estão ativas (nome, papéis, nº de lojas, usuário sugerido `primeironome.ultimosobrenome` editável, "vê todas"). O admin revisa e digita a **senha padrão** (não é gravada no app nem registrada; vai só ao Supabase Auth). Troca obrigatória no primeiro acesso. Quem já tem usuário (pela matrícula ou pelo usuário) é pulado.
- **Ver como gerente (parte C):** Acessos → "Ver como": o admin vê as telas do gerente escolhido, **só leitura**, com o escopo dele (função `lojas_de`) e também as bases que ainda não começaram. Não registra acessos em nome do gerente e lê só as tabelas do gerente (sem custo nem margem). O gerente real continua sem ver nada antes do início da base.
- Criação/redefinição/desativação usam a `service_role` → **funções de servidor** do TanStack Start (`requireSupabaseAuth` + `supabaseAdmin`), que conferem se quem chama é admin antes de agir. (Decidido em 08/10/2026 no lugar da Edge Function `admin-usuarios`.)
- **Primeiro admin:** usuário `matheus` (`matheus@sacola.gentilnegocios.com.br` no Auth), criado na etapa 5.2 no Cloud e ligado em `perfis`. A senha é definida pelo Matheus na hora — nunca no código nem em chat.
  - Se for preciso uma **tela de primeiro acesso**: ela exige um **código de instalação** guardado nos Secrets do Lovable Cloud (conferido na função de servidor) e **se desliga sozinha** assim que existir um admin. Nada de tela aberta.
- **Etapa 2 — usuário desativado é bloqueado no login**, não só fica sem lojas: a desativação também bane o usuário no Supabase Auth (via `supabaseAdmin`), e a reativação desfaz o bloqueio. A RLS (`ativo = false` → sem lojas, `is_admin()` falso) continua como segunda barreira.

### 4.2 Registro de acessos
- Tabela `acessos_log`: `user_id`, `evento` (`login`, `logout`, `exportou_excel`, `abriu_kits`, `abriu_dashboard` — F2a: uma vez por abertura do dashboard, admin/acompanhamento ou gerente; o "Ver como" não registra), `detalhe` (json), `criado_em`.
- Insert feito pelo próprio usuário (RLS: só pode inserir linha com o próprio `user_id`); leitura só admin.
- Tela de Acessos mostra: lista de usuários (nome, usuário, perfil, escopo, ativo, último acesso) e histórico filtrável por pessoa e período.

### 4.3 RLS (obrigatório)
- Função `is_admin()` e função `lojas_do_usuario()` (retorna BCPS do escopo). Desde a parte C, `lojas_do_usuario()` = `lojas_de(auth.uid())`: admin ou "vê todas" → todas; senão, as lojas da matrícula em `gerentes_lojas`. `lojas_de(usuario)` só responde para o próprio usuário ou para o admin.
- Tabelas de plano publicado (metas, kits, itens, alocação por loja): gerente lê **só linhas cujo `bcps` está no seu escopo** (ou, para kits de praça, cujo kit tem alocação em loja do escopo).
- Tabelas com **custo/margem/força/estoque**: leitura só admin. O gerente recebe kits por uma tabela/visão **sem** essas colunas.
- Bases brutas: só admin.

---

## 5. Bases (upload pelo admin)

Tela **Bases**: um card por base, com data do último envio, quem enviou, nº de linhas e botão de upload. O upload valida colunas, mostra prévia e erros, e substitui a versão anterior. Guardar `base_versao` (data de referência do arquivo).

Arquivos de exemplo já tratados estão em `seed/` (não versionados). Use-os para testar.

**Etapa 3 — gravação:** o navegador lê e valida o arquivo e mostra a prévia, mas a gravação das bases (sobretudo as grandes, como a cobertura) passa por **função de servidor**, que confere se quem chama é admin e grava em lotes. Nada de inserção direta pelo navegador nas tabelas de base.

**Como ficou (etapa 3, 08/10/2026):**
- Cada envio vira uma linha em `bases_envios` (`em_andamento` → `concluido`, ou `abandonado` se falhar ou se outro envio da mesma base começar). Cada linha gravada leva o `envio_id`; ao concluir, a função `finalizar_envio` tira o que não veio no envio novo. Lojas nunca são apagadas: as que faltam ficam **inativas**. Produtos são **cumulativos** (não apaga).
- Ordem recomendada na tela: Lojas → Gerentes → Vendedoras → Produtos → Cobertura → Promoção → Histórico de vendas. Gerentes, vendedoras, cobertura e faturamento exigem lojas cadastradas.
- Layouts aceitos:

| Base | Arquivo original | Layout tratado (seed) |
|---|---|---|
| Lojas | dCentros (.xlsx): **todas** as linhas, de todos os tipos (§5.5); quem participa se escolhe na tela Lojas | `lojas.csv` |
| Gerentes | dGerentes (.xlsx) | `lojas.csv` (colunas de gerentes) |
| Vendedoras | lista com o código da filial (DIVISÃO) por vendedora | `bcps, vendedoras` (ex.: `lojas.csv`) |
| Produtos | dsku (.xlsx; aba com `codigo` e `fornecedor`; descrição na coluna B mesmo sem título) | `produtos.csv` |
| Cobertura | CSV `;` com vírgula decimal | `estoque_cobertura_*.csv` |
| Promoção | PROMO (.xlsx; com mais de um desconto, vale o **maior**) | `promo_ciclo15.csv` |
| Histórico de vendas | Histórico de Vendas (.xlsx diário, somado por loja e mês) | `faturamento_mensal.csv` |

- **Ajustes de 10/10/2026 (piloto):**
  - Upload mais rápido: o navegador filtra antes de enviar — cobertura só de lojas (Varejo/Híbrida e, desde a parte B, qualquer loja que participe), com estoque > 0 e de produtos BOT (SKU fora do cadastro entra se a 1ª palavra da descrição for de produto BOT); produtos (dsku) só fornecedor BOT. Lotes de 5.000 linhas, 3 em paralelo.
  - Texto longo demais é cortado com "…" (ex.: texto da promoção > 2.000 caracteres) em vez de recusar a linha.
  - CSV com vírgula ou ponto e vírgula, inclusive com 2 colunas (`bcps,vendedoras`); o erro mostra o cabeçalho esperado.
  - **Excluir base** (para subir outra): apaga os dados da base; **lojas não são apagadas, só inativadas**; vendedoras ficam 0. Simulações e bases já definidas não mudam.
- Regras aplicadas no upload (provisórias, marcadas na tabela `produtos`):
  - SKU da cobertura fora do dsku: entra em `produtos` com a descrição da cobertura; **fornecedor e marca pela primeira palavra da descrição**, usando o par mais comum no dsku para essa palavra (`origem_fornecedor = primeira_palavra`; sem par → `nao_encontrado`, marca = a própria palavra). `origem_cadastro = cobertura`.
  - **Regular** pelo texto da descrição (não regular se tiver PRM, AMOST, AMOSTRA ou MINI) quando a base não informa (`origem_regular = descricao`). Confere 100% com o `produtos.csv`.
  - **Nicho** (decidido em 09/10/2026), quando a base não informa: (1) subcategoria — FEMININ → F, MASCULIN → M, INFANT/KIDS/BABY → I; (2) marca nas listas `MARCA_F`/`MARCA_M` da referência; (3) BABY, KIDS ou INFANTIL na descrição → I; (4) senão U. A origem fica em `origem_nicho` (`base`, `subcategoria`, `marca`, `descricao`, `padrao_u`). Produto que veio só da cobertura (sem subcategoria) usa os passos 2 a 4. Confere com o nicho do `produtos.csv` em 87,5% dos produtos; a maior diferença é o seed marcar U em marcas da lista feminina, que a referência já corrigia na geração. **Futuro:** o admin corrigir o nicho por SKU.
  - **Preço R$ 0,00:** a linha é gravada; a exclusão do pool acontece na geração dos kits (parâmetro `preco_zero = excluir`). A prévia e o resultado mostram quantas linhas são.
  - Linhas de BCPS que não estão na base de lojas (ou, na cobertura, de lojas que não são Varejo/Híbrida e não participam) são ignoradas e listadas na prévia.
  - Gerentes: mês padrão = o mais recente **completo** (com pelo menos metade das linhas do maior mês); o admin pode escolher outro mês na prévia.

### 5.1 Cobertura (principal) — CSV `;`, decimal com vírgula, `∞` = infinito
Colunas: `SKU; Descrição; BCPS; Loja; Praça; Estado; Estoque; Custo; Preço de Venda; VMD; Cob. Dias; Cob. Meses; Situação`.
Uso: estoque por loja/HUB, custo, preço de venda, VMD. (~258 mil linhas.)
Seed: `seed/estoque_cobertura_2026-10-07.csv` (já normalizado: `bcps,sku,estoque,custo,preco,vmd,situacao`).

### 5.2 Produtos (cadastro dsku)
Colunas do arquivo original: `codigo, descricao, familia codigo, familia descricao, marca, categoria, subcategoria, mercado, custo, venda, ean, fornecedor`.
Uso: marca, categoria, subcategoria, fornecedor (filtrar **só BOT**).
Seed: `seed/produtos.csv` (só SKUs que estão na cobertura, com `nicho`, `regular` e `origem_fornecedor`).
- SKU da cobertura que não está no dsku: fornecedor e marca pela **primeira palavra da descrição** (mapeada pelo próprio dsku), marcado em `origem_fornecedor` (padrão provisório combinado em 08/10/2026).
- Nicho: regra do §5 acima (pendência 16, decidida em 09/10/2026).

### 5.3 Promoção do ciclo
Por SKU: `sku, desconto_pct, ressarcimento_bso, texto`. Uma base por ciclo (C15 disponível; C16 e C17 **PENDENTES** — o Matheus vai mandar).
Seed: `seed/promo_ciclo15.csv`.
Arquivo original (`PROMO C15 MAR - DESCONTOS.xlsx`): `Marca, SKU, Descrição, Categoria, Desconto Promoção Próximo Ciclo, Promoção Próximo Ciclo`. Quando a célula tem mais de um desconto (ex.: `35.0 | 25.0`) ou o SKU se repete, vale o **maior** desconto (decidido em 09/10/2026). Ressarcimento BSO = o texto da promoção diz “Ressarcimento via BSO”.

### 5.4 Histórico de vendas
Arquivo original (xlsx): `Praça, BPCS, Loja, Faturamento, Itens, Boletos, Boleto Médio, Produtividade, Sistemas, Fonte, Data` (diário por loja).
Uso: faturamento jul–set/2026 por loja (divisão da meta) e peso dos ciclos em 2025.
Seed: `seed/faturamento_mensal.csv` (`bcps, mes, faturamento, boletos`).

### 5.5 Lojas e HUBs (dCentros)
Seed: `seed/lojas.csv` — 107 lojas + HUBs/galpão/ERs (`tipo` = `loja` | `hub` | `er`), com praça, canais, vendedoras e gerentes.
- **Todas as lojas + participação (parte B, 10/10/2026)** — substitui o filtro fixo Varejo/Híbrida:
  - A dCentros traz **todas** as linhas com BCPS. Colunas usadas: `BCPS`, `Nome` (desde 12/10/2026 o nome da loja é o completo; o `Nome Abreviado` só se o `Nome` faltar), `Praça`, `Tipo`, `Marca`, `SAP` e `Centro de custo` (nome exato: `SAP_campo_antigo` e `Descrição centro de custo` não são usadas). Desde 12/10/2026 (0002f) também `UF` e a **cidade**, tirada do `Endereço` (a dCentros não tem coluna de cidade; na dCentros de 10/2026, 130 de 132 linhas reconhecidas). Endereço fora do padrão fica sem cidade e a prévia avisa.
  - **Tipo mostrado** (`tipo_dcentros`) = **exatamente a coluna Tipo** da dCentros: Varejo, Híbrida, Venda Direta, HUB, Escritório e Estoque (11/10/2026: sem as exceções ER e QDB — ER é Venda Direta e QDB é Varejo, como vêm no arquivo; a QDB se acha pelo filtro de **Marca**). Lojas gravadas antes como "ER"/"QDB" aparecem como Venda Direta/Varejo. Tipo técnico (`tipo`): Varejo/Híbrida → `loja`; HUB/Estoque → `hub`; Venda Direta e Escritório → `outro` (`er` só em dados antigos). Canais: Varejo → Varejo; Híbrida → Varejo e Venda Direta; Venda Direta → Venda Direta. **O motor não usa o tipo:** só "participa e ativa".
  - **Participa (sim/não):** ajuste geral do admin na tela **Lojas** (não depende de base nem de período). Só lojas que **participam e estão ativas** recebem kits e entram na divisão da meta. Na primeira vez (SQL da parte B), as lojas Varejo/Híbrida ativas começaram como "participa", menos as QDB. Loja nova numa dCentros futura entra como "não participa"; quem já existe mantém a escolha (o upload nunca grava "participa").
  - A cobertura é gravada para as lojas Varejo/Híbrida e qualquer loja que participe (se marcar uma loja depois, suba a cobertura de novo). A hierarquia de gerentes vale para todas as lojas cadastradas (parte C). Vendedoras continuam só para Varejo/Híbrida (a função do banco só grava `tipo = loja`).
  - O `lojas.csv` tratado continua aceito. Divisão e vendedoras não vêm da dCentros (ficam as que já estão no banco).
- Antes (manhã de 10/10/2026): coluna "Tipo" — Varejo e Híbrida = loja; os demais ficavam fora.
- Antes (09/10/2026) a base oficial era o `lojas.csv` tratado, com a lista montada à mão: Além das 107 lojas físicas: HUB Natal (23106), HUB Itapipoca (24583), HUB Mossoró (24115), HUB São Luís (24522), Galpão Golden (21425, `hub`, São Luís), ER São Gonçalo do Amarante RN (24666, `er`, Litoral Norte) e ER Nova Cruz (24892, `er`, RN Sul).
- Com o mix por loja (§7), só entram na geração dos kits as lojas que **participam** (por padrão, HUBs, estoque e ERs não participam).
- **Tela Lojas (admin):** todas as unidades da última dCentros (as que não vieram ficam inativas e só aparecem com "mostrar inativas"; nada é apagado). Filtros combináveis por nome, BCPS, SAP, centro de custo, **tipo** e **marca** (vários de cada), participa sim/não, "só com aviso" e "mostrar inativas"; botões "Marcar filtradas como participa" e "Desmarcar filtradas" e a caixa de cada loja, numa coluna presa à esquerda; total de lojas que participam. Tabela em 6 colunas (✓, Unidade com SAP e centro de custo, Tipo/Marca, Praça, Gerentes, Avisos), sem cortar colunas. **Avisos** (só em loja que participa e está ativa): "Sem gerente na dGerentes" (nenhum GVO, GCVO/GPVO ou GRVO) e "Sem usuário ativo no escopo" (nenhum gerente ativo tem a loja no escopo).
- **Impacto de mudar a participação:** vale para as próximas simulações. A meta do ciclo é dividida só entre as lojas que participam, pelo peso (faturamento ou vendedoras); praça com meta digitada mantém a meta. Simulações salvas e bases já definidas (o que o gerente vê) não mudam.

### 5.6 Gerentes por loja (dGerentes)
Arquivo original: `dGerentes_por_Lojas - Current view.xlsx`. **Usar só o mês mais recente** (hoje 01/08/2026).
Colunas usadas: `BCPS, DIVISÃO, LOJA, Canal Geral, Canal, Gerente de Núcleo, Nome Completo GVO, Matrícula GVO, Gerente de Canal/Praça, Nome completo GCVO/GPVO, Matrícula GCVO/GPVO, Gerente Regional, Nome completo GRVO, Matrícula GRVO`.
- Loja híbrida aparece em duas linhas (Varejo e Venda Direta), mesmo BCPS e mesmos gerentes.
- Linhas de BCPS que não estão na base de lojas são ignoradas.
- **Hierarquia (parte C):** o upload grava, para **todas as lojas cadastradas**, uma pessoa por nível (GVO, GCVO/GPVO, GRVO) com nome completo e matrícula (`gerentes` + `gerentes_lojas`), substituindo a anterior. A híbrida vem em duas linhas (uma por canal): se vierem gerentes diferentes, vale a primeira linha e a prévia avisa. Telefone e as outras colunas são ignorados. A tela Lojas mostra GVO, GCVO/GPVO e GRVO de cada loja. É essa hierarquia que define o acesso (§3).

### 5.7 Vendedoras
Quantidade de vendedoras por loja (hoje 332 em 107 lojas; São José do Campestre = 0). Já está em `seed/lojas.csv` (`vendedoras`).
Upload: CSV `bcps, vendedoras` (ou lista com um código de filial por vendedora — o código de filial é a coluna `DIVISÃO` da base de gerentes).

---

## 6. Modelo de dados (aprovado na etapa 1 em 08/10/2026)

- `ciclos` (id 15/16/17, nome, inicio, fim) — todos os usuários logados leem
- `lojas` (bcps PK, divisao, nome, praca, tipo `loja`|`hub`|`er`|`outro`, canal_geral, canais text[], vendedoras int, ativo; parte B: **participa** bool, tipo_dcentros, sap, centro_custo, marca) — gerente lê só o escopo
- `gerentes` (matricula PK, nome) e `gerentes_lojas` (matricula, bcps, nivel `grvo`|`gcvo_gpvo`|`gvo`) — escopo sugerido; admin
- `produtos` (sku PK, descricao, marca, categoria, subcategoria, nicho, regular, fornecedor, origem_fornecedor, preco_dsku) — **sem custo**; admin
- `estoque` (bcps, sku, estoque, vmd, preco, **custo**, situacao, base_versao) — admin. Estoque e custo ficam juntos: as duas seriam só admin, e o upload da cobertura grava uma vez.
- `promocoes` (ciclo, sku, desconto_pct, ressarcimento_bso, texto) — admin
- `faturamento_mensal` (bcps, mes, faturamento, boletos) — admin
- `parametros` (chave, valor jsonb) — meta total, divisão, faixas de preço/desconto, regras do mix, limites por praça; admin
- `bases_envios` (base, ciclo, versao_ref, linhas, enviado_por, enviado_em) — tela Bases; admin
- Plano publicado (versão congelada, ver §8.6):
  - `planos` (id, ciclo, **vigente**, criado_por, publicado_em) — um vigente por ciclo; ao publicar, o anterior deixa de ser vigente e fica como histórico. Gerente lê só o vigente.
  - `plano_parametros` (plano_id, parametros jsonb) — admin
  - `plano_metas` (plano_id, bcps, meta, vendedoras, meta_semana, meta_mes, meta_vend_semana, meta_vend_mes)
  - `plano_kits` (plano_id, kit_id, praca, tema, nicho, preco, valor_cheio, desconto_pct, qtd_praca)
  - `plano_kit_itens` (plano_id, kit_id, ordem, papel `heroi`|`surpresa`|`mimo`, sku, descricao, preco_item, promo_pct)
  - `plano_kit_lojas` (plano_id, kit_id, bcps, qtd)
  - `plano_kits_admin` (plano_id, kit_id, custo, margem, detalhes jsonb com força/cobertura/estoque) — admin
- `perfis` (user_id PK, usuario único, nome, perfil, ativo, troca_senha bool, matricula opcional — liga à hierarquia e define o escopo; parte C: `ve_todas` bool) e `perfis_lojas` (sem uso desde a parte C) (user_id, bcps, canal opcional — `varejo` | `venda_direta` | nulo). Por ora o escopo é **só por loja** e o `canal` fica nulo/ignorado (ver PENDENTE em §3).
- `acessos_log` (ver §4.2)
- `resumo_estoque_lojas` (parte F2a, SQL 0002e; só admin grava, admin e acompanhamento leem): uma linha por loja com a data da Cobertura (`ref`), SKUs, unidades, valor a custo, parados (SKUs e custo) e heróis disponíveis por ciclo (`herois` jsonb). Calculado no navegador do admin logo depois de cada Cobertura concluída (o arquivo já está na memória).
- F2b (SQL 0002j, §8.8): `ciclos.inicio_campanha`; `vendas_canal_dia` (loja, dia, GMV, boletos, itens), `vendas_envios` (período e total de cada envio), `ruido_lojas` (ciclo, loja, dia da semana, ruído) — admin grava, acompanhamento lê tudo, gerente lê o escopo; `declaracoes_vendas` (GVO declara, admin decide). `lojas.cidade`/`uf` (0002f) e `nome_completo` (0002i).

> **Mudança em discussão (09/10/2026):** com o mix por loja e o fluxo Simular → Salvar → Definir como base (§8), o modelo do plano publicado muda (simulações salvas, bases com período, kits com código por composição). A proposta está no §12 e só vira SQL depois de aprovada. Tudo o que o banco precisar das etapas 3, 4 e 5 vai num **único SQL**, aplicado na etapa 5.2 (`banco/pendente_etapa_5_2.sql`).

---

## 7. Regras de negócio

### 7.1 Ciclos e meta
- Meta total da estratégia até 25/12: **parâmetro do admin** (padrão provisório R$ 6.000.000; o Matheus define o valor real).
- Divisão entre ciclos (seleção do admin): (a) **peso de 2025** (padrão: 15,41% / 40,31% / 44,28% — recalcular do histórico: faturamento de 2025 nas mesmas datas de cada ciclo ÷ total das três janelas); (b) proporcional aos dias; (c) digitada por ciclo.
- Divisão entre praças e lojas: (a) **faturamento jul–set/2026** (padrão); (b) nº de vendedoras.
- Admin pode digitar a meta de uma praça; as lojas da praça seguem proporcionais.
- Métricas por praça/loja: meta do ciclo, por semana (dias/7), por mês (dias/30), por vendedora por semana e por mês, sacolas (meta ÷ preço médio da faixa), sacolas por vendedora por semana.
- **PENDENTE (canal):** loja híbrida não tem histórico separado por canal. Por ora a meta da loja **não é dividida** por canal; a loja aparece com a marca "Híbrida".

> **MUDOU em 09/10/2026: o mix é por unidade (loja), não por praça.** A transferência entre lojas é lenta e trava a estratégia. Cada loja monta os kits **só com o próprio estoque**: sem HUB, sem galpão, sem ER, sem transferência. Os itens marcados **PROPOSTA** aguardam aprovação do Matheus (etapa 4).

### 7.2 Força do produto (por loja)
- Calculada **dentro de cada loja**, pela **VMD do SKU na própria loja**.
- Ordena o pool da loja (§7.4) pela VMD: **Forte** = top 27%; **Média** = próximos 45%; **Fraca** = restante (parâmetros).
- Miniaturas e não regulares (PRM, AMOST, AMOSTRA, MINI) **nunca** são Forte (no máximo Média).
- **PROPOSTA:** SKU com VMD 0 é sempre Fraca, mesmo que a posição o colocasse em Média (sem venda não é força).
- A tela do gerente não mostra força.

### 7.3 Parado (por loja)
Cobertura da loja = estoque da loja ÷ VMD da loja. **Parado** = cobertura ≥ 180 dias (parâmetro). VMD 0 = cobertura infinita (parado).

### 7.4 Pool da loja
- Só o estoque da própria loja (tipo `loja`). HUB/galpão/ER não entram.
- Só fornecedor **BOT**. Só preço > 0 (preço R$ 0,00 fica fora, provisório). Estoque da loja ≥ 3 (parâmetro).
- **PENDENTE:** desativados como prioridade de surpresa (falta base/status oficial).

### 7.5 Herói
- **Só produtos da promoção do ciclo** (desconto > 0). Sem curva, **sem ordenação por desconto ou preço**: entre os elegíveis, a escolha é aleatória e quem limita são a faixa de preço e de desconto.
- Preço cheio ≥ R$ 99,90 (parâmetro), tamanho regular, **estoque da loja** ≥ 10 (parâmetro).
- O herói vale pelo menos 30% do valor cheio da sacola (parâmetro).
- O herói entra **sempre pelo preço promocional** e **não recebe o desconto do kit** (P1, 13/10/2026; o parâmetro "preço promocional no valor cheio" saiu). Sem promoção (ciclo sem base), entra pelo preço cheio, também sem desconto do kit.
- Ciclo sem base de promoção: herói sai dos produtos **Forte** da loja (provisório até chegar a base).

### 7.6 Surpresas
Ordem de preferência: (1) Forte e parado → (2) Média e parada → (3) Forte girando → (4) Média girando. Fraca só como **mimo** (máx. 1). Itens da mesma marca do herói têm preferência. Produtos em promoção no ciclo não entram como surpresa (parâmetro). Máx. 2 da mesma categoria. Cada SKU em até 6 kits **por loja** (parâmetro).

### 7.7 Temas
Presente para Ela · Presente para Ele · Infantil · Linha completa (≥ 3 itens da mesma marca) · Ritual de banho e corpo · Rotina de rosto e make · Cuidado com os cabelos. Regras de nicho/categoria de cada tema: ver `TEMAS` em `referencia/app_atual.js`. O nicho já vem resolvido do cadastro (§5.2); nicho "U" ainda é corrigido pela marca, como na referência.

### 7.8 Preço e desconto
- Preço final (o que o cliente paga) entre R$ 180 e R$ 200 (por praça, parâmetro), terminando em ,90, em degraus de R$ 5 (184,90 / 189,90 / 194,90 / 199,90).
- **Correção de 13/10/2026 (P1):** o desconto do kit vale **só para as surpresas** (e o mimo). Antes ele caía também sobre o herói, já com a promoção do Boticário.
  - **De** (valor cheio, riscado) = herói pelo preço promocional + surpresas pelo preço cheio.
  - **Por** (preço final) = herói pelo preço promocional + surpresas com o desconto do kit. Degrau e terminação são aplicados no **total do kit**, não item a item.
  - O **% off** mostrado no kit é o do kit todo (1 − por ÷ de).
- Desconto **sobre as surpresas** entre 20% e 50%, alvo 35% (parâmetros; desconto máximo pode ser por praça).
- Valor cheio da sacola, com herói H: entre H + (preço mín. − H) ÷ (1 − desc. mín.) e H + (preço máx. − H) ÷ (1 − desc. máx.).
- Bases e simulações salvas antes da correção não mudam: é preciso simular de novo.
- **Herói que não cabe** (correção de 13/10/2026): só concorre o herói cujo preço promocional deixa espaço, até o preço máximo e com o desconto máximo, para as (itens mínimo − 1) surpresas mais baratas da loja. Herói com preço promocional acima do preço máximo da sacola não é usado. Antes, o herói caro era sorteado de novo a cada tentativa e a loja ficava com poucos kits.
- Trava: a sacola nunca sai por menos que o custo dos itens (custo **da loja**).
- 3 a 6 itens por sacola. Combinações repetidas são descartadas (dentro da loja).

### 7.9 Quantidades (por loja)
- Sacolas da loja = meta da loja ÷ preço médio da faixa.
- Gera kits em rodadas (até 15 rodadas) até o estoque da loja cobrir as sacolas, com um limite de kits diferentes por loja (parâmetro; **PROPOSTA** de padrão no §12). Aloca as sacolas aos kits respeitando o estoque da loja.
- **Cobertura da meta:** por loja, mostrar quantas sacolas o estoque permite montar (sacolas possíveis) contra as sacolas da meta, e o % coberto.
- **Mesmo código para a mesma composição:** quando lojas diferentes têm kits com a mesma composição, o kit recebe o mesmo código. Formato do código e o que conta como "mesma composição": **PROPOSTA** no §12.

---

## 8. Telas do admin

Menu lateral: **Dados gerais · Limites e metas · Regras do mix · Kits · Lojas · Bases · Acessos · Como funciona**. Seletor de ciclo no menu. Design atual (verde-menta, cards, modo escuro) — ver `referencia/`.

1. **Dados gerais** (dashboard; parte F2a, refeito em 12/10/2026): números da **base atual** do ciclo do menu (sem atual, a próxima; sem nenhuma, só um aviso) — é o que os gerentes veem. O que depende de vendas mostra "aguardando vendas" até a F2b.
   - **Cards:** meta do ciclo (R$); meta de sacolas vendidas (soma das "sacolas da meta"); preço médio de uma sacola (receita planejada ÷ sacolas planejadas); margem média por sacola ((receita − custo) planejados ÷ sacolas planejadas, R$ e % sobre a receita); margem do ciclo = margem por sacola × meta de sacolas, "se a meta for batida" (depois das vendas, também a realizada).
   - **Meta × vendido:** duas barras grandes do total (R$ e sacolas, com valor, quantidade e %); "Expandir" mostra as duas barras por unidade, em ranking do maior para o menor % da meta em R$ (sem vendas: pela meta).
   - **Gráficos (aguardando vendas):** pizza da receita vendida por praça, velocímetro do % da meta do ciclo, mapa do Nordeste (um ponto por loja, cor pelo % da meta; cidade e UF já gravadas pela dCentros — tabela de municípios do IBGE dentro do app e lista das lojas não reconhecidas para corrigir, na F2b) e tabela de vendas por praça e unidade.
   - **Por praça e loja** (abre por praça; filtro, total no rodapé e Excel), num quadro só com dois grupos de colunas (ajuste de 12/10/2026): **Meta do ciclo** — receita, sacolas, margem (se a meta for batida), por vendedora (meta do ciclo ÷ vendedoras, em R$ e sacolas) e pode montar hoje; **Realizado** — sacolas vendidas e receita (aguardando vendas).
   - **Estoque por loja** (bloco recolhido): do resumo de estoque gravado a cada Cobertura (estoque a custo, unidades, parados, heróis disponíveis no ciclo).
   - **Saúde** (cada item abre a lista): lojas sem gerente (participam, sem ninguém na dGerentes); gerentes sem loja (usuários gerente/GRVO/GCVO ativos sem matrícula ou com matrícula fora da hierarquia de todas as lojas; "vê todas" não entra); bases desatualizadas. Aviso das lojas que não alcançam a meta por falta de estoque (sacolas planejadas < meta de sacolas).
   - As divergências de estoque ficam em Bases (depois da Cobertura) e em Kits (botão).
   - **Leitura:** uma linha por loja, já somada no banco (`resumo_lojas_da_base`, 0002f: sacolas, receita, custo e pode montar hoje) + `plano_metas`, o resumo de estoque e a hierarquia/perfis — dezenas de KB, guardados 5 min. Nada de kits, itens ou Cobertura.
2. **Limites e metas:** meta total + "Confirmar meta"; resumo dos 3 ciclos; abas por ciclo; cards por praça (meta editável, faixa de preço, desconto máx.; "ver metas detalhadas" com tabela por loja).
3. **Motor do Mix** (parte F1a, 11/10/2026; tela reorganizada no mesmo dia). Duas abas: **Sacola** e **Temas**. Tudo em `parametros` (sem SQL); vale para as próximas simulações — simulações salvas e bases definidas não mudam. Cada campo tem uma frase de explicação.
   - **Salvar (13/10/2026):** cada card tem os botões **Salvar** (grava só os campos daquele card) e **Descartar**, ativos só quando há alteração, com o aviso "Alterações não salvas"; no topo, "Salvar tudo".
   - **Aba Sacola, por parte da sacola:**
     - **Herói:** travas (preço cheio mínimo, % mínimo do valor cheio, estoque mínimo na loja; tema, tamanho regular e preço promocional sem desconto do kit fixos) + prioridade.
     - **Surpresas:** prioridade + máximo de mimos (VMD baixo só como mimo, fixo).
     - **Montagem:** itens mínimo e máximo, máximo da mesma categoria, estoque mínimo do SKU.
     - **Preço da sacola:** preço mínimo e máximo, degrau, terminação, desconto mínimo/máximo/alvo (sobre as surpresas, P1), nunca abaixo do custo.
     - **Por loja:** usos por SKU, máximo de kits, rodadas de geração e **Divisão** (catálogo comum, sem transferência — cada loja só recebe os kits que monta com o próprio estoque; meta por loja): **Unidade** (padrão), **Praça** ou **Regional** (lojas do mesmo GRVO; loja sem GRVO fica com catálogo próprio).
     - **Como classificamos os produtos** (vale para Herói e Surpresas, por posição na loja): VMD alto/médio/baixo = 27/45/28%; VMD 0 = baixo; cobertura alta ≥ 180 dias; valor (custo) e preço cheio em terços (sem custo = médio).
   - **Prioridade** (arrastando ou com ↑↓; comparação critério a critério, sorteio só no empate). Cada critério tem a chave **Usar / Não usar**: desligado não influencia nada (a posição fica guardada).
     - **1º item, fixo: Promoção do ciclo.** Herói: **obrigatória** (padrão; só produtos em promoção) / preferir (1º critério) / ignorar. Surpresas: **excluir** (padrão; produto em promoção não entra) / ignorar / preferir (1º critério). Quem já tinha salvo "promoção não entra como surpresa" desligado vira "ignorar".
     - **Ciclo sem base de promoção** (com a obrigatória): aviso na tela e em Kits, e o herói sai dos de VMD alto (automático; a opção de desligar saiu).
     - **Herói, ordem padrão:** preço cheio (maior primeiro) → VMD (maior primeiro) → cobertura (maior primeiro). Concorrem só os mais bem colocados; cada herói uma vez por loja antes de repetir. Tudo em "Não usar": sorteio entre os que passam nas travas.
     - **Surpresas, ordem padrão:** cobertura alta → VMD alto → VMD médio → valor baixo → valor alto → valor médio. A marca do herói continua com preferência. Tudo em "Não usar": só a marca do herói e o sorteio decidem.
     - Comparação na seed (C15, média de 5 sementes): motor de antes da F1a em Unidade 4.884,6 sacolas planejadas e margem R$ 412,1 mil (em Praça, 4.885,6 e R$ 425,6 mil); padrão atual em Unidade 4.892,0 e R$ 422,2 mil. A reorganização da tela não mudou o resultado (igual ao `9a770fb`).
   - **Aba Temas:** os 7 fixos (liga/desliga) + **meus temas** (nome + até 4 categorias marcadas na lista das categorias da base de Produtos). Ao lado de cada categoria e de cada tema: produtos e **heróis possíveis** no ciclo do menu — teto, sem estoque: regular, fora de Infantil, preço do dsku ≥ mínimo do herói e, com a promoção obrigatória e base no ciclo, na promoção. Aviso quando o tema não tem nenhum herói possível. Regra dos meus temas = Banho e Rosto (herói de uma das categorias, fora Infantil; surpresas das categorias, do mesmo nicho do herói ou "U"). O kit guarda o **nome** do tema.
   - **Leitura do banco:** o navegador do admin guarda estoque, produtos e promoção na memória enquanto o app está aberto e só baixa de novo o que mudou (Cobertura/dsku nova ou excluída, promoção nova do ciclo, lojas ainda não lidas).
4. **Kits:** **simular** (gerar) kits; lista com filtros praça/loja/tema; card com itens e dados completos (inclui força, cobertura, estoque, custo, margem — só admin); cobertura da meta por loja (sacolas possíveis × sacolas da meta).
   - **Divergências de estoque e troca de kits por loja (parte F1b, 11/10/2026; SQL 0002d).** A base só muda quando o admin decide.
     - **Análise (no navegador):** para a base atual do ciclo (ou a próxima, se não houver atual), cada loja compara o estoque de hoje (o da simulação) com a **geração dos kits** (estoque de cada item gravado na base) e com o **dia anterior** (foto da Cobertura anterior; existe a partir da 2ª Cobertura depois do SQL). 🔴 **Divergente** (já vem selecionada): a capacidade de montar os kits atuais da loja (todos juntos, dividindo os produtos) cai ≥ 30% **e** pelo menos 3 kits. 🟡 **Atenção** (não vem selecionada): o estoque dos produtos usados nos kits cai ≥ 30%. Também: "capacidade abaixo do que falta da meta" (até a parte de vendas = meta inteira da loja na base) e "heróis novos fora dos kits" (só informação). Limites ajustáveis no Motor do Mix → Por loja.
     - **Quando abre (ajuste de 12/10/2026):** em **Bases**, logo depois de concluir o envio da Cobertura — com o arquivo que já está na memória (a Cobertura não é baixada de novo) e depois de gravar a disponibilidade do dia. Com alguma loja 🔴/🟡 a tela abre; sem nenhuma, só um aviso "Nenhuma divergência em N lojas" com o botão "Ver análise". Em **Kits**, só pelo botão "Divergências de estoque" (não abre mais depois de simular); usa o estoque que já estiver na memória e, sem ele, lê uma vez, como uma simulação. Analisa a **base atual**; sem atual, a próxima. Com bases em andamento em mais de um ciclo, começa pela do ciclo do menu (ou pela que tem divergência) e o topo da tela tem um seletor de base.
     - **Tela de divergências:** lista por loja com motivo e números (geração → anterior → hoje); detalhe por produto (o que caiu e o que não caiu) e por kit (pode montar hoje); seleção: divergências / todas / manual / nenhuma; botões **Gerar kits** e **Ignorar**; e "Gravar disponibilidade de hoje".
     - **Gerar kits (lojas selecionadas):** fica todo kit que monta pelo menos 1 (mesmo código), com a quantidade planejada reduzida ao que o estoque permite; os indisponíveis saem e são **apagados na hora** (sem histórico); os kits novos usam só o estoque que sobra depois de reservar a capacidade dos que ficaram (ela não cai) e cobrem o que falta da meta; composição igual à de outra loja da base usa o mesmo código, senão código novo. Lojas não selecionadas não mudam. Uma chamada ao banco por loja (`regerar_kits_loja`, só admin, tudo ou nada). A base ganha uma nova "versão dos kits" e o gerente relê a base quando ela muda (em até 10 min, ou ao recarregar).
     - **Disponibilidade diária:** depois de cada Cobertura concluída na tela Bases, o navegador do admin calcula, para as bases que ainda não acabaram, "pode montar N" de cada kit (menor estoque entre os itens; 0 = indisponível) e a **capacidade total** de cada loja, e grava só esse resumo e a foto do estoque dos produtos dos kits (`gravar_disponibilidade`; a foto de hoje vira a do dia anterior na Cobertura seguinte). Nada da Cobertura inteira é copiado.
5. **Bases** (parte D, 10/10/2026): duas listas separadas por uma linha — **fixas** em cima, **variáveis** embaixo. Cada card (pequeno, em fileira) mostra o nome e uma frase do conteúdo e tem um botão para mudar de lista; a escolha fica salva (`parametros.bases_classificacao`, só admin). Divisão inicial: só a Cobertura é variável. Ao abrir o card: linhas, última atualização, quem subiu, prévia das 5 primeiras linhas gravadas e as ações (enviar arquivo, **colar do Excel**, excluir). Colar do Excel: o texto copiado com cabeçalho passa pelo mesmo leitor, validação e prévia do upload e substitui a base; para a Cobertura a tela recomenda o arquivo. **Aviso:** base variável sem envio concluído há mais de 24 h (ou sem envio) fica marcada no card e numa faixa amarela no topo de todas as telas do admin (promoção variável: vale o ciclo escolhido no menu).
6. **Acessos:** usuários, perfis, escopos (sugeridos pela base de gerentes, editáveis), ativar/desativar, redefinir senha; histórico de acessos.
7. **Simular → Salvar → Definir como base** (MUDOU em 09/10/2026, substitui o "Publicar plano"):
   - **Simulação:** o admin gera quantas quiser. Não salva sozinha e nunca altera nada que já foi salvo.
   - **Salvar:** guarda a simulação com nome, data e parâmetros, para comparar ou reaproveitar. Só o admin vê.
   - **Definir como base:** uma simulação salva vira a **base de um período** (data de início e fim **livres** desde 11/10/2026, SQL 0002c: fora do ciclo só gera aviso; bloqueia fim antes do início e sobreposição com outra base do mesmo ciclo; início hoje ou antes = os gerentes já veem), porque o Matheus vai sugerir mixes diários ou semanais. Só a base é vista pelos gerentes (versão congelada).
   - O gerente vê a **base atual** e consulta as anteriores em **Histórico**.

---

8. **Vendas do canal App Delivery** (parte F2b, 12/10/2026; SQL 0002j). O canal também tem vendas que não são da Sacola: o ruído é descontado.
   - **Arquivo:** relatório Gerencial de Vendas, **só** o export com "Quebrar Por Data" (uma linha por loja e dia; o export sem data traz o total do período inteiro e é recusado). Valor da venda = **GMV** (já sem as trocas); boletos e itens (boletos × itens por boleto) também são guardados. Enviado em **Bases** (arquivo ou colar do Excel), lido no navegador: o banco guarda só o resumo por loja e dia (`vendas_canal_dia`). O período do arquivo (editável na prévia; padrão = primeira e última data) **substitui** o que havia nesses dias: dia sem linha e loja que não aparece = venda 0. O mesmo export serve de histórico. BCPS fora do cadastro é ignorado e listado.
   - **Aviso de arquivo suspeito** (na prévia, não bloqueia): média diária do arquivo mais de 5× a média do histórico do canal (120 dias antes) ou muitas lojas com venda que nunca venderam no canal (≥ 5 e > 30% das lojas com venda) — sinal de outro canal (ou nenhum) selecionado. A prévia mostra total, boletos, lojas, dias e período.
   - **Início da campanha** por ciclo (Limites e metas; vazio = início do ciclo). **Período das vendas** = do início da campanha até o fim do ciclo.
   - **Ruído** por loja e dia da semana = mediana das vendas do canal nas 8 semanas (56 dias) antes do início da campanha, só nos dias cobertos por algum envio (dia coberto sem linha = 0). Antes da mediana saem os **outliers** do histórico pela regra de Tukey: dias acima de Q3 + 1,5 × (Q3 − Q1), com os quartis dos 56 dias da loja. Durante a campanha nada é tirado (pode ser Sacola). Loja sem histórico no canal (ou nova no canal) = ruído 0. Recalculado no navegador do admin a cada envio de vendas e a cada mudança do início da campanha; o banco guarda só o resultado (`ruido_lojas`).
   - **Venda da Sacola estimada** = venda do canal − ruído do dia da semana (nunca abaixo de 0). **Sacolas vendidas** = R$ estimado ÷ preço médio dos kits da loja (receita ÷ sacolas planejadas, ou seja, ponderado pelas quantidades planejadas).
   - **Declaração do gerente:** feita **só pelo GVO da loja** (GCVO/GPVO, GRVO e "vê todas" só veem), por dia ou por semana (7 dias), com a quantidade de sacolas; não pode ser de período que ainda não começou nem repetir loja e período (recusada não conta). O admin aprova ou recusa (com motivo opcional); o GVO pode apagar a própria enquanto pendente. Estimativa = sacolas × preço médio dos kits da praça (calculado pelo banco na base do período). Desvio % = (declarado − sistema) ÷ sistema. O valor oficial é o do sistema.
   - **Check 2 (venda confirmada): fora** — o arquivo não traz cupom nem itens. Os kits trocados na F1b continuam sendo apagados.
   - **Dashboards** (admin, Acompanhamento e Painel do gerente, cada um no seu escopo): barras meta × vendido (R$ e sacolas, com ranking por unidade), quadro Realizado da tabela (sacolas vendidas e receita, com %), pizza da receita vendida por praça (ou por loja, quando o escopo tem uma praça), velocímetro do % da meta do ciclo, **mapa do Nordeste** (um ponto por cidade, cor pelo % da meta: ≥ 100%, 80–99%, < 80%, sem venda; tabela pública de municípios do IBGE dentro do app, `src/lib/mapa/nordeste-dados.ts`; lojas não reconhecidas listadas — o admin corrige cidade e UF ali), tabela de vendas por praça e unidade (venda do canal, ruído, venda da Sacola, sacolas, boletos, % da meta). **Mapa (P3, 13/10/2026; SQL 0002k):** mapa de calor **por município** (malha pública do IBGE, qualidade mínima, CE/RN/PB/MA, dentro do app: `src/lib/mapa/municipios-dados.ts`, gerado por `scripts/gerar-mapa-municipios.ts`), menor que o anterior, no estilo do INMET: cor contínua de azul (0%) a vermelho (≥ 100% da meta), legenda com a escala; município sem loja, sem venda ou com cidade não reconhecida em cinza. Clicar num estado dá zoom; "Visão geral" volta. **Quem vê:** lista única em `src/lib/mapa/acesso.ts` — admin, Acompanhamento, diretoria ("vê todas"), GCVO/GPVO e GRVO; o **GVO não vê** (quem tem também outro nível da lista vê). Os níveis do gerente logado vêm da função `meus_niveis()` (0002k), margem realizada (margem por sacola × sacolas vendidas). No admin: bloco de declarações (pendentes, aprovar/recusar, declarado × sistema). No Painel do gerente: as declarações do escopo e o formulário do GVO.
   - **Leitura:** vendas por loja e dia do período da campanha (dezenas a poucos milhares de linhas curtas), o ruído do ciclo e as datas dos envios; cache de 5 min.

## 9. Telas do gerente

Cabeçalho: nome, perfil, escopo (praças/lojas), ciclo, **base atual** (período) e acesso ao **Histórico** de bases anteriores.

0. **Painel** (parte F2a, refeito em 12/10/2026; primeira tela): a mesma estrutura de Dados gerais, só com as lojas do escopo e **sem custo nem margem**. Cards: meta do ciclo, meta do mês, meta de sacolas vendidas (com sacolas por vendedora/semana) e preço médio de uma sacola. Barras meta × vendido (total e por unidade), gráficos aguardando vendas (a pizza é por loja quando o escopo tem uma praça só) e a tabela Meta do ciclo | Realizado por praça e loja (Meta: receita, sacolas, por vendedora no ciclo e pode montar hoje; Realizado: sacolas vendidas e receita). Filtro por praça e por mês. **Leitura:** uma linha por loja do escopo (`resumo_lojas_da_base`, o banco não entrega custo ao gerente) + metas; os kits só são baixados em Kits ou no Simulador por kits.
1. **Metas** (P2, 13/10/2026): duas tabelas, **Meta do mês** (a parte do ciclo no mês escolhido) e **Meta do ciclo**, com as colunas Receita | Sacolas | Qtd. vendedoras | Receita por vendedora | Sacolas por vendedora, e cada uma com o seu **Realizado** (receita, sacolas e % da meta; mês contra as vendas do mês dentro da campanha, ciclo contra a campanha toda). Sem quebra por canal. Vendedoras = as da base definida; sacolas por vendedora **sempre para cima** (também no Painel e no dashboard). Filtro por praça e por mês. Lê o mesmo resumo do Painel (sem kits).
   - Antes (em `/gerente/metas` desde a F2a): a meta é definida por ciclo, mas o gerente vê a **meta mensal**, porque o comercial acompanha por mês. **PROPOSTA (aguardando confirmação):** ciclo que cruza meses tem a meta dividida entre os meses proporcionalmente aos dias (ver §12). Cards (meta do mês, por semana, por vendedora/semana e /mês, vendedoras, lojas) + tabela por loja. Se o escopo tem mais de uma praça, filtro por praça.
2. **Simulador por vendas:** entradas: vendas por vendedora por semana, vendedoras vendendo, preço médio da sacola → receita, sacolas, % da meta, quanto falta/sobra, vendas necessárias por vendedora/semana. Também por loja (estimativa por loja → receita e % da meta; cores verde ≥ 100%, amarelo ≥ 80%, vermelho < 80%).
3. **Simulador por kits (P4, 13/10/2026; SQL 0002k):** **uma loja por vez** (filtro de loja; praça quando o escopo tem mais de uma). O que dá para montar fica **limitado pelo estoque da loja** da última Cobertura (a foto do estoque dos produtos dos kits, `base_lojas_estoque`, gravada a cada Cobertura para as bases em andamento — sem custo; o gerente lê só as lojas do escopo). O estoque é **compartilhado**: as linhas são atendidas na ordem da tela e cada kit montado desconta 1 de cada item do saldo. Lido uma vez por base; as contas rodam no navegador. A tela mostra só quantos kits dá para montar, quantos ainda daria e **qual item limita** — nunca a quantidade em estoque. Receita e % da meta usam o que dá para montar. Sem foto para a loja (base definida depois da última Cobertura), aviso e sem limite.
   - Antes: o gerente escolhe **qualquer kit** do seu escopo e digita **qualquer quantidade** (sem limite de estoque) → receita por kit, receita total, % da meta. Pode adicionar várias linhas.
4. **Kits:** cards **compactos** (código, tema, herói, preço, valor cheio, % off, quantidade no escopo). Ao abrir: lista dos produtos do kit (papel herói/surpresa/mimo, SKU, descrição, quantidade 1) e quantidade por loja. **Sem** força, curva, cobertura, estoque, custo ou margem. Filtro por praça/loja/tema.
5. **Exportar Excel:** kits do escopo com uma linha por item (`Praça, Loja, Kit, Tema, Preço, Valor cheio, Desconto %, Qtd na loja, Papel, SKU, Produto, Preço do item`) + aba de metas por loja. Registrar `exportou_excel` em `acessos_log`.

Tudo responsivo (o gerente pode abrir no celular).

---

## 9.1 Como ficou a área do gerente (etapa 6, 10/10/2026)
- **Kits (F1b):** cada kit mostra "pode montar N hoje" ou "indisponível hoje" (estoque da última Cobertura), também por loja ao abrir o kit, e o topo mostra a capacidade total de cada loja ("os kits dividem produtos; no total dá para montar X"). O Excel ganhou a coluna "Pode montar hoje".
- Cabeçalho com a **base**: a atual (período contém hoje; senão a mais recente já iniciada) e as anteriores em "Histórico", no mesmo seletor.
- **Metas:** cards e tabela por loja com a meta **mensal** (a parte do ciclo em cada mês), do ciclo, por semana e por vendedora. Filtro por praça quando o escopo tem mais de uma.
- **Simulador por vendas** e **por kits** (kits disponíveis no escopo, qualquer quantidade); **Kits** em cards compactos com produtos e quantidade por loja; **Exportar Excel** (abas Kits e Metas). Registra `abriu_kits` e `exportou_excel`.

---

## 10. Pendências (perguntar ao Matheus)

1. Valor real da meta da estratégia.
2. Divisão da meta das lojas híbridas entre Varejo e Venda Direta.
3. Perfil por canal dentro da praça (além do escopo por lojas).
4. Percentuais de Forte/Média/Fraca pela VMD **da loja** (padrão 27/45/28, confirmado em 09/10/2026 para o mix por loja).
5. Produtos com preço R$ 0,00: excluir (padrão) ou usar preço do dsku.
6. Desativados: fonte oficial do status.
7. Fornecedor pela descrição para SKUs fora do dsku.
8. Bases de promoção do C16 e C17 e layout do arquivo original de promoção.
9. ~~Como o Lovable Cloud aplica migrações vindas do GitHub~~ **Resolvido (08/10/2026):** o banco só muda pelo chat do Lovable (migrações em `drizzle/migrations/`); o Claude Code entrega o SQL pronto para colar. Ver CLAUDE.md, "Banco: fluxo de migrações".
10. ~~Importar as vendas do canal para a tela de realizado × meta~~ **Feito na parte F2b (12/10/2026), canal App Delivery: §8.8.**
11. **Verificação de senhas vazadas** (Supabase Auth, "leaked password protection") ficou **desligada** na etapa 1. Decidir se liga (pode depender do plano do Lovable Cloud).
12. Tabela `teste_migracao` (do teste de 08/10/2026) continua no banco, vazia e trancada: o Lovable bloqueou o `drop table`. Decidir se e como remover.
13. **Saída automática por inatividade**: não implementada na etapa 2 (a sessão fica aberta até a pessoa sair). Decidir se e com qual tempo.
14. ~~Trava "sempre um admin ativo" só nas funções de servidor~~ **Resolvido na etapa 3:** gatilho `perfis_trava_admin` no banco.
15. ~~Lojas a partir do dCentros~~ **Resolvido (09/10/2026):** não há regra; a base oficial é o `lojas.csv` tratado (§5.5).
16. ~~Nicho~~ **Resolvido (09/10/2026):** regra no §5. Futuro: o admin corrigir o nicho por SKU.
17. ~~Promoção com mais de um desconto~~ **Resolvido (09/10/2026):** vale o maior (§5.3).
18. **Ressarcimento BSO no arquivo original de promoção:** quando o SKU se repete, o BSO segue a linha de maior desconto. No PROMO C15 isso dá 448 SKUs com BSO, mas 621 linhas mencionam BSO. Confirmar se basta qualquer linha do SKU mencionar BSO.
19. Perguntas da etapa 4 (motor por loja, simulação e base): ver §12.
20. **Economia de créditos — depois do piloto, só se o consumo continuar alto** (decidido em 11/10/2026):
    - **(7)** Função no banco que devolve a base inteira do escopo do gerente numa chamada só (no lugar de 7 consultas com RLS linha a linha). Ganho médio; risco médio (função nova com regra de acesso própria); precisa de SQL.
    - **(8)** RLS dos kits/itens: checar "base já começou" uma vez, e não linha a linha. Ganho baixo a médio; risco médio (mexe em regra de acesso); precisa de SQL.
    - **Revisão de consumo (12/10/2026), itens 1 a 7:** (1) regras de acesso calculam is_admin/ve_dados_admin/usuario_ativo uma vez por consulta, e não por linha (SQL 0002g); (2) disponibilidade depois da Cobertura lê os kits "leve" (sem o estoque da geração nem fotos); (3) só bases em andamento (a futura é calculada na Cobertura do dia em que começa); (4) produtos do motor: cadastro BOT paginado na 1ª leitura da sessão, no lugar de ~50 grupos de 300 SKUs; (5) só as colunas usadas em lojas, perfis, planos e kits por loja; (6) hierarquia/perfis num cache só (Lojas e Dados gerais) e Bases reaproveita a leitura de lojas da tela Lojas; (7) gerente: metas, lojas e ciclo lidos uma vez para Painel, Kits e Simulador. Decidido em 12/10/2026: (8) botão "Excluir simulação" (só as que não viraram base, com confirmação; nada é apagado sozinho) e (9) Cobertura e "Salvar simulação" gravados direto no banco por função só do admin. **Depois do piloto:** (10) gravar na Cobertura só as linhas que mudaram (função com `is distinct from` e outro controle no lugar do `envio_id`; risco médio a alto) e (11) estoque compactado por loja para simular (função que devolve o estoque em jsonb por loja; corta ~metade do tráfego).
    - Já feito em 11/10/2026 (sem SQL): o que já foi lido vale 5 min e não é relido ao voltar para a aba/app; a base definida do gerente é lida uma vez por página aberta (é congelada); a lista de bases do gerente vale 10 min; a faixa de bases desatualizadas lê só as colunas necessárias; a sessão relê o perfil a cada 5 min (antes 30 s); a lista de usuários em Acessos só é relida depois de uma alteração. Não faremos: servir a casca da página sem o Worker (mexe na configuração do Lovable).

---

## 11. Referências no repositório
- `referencia/app_atual.js` — lógica atual (geração de kits, metas, simuladores). Já tem as mudanças de 08/10 (herói só promoção, sem curva). Ainda monta o mix **por praça** com HUB e força da "rede" — as regras novas (por loja) são as do §7.
- `referencia/app_head.html`, `referencia/app_body.html` — layout e design atuais.
- `seed/` — dados de teste (NÃO versionar).

---

## 12. Proposta da etapa 4 — motor por loja, simulação e base (09/10/2026, AGUARDANDO APROVAÇÃO)

### 12.1 Motor, passo a passo (por loja)
Para cada loja (tipo `loja`) do ciclo escolhido:

1. **Meta da loja:** meta do ciclo (§7.1) × peso da loja (faturamento jul–set/2026 ou vendedoras). Se o admin digitou a meta da praça, as lojas da praça seguem proporcionais. **Sacolas da meta** = meta da loja ÷ preço médio da faixa da praça, arredondado para cima.
2. **Pool da loja:** SKUs com estoque na loja ≥ 3, fornecedor BOT, preço > 0. Nada de HUB, galpão, ER ou outra loja.
3. **Força:** ordena o pool pela VMD da loja → top 27% Forte, 45% Média, resto Fraca. Não regular nunca é Forte. VMD 0 é sempre Fraca (proposta).
4. **Parado:** estoque da loja ÷ VMD da loja ≥ 180 dias (VMD 0 = parado).
5. **Faixas** (vêm da praça da loja): preço final R$ 180–200, desconto 20–50% (alvo 35%), valor cheio entre preço mín. ÷ (1 − desc. mín.) e preço máx. ÷ (1 − desc. máx.).
6. **Herói:** sorteado entre os SKUs da promoção do ciclo (desconto > 0) que cabem no tema, regulares, preço cheio ≥ R$ 99,90 e estoque da loja ≥ 10. Cada herói é usado uma vez por loja; se faltar, o limite sobe aos poucos (como na referência). Vale pelo preço promocional.
7. **Surpresas:** candidatos do tema, fora da promoção, ordenados por (1) Forte parado, (2) Média parada, (3) Forte girando, (4) Média girando, com preferência para a marca do herói e um pequeno sorteio para variar. Entram até o valor cheio chegar perto do alvo, com 3 a 6 itens, no máximo 2 da mesma categoria e cada SKU em no máximo 6 kits da loja.
8. **Mimo:** se ainda faltar valor cheio, entra no máximo 1 Fraca.
9. **Validações:** herói ≥ 30% do valor cheio; Linha completa com ≥ 3 itens da mesma marca; preço final em degraus ,90 de R$ 5 dentro da faixa; desconto dentro da faixa; preço ≥ custo dos itens na loja; composição repetida na loja é descartada.
10. **Rodadas:** por rodada, tenta um kit de cada tema ligado (até 20 tentativas por tema). Para quando o estoque cobre as sacolas da meta, quando nenhum kit novo sai, ou no limite de kits por loja (até 15 rodadas).
11. **Alocação:** distribui as sacolas da meta entre os kits da loja, um de cada vez, enquanto houver estoque de todos os itens.
12. **Cobertura da meta:** sacolas possíveis = quantas sacolas os kits da loja permitem com o estoque (sem o teto da meta); mostra possíveis × meta e o %.
13. **Código do kit:** depois de gerar todas as lojas, composições iguais recebem o mesmo código.
14. **Sorteio reproduzível:** a simulação guarda a semente; com os mesmos dados e parâmetros, sai o mesmo resultado.

O motor é um módulo TypeScript puro (sem banco), testado localmente com os arquivos da `seed/` e comparado com a referência.

### 12.2 Simulação, salvar e base
- **Simular:** roda no navegador do admin, por praça ou todas. Não grava nada.
- **Salvar:** grava a simulação (nome, data, parâmetros, semente, resultado) em tabelas só do admin.
- **Definir como base:** escolhe uma simulação salva, um período (início e fim livres — fora do ciclo só gera aviso, desde 11/10/2026) e copia o resultado congelado para as tabelas que o gerente lê. Bases do mesmo ciclo não podem ter períodos sobrepostos.
- **Gerente:** vê a base cujo período contém hoje (a "atual") e as anteriores no Histórico.

### 12.3 Meta mensal (proposta)
Ciclo que cruza meses: meta do ciclo dividida entre os meses pelos dias. Com os ciclos de 2026:
- C15 (16/10–01/11, 17 dias): 16/17 em outubro e 1/17 em novembro.
- C16 (02/11–29/11): tudo em novembro.
- C17 (30/11–25/12, 26 dias): 1/26 em novembro e 25/26 em dezembro.
- Exemplo com a meta provisória de R$ 6.000.000 e os pesos de 2025: outubro R$ 870.212, novembro R$ 2.575.173, dezembro R$ 2.554.615.

### 12.4 Banco (vai para o SQL único da etapa 5.2)
Novas tabelas (só admin): `simulacoes`, `simulacao_kits`, `simulacao_kit_itens`, `simulacao_kit_lojas` (quantidade, custo e margem por loja), `simulacao_lojas` (meta, sacolas da meta, possíveis, planejadas, receita, custo).
Bases (o que o gerente lê), reaproveitando o plano publicado:
- `planos` ganha nome, simulação de origem, início e fim do período; gatilho impede período fora do ciclo ou sobreposto; a regra de leitura do gerente passa a ser "base já começou" (atual + histórico).
- `plano_kits` passa a ter código por composição e praça opcional; custo e margem por loja vão para uma tabela nova só do admin; nova tabela de meta mensal por loja; nova tabela de cobertura da meta por loja.
- Função `definir_base` (só servidor) copia a simulação para a base de uma vez.
- Parâmetros novos: kits por loja, uso máximo do SKU por loja, VMD 0 = Fraca, formato do código. `usar_hub`/`usar_er` deixam de valer.

---

## 13. Próximas melhorias (depois do piloto) — NÃO programar agora

1. ~~**"Regras do mix" vira "Motor do Mix"**~~ **Feito na parte F1a (11/10/2026), ver §8.3.** Texto original: com submenus **Regras** e **Critérios**.
   - Os **Critérios** ficam em **ordem de prioridade** (arrastar para ordenar):
     - **Herói:** promoção do ciclo, VMD, cobertura, valor (= custo do produto).
     - **Agregado:** promoção do ciclo, VMD alto/médio/baixo, cobertura alta, valor alto/médio/baixo (custo).
     - **Divisão** (um valor só): Regional, Praça ou Unidade. Hoje é por unidade; a ideia é ter a opção.
   - Os itens de Regras que se sobrepõem passam a ser controlados pelos Critérios.
2. ~~**Card Tema**~~ **Feito na parte F1a (§8.3).** Separado das regras: os 7 temas fixos + temas criados pelo admin (nome + até 4 categorias).
3. ~~**Dashboards:** o admin vê tudo; o gerente vê só as lojas dele.~~ **Feito na parte F2a (11/10/2026)** com os dados que já existem: §8.1 e §9 (Painel). Vendas na F2b.
4. ~~**Acompanhamento de vendas**~~ **Feito na parte F2b (12/10/2026), canal App Delivery: §8.8** (o check 2 ficou fora: o arquivo não traz cupom nem itens). Texto original, com 3 checks:
   1. **Ruído:** ruído esperado por loja e dia da semana = mediana das vendas do canal no mesmo dia da semana nas 8 semanas antes de 16/10. Venda da sacola estimada = venda do canal − ruído (mínimo 0).
   2. **Comparação:** sacola confirmada = venda que bate **exatamente** com um kit disponibilizado e tem ≥ 3 itens, sem tolerância. Depende de o arquivo trazer cupom e itens (o Matheus vai mandar a planilha).
   3. **Declaração do gerente:** por dia ou por semana, com aprovação do admin. Estimativa do gerente = quantidade declarada × preço médio dos kits da praça. Indicador de desvio % contra o valor do sistema. O valor oficial é o do sistema.
