-- Um preço ainda não informado não pode virar uma venda acidental.
ALTER TABLE produto_variacoes ADD COLUMN preco_definido INTEGER NOT NULL DEFAULT 1
  CHECK (preco_definido IN (0, 1));

-- O valor de 1 centavo é apenas um valor interno exigido pela constraint antiga.
-- A loja oculta esse valor e bloqueia a compra até o administrador definir o preço.
-- Defesa adicional: nenhum pedido pode conter um tamanho sem preço.
CREATE TRIGGER IF NOT EXISTS trg_pedido_item_exige_preco
BEFORE INSERT ON pedido_itens
WHEN (SELECT preco_definido FROM produto_variacoes WHERE id = NEW.produto_variacao_id) <> 1
BEGIN
  SELECT RAISE(ABORT, 'PRECO_PENDENTE');
END;
