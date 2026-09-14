-- Carga inicial segura para o D1 de producao.
-- Nao remove nem substitui pedidos, clientes ou estoque existente.

PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO produtos
  (id, slug, nome, descricao, ativo, created_at, updated_at)
VALUES
  ('prod_camiseta', 'camisetaimperfeitos',
   'Camiseta IMPERFEITOS [1 João 1:7]',
   NULL, 1, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO produto_variacoes
  (id, produto_id, sku, nome, valor_centavos, ativo, ordem, created_at, updated_at)
VALUES
  ('var_pp', 'prod_camiseta', 'CAM-2026-PP', 'PP', 4500, 1, 0, datetime('now'), datetime('now')),
  ('var_p',  'prod_camiseta', 'CAM-2026-P',  'P',  4500, 1, 1, datetime('now'), datetime('now')),
  ('var_m',  'prod_camiseta', 'CAM-2026-M',  'M',  4500, 1, 2, datetime('now'), datetime('now')),
  ('var_g',  'prod_camiseta', 'CAM-2026-G',  'G',  4500, 1, 3, datetime('now'), datetime('now')),
  ('var_gg', 'prod_camiseta', 'CAM-2026-GG', 'GG', 4900, 1, 4, datetime('now'), datetime('now')),
  ('var_xg', 'prod_camiseta', 'CAM-2026-G1', 'G1', 4900, 1, 5, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO estoque
  (produto_variacao_id, quantidade_fisica, quantidade_reservada, updated_at)
VALUES
  ('var_pp',  0, 0, datetime('now')),
  ('var_p',  12, 0, datetime('now')),
  ('var_m',  30, 0, datetime('now')),
  ('var_g',  25, 0, datetime('now')),
  ('var_gg',  8, 0, datetime('now')),
  ('var_xg',  1, 0, datetime('now'));

INSERT OR IGNORE INTO produto_imagens
  (id, produto_id, r2_key, alt_text, ordem, created_at, content_type, bytes)
VALUES
  ('img_f42722ccfbee4501a62cbff6', 'prod_camiseta',
   'produto/camiseta-evento/1bd49735.webp', 'Camiseta IMPERFEITOS', 0,
   datetime('now'), 'image/webp', 132664);

INSERT OR IGNORE INTO configuracoes (chave, valor, updated_at)
VALUES ('ORDER_EXPIRATION_MINUTES', '30', datetime('now'));
