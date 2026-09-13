-- 0003_imagens.sql
--
-- As fotos ficam no R2; o D1 guarda só a chave e a ordem.
-- `content_type` é gravado no upload para o endpoint público devolver o
-- cabeçalho certo sem precisar adivinhar pela extensão.

ALTER TABLE produto_imagens ADD COLUMN content_type TEXT NOT NULL DEFAULT 'image/webp';
ALTER TABLE produto_imagens ADD COLUMN bytes INTEGER NOT NULL DEFAULT 0;

-- A chave do R2 não pode se repetir: duas linhas apontando para o mesmo
-- objeto fariam a remoção de uma apagar a foto da outra.
CREATE UNIQUE INDEX ux_produto_imagens_key ON produto_imagens (r2_key);
