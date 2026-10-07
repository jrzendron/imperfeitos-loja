-- Dados de desenvolvimento. Nunca rodar em produção.
-- Um produto, grade do PP ao G3, estoque proposital de 1 peça no XG
-- para dar o que testar na concorrência.

DELETE FROM estoque_movimentos;
DELETE FROM webhook_events;
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
  ('var_xg', 'prod_camiseta', 'CAM-2026-XG', 'XG', 4900, 1, 5, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z'),
  ('var_g2', 'prod_camiseta', 'CAM-2026-G2', 'G2', 4900, 1, 6, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z'),
  ('var_g3', 'prod_camiseta', 'CAM-2026-G3', 'G3', 4900, 1, 7, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z');

UPDATE produto_variacoes
   SET categoria = 'ADULTO',
       altura_cm = CASE nome
         WHEN 'PP' THEN 66 WHEN 'P' THEN 68 WHEN 'M' THEN 71 WHEN 'G' THEN 73
         WHEN 'GG' THEN 75 WHEN 'XG' THEN 78 WHEN 'G2' THEN 83 WHEN 'G3' THEN 87 END,
       largura_cm = CASE nome
         WHEN 'PP' THEN 47 WHEN 'P' THEN 51 WHEN 'M' THEN 54 WHEN 'G' THEN 57
         WHEN 'GG' THEN 60 WHEN 'XG' THEN 63 WHEN 'G2' THEN 67 WHEN 'G3' THEN 71 END;

INSERT INTO produto_variacoes
  (id, produto_id, sku, nome, categoria, altura_cm, largura_cm,
   valor_centavos, preco_definido, ativo, ordem, created_at, updated_at) VALUES
  ('var_inf_02', 'prod_camiseta', 'CAM-INF-02', '02', 'INFANTIL', 45, 35, 1, 0, 1, 0, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z'),
  ('var_inf_04', 'prod_camiseta', 'CAM-INF-04', '04', 'INFANTIL', 48, 37, 1, 0, 1, 1, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z'),
  ('var_inf_06', 'prod_camiseta', 'CAM-INF-06', '06', 'INFANTIL', 51, 39, 1, 0, 1, 2, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z'),
  ('var_inf_08', 'prod_camiseta', 'CAM-INF-08', '08', 'INFANTIL', 54, 41, 1, 0, 1, 3, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z'),
  ('var_inf_10', 'prod_camiseta', 'CAM-INF-10', '10', 'INFANTIL', 59, 43.5, 1, 0, 1, 4, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z'),
  ('var_inf_12', 'prod_camiseta', 'CAM-INF-12', '12', 'INFANTIL', 65, 46.5, 1, 0, 1, 5, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z'),
  ('var_inf_14', 'prod_camiseta', 'CAM-INF-14', '14', 'INFANTIL', 67, 48.5, 1, 0, 1, 6, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z');

INSERT INTO estoque (produto_variacao_id, quantidade_fisica, quantidade_reservada, updated_at) VALUES
  ('var_pp',  0, 0, '2026-09-01T12:00:00.000Z'),
  ('var_p',  12, 0, '2026-09-01T12:00:00.000Z'),
  ('var_m',  30, 0, '2026-09-01T12:00:00.000Z'),
  ('var_g',  25, 0, '2026-09-01T12:00:00.000Z'),
  ('var_gg',  8, 0, '2026-09-01T12:00:00.000Z'),
  ('var_xg',  1, 0, '2026-09-01T12:00:00.000Z'),
  ('var_g2',  0, 0, '2026-09-01T12:00:00.000Z'),
  ('var_g3',  0, 0, '2026-09-01T12:00:00.000Z');

INSERT INTO estoque (produto_variacao_id, quantidade_fisica, quantidade_reservada, updated_at) VALUES
  ('var_inf_02', 0, 0, '2026-09-01T12:00:00.000Z'),
  ('var_inf_04', 0, 0, '2026-09-01T12:00:00.000Z'),
  ('var_inf_06', 0, 0, '2026-09-01T12:00:00.000Z'),
  ('var_inf_08', 0, 0, '2026-09-01T12:00:00.000Z'),
  ('var_inf_10', 0, 0, '2026-09-01T12:00:00.000Z'),
  ('var_inf_12', 0, 0, '2026-09-01T12:00:00.000Z'),
  ('var_inf_14', 0, 0, '2026-09-01T12:00:00.000Z');

INSERT INTO estoque_movimentos (id, produto_variacao_id, tipo, quantidade, motivo, admin_email, created_at) VALUES
  ('mov_seed_p',  'var_p',  'ENTRADA', 12, 'Carga inicial (seed)', 'seed@local', '2026-09-01T12:00:00.000Z'),
  ('mov_seed_m',  'var_m',  'ENTRADA', 30, 'Carga inicial (seed)', 'seed@local', '2026-09-01T12:00:00.000Z'),
  ('mov_seed_g',  'var_g',  'ENTRADA', 25, 'Carga inicial (seed)', 'seed@local', '2026-09-01T12:00:00.000Z'),
  ('mov_seed_gg', 'var_gg', 'ENTRADA',  8, 'Carga inicial (seed)', 'seed@local', '2026-09-01T12:00:00.000Z'),
  ('mov_seed_xg', 'var_xg', 'ENTRADA',  1, 'Carga inicial (seed)', 'seed@local', '2026-09-01T12:00:00.000Z');

INSERT OR REPLACE INTO configuracoes (chave, valor, updated_at) VALUES
  ('ORDER_EXPIRATION_MINUTES', '30', '2026-09-01T12:00:00.000Z');
