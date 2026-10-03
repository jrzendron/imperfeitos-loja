-- Alinha a grade à tabela de medidas enviada para o 3º Flow Blumenau.
-- A variação var_xg já representava XG internamente; apenas o rótulo/SKU
-- provisórios eram G1. Sua peça física e o histórico de movimentos ficam.
UPDATE produto_variacoes
SET nome = 'XG', sku = 'CAM-2026-XG', ordem = 5, updated_at = datetime('now')
WHERE id = 'var_xg'
  AND produto_id = 'prod_camiseta'
  AND nome IN ('G1', 'XG')
  AND sku IN ('CAM-2026-G1', 'CAM-2026-XG');

-- Tamanhos novos começam sem peças. R$ 49,00 acompanha o preço atual dos
-- tamanhos maiores; o painel permite ajustar o preço antes de repor estoque.
INSERT OR IGNORE INTO produto_variacoes
  (id, produto_id, sku, nome, valor_centavos, ativo, ordem, created_at, updated_at)
VALUES
  ('var_g2', 'prod_camiseta', 'CAM-2026-G2', 'G2', 4900, 1, 6, datetime('now'), datetime('now')),
  ('var_g3', 'prod_camiseta', 'CAM-2026-G3', 'G3', 4900, 1, 7, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO estoque
  (produto_variacao_id, quantidade_fisica, quantidade_reservada, updated_at)
VALUES
  ('var_g2', 0, 0, datetime('now')),
  ('var_g3', 0, 0, datetime('now'));

INSERT OR IGNORE INTO auditoria
  (id, actor_type, actor_identifier, action, entity_type, entity_id, metadata_json, created_at)
VALUES
  ('aud_flow_tamanhos_20261003', 'SISTEMA', 'manutencao', 'GRADE_TAMANHOS_ATUALIZADA',
   'produto', 'prod_camiseta',
   '{"tamanhos":["PP","P","M","G","GG","XG","G2","G3"],"g1_renomeado_para_xg":true,"g2_g3_estoque_inicial":0}',
   datetime('now'));
