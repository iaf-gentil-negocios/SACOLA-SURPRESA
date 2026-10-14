-- Busca de lojas pelo nome completo (12/10/2026): o banco guardava só o "Nome Abreviado" da dCentros
-- (ex.: "Hiper M" para Carrefour Mossoró). A coluna nova guarda o "Nome" completo; a tela continua
-- mostrando o abreviado, e a busca procura nos dois. O upload da dCentros passa a gravar a coluna.
-- APLICADO PELO SQL EDITOR do Lovable Cloud em 12/10/2026 (script único; conferência ok): por isso não está em
-- meta/_journal.json. Pode rodar mais de uma vez sem efeito. Não apaga tabela nem dado nenhum.
alter table public.lojas add column if not exists nome_completo text;
