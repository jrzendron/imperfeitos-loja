-- A cidade pertence ao pedido: se o comprador se mudar, o histórico anterior
-- continua exibindo a cidade informada no momento da compra.
ALTER TABLE pedidos ADD COLUMN cidade TEXT;
