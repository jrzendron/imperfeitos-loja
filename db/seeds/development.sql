-- Dados de desenvolvimento. Nunca rodar em produção.
-- Um produto, grade provisória do PP ao G1, estoque proposital de 1 peça no G1
-- para dar o que testar na concorrência.

DELETE FROM estoque_movimentos;
DELETE FROM retiradas;
DELETE FROM retirada_tokens;
DELETE FROM pagamentos;
DELETE FROM pedido_itens;
DELETE FROM pedidos;
DELETE FROM estoque;
DELETE FROM produto_variacoes;
DELETE FROM produto_imagens;
DELETE FROM produtos;
DELETE FROM clientes;
DELETE FROM auditoria;
UPDATE contadores SET valor = 0 WHERE nome = 'pedido';

INSERT INTO produtos (id, slug, nome, descricao, ativo, created_at, updated_at) VALUES
  ('prod_camiseta', 'camisetaimperfeitos',
   'Camiseta IMPERFEITOS [1 João 1:7]',
   NULL,
   1, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z');

INSERT INTO produto_variacoes (id, produto_id, sku, nome, valor_centavos, ativo, ordem, created_at, updated_at) VALUES
  ('var_pp', 'prod_camiseta', 'CAM-2026-PP', 'PP', 4500, 1, 0, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z'),
  ('var_p',  'prod_camiseta', 'CAM-2026-P',  'P',  4500, 1, 1, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z'),
  ('var_m',  'prod_camiseta', 'CAM-2026-M',  'M',  4500, 1, 2, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z'),
  ('var_g',  'prod_camiseta', 'CAM-2026-G',  'G',  4500, 1, 3, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z'),
  ('var_gg', 'prod_camiseta', 'CAM-2026-GG', 'GG', 4900, 1, 4, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z'),
  ('var_xg', 'prod_camiseta', 'CAM-2026-G1', 'G1', 4900, 1, 5, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z');

INSERT INTO estoque (produto_variacao_id, quantidade_fisica, quantidade_reservada, updated_at) VALUES
  ('var_pp',  0, 0, '2026-09-01T12:00:00.000Z'),
  ('var_p',  12, 0, '2026-09-01T12:00:00.000Z'),
  ('var_m',  30, 0, '2026-09-01T12:00:00.000Z'),
  ('var_g',  25, 0, '2026-09-01T12:00:00.000Z'),
  ('var_gg',  8, 0, '2026-09-01T12:00:00.000Z'),
  ('var_xg',  1, 0, '2026-09-01T12:00:00.000Z');

INSERT INTO estoque_movimentos (id, produto_variacao_id, tipo, quantidade, motivo, admin_email, created_at) VALUES
  ('mov_seed_p',  'var_p',  'ENTRADA', 12, 'Carga inicial (seed)', 'seed@local', '2026-09-01T12:00:00.000Z'),
  ('mov_seed_m',  'var_m',  'ENTRADA', 30, 'Carga inicial (seed)', 'seed@local', '2026-09-01T12:00:00.000Z'),
  ('mov_seed_g',  'var_g',  'ENTRADA', 25, 'Carga inicial (seed)', 'seed@local', '2026-09-01T12:00:00.000Z'),
  ('mov_seed_gg', 'var_gg', 'ENTRADA',  8, 'Carga inicial (seed)', 'seed@local', '2026-09-01T12:00:00.000Z'),
  ('mov_seed_xg', 'var_xg', 'ENTRADA',  1, 'Carga inicial (seed)', 'seed@local', '2026-09-01T12:00:00.000Z');

INSERT INTO configuracoes (chave, valor, updated_at) VALUES
  ('ORDER_EXPIRATION_MINUTES', '30', '2026-09-01T12:00:00.000Z');
