-- Cadastro da grade infantil; preços serão definidos no painel.
INSERT INTO produto_variacoes
  (id, produto_id, sku, nome, categoria, altura_cm, largura_cm,
   valor_centavos, preco_definido, ativo, ordem, created_at, updated_at)
SELECT 'var_inf_02', p.id, 'CAM-INF-02', '02', 'INFANTIL', 45, 35,
       1, 0, 1, 0, datetime('now'), datetime('now')
  FROM produtos p
 WHERE NOT EXISTS (
   SELECT 1 FROM produto_variacoes v
    WHERE v.produto_id = p.id AND v.categoria = 'INFANTIL' AND v.nome = '02'
 );

INSERT INTO produto_variacoes
  (id, produto_id, sku, nome, categoria, altura_cm, largura_cm,
   valor_centavos, preco_definido, ativo, ordem, created_at, updated_at)
SELECT 'var_inf_04', p.id, 'CAM-INF-04', '04', 'INFANTIL', 48, 37,
       1, 0, 1, 1, datetime('now'), datetime('now')
  FROM produtos p
 WHERE NOT EXISTS (SELECT 1 FROM produto_variacoes v WHERE v.produto_id = p.id AND v.categoria = 'INFANTIL' AND v.nome = '04');

INSERT INTO produto_variacoes
  (id, produto_id, sku, nome, categoria, altura_cm, largura_cm,
   valor_centavos, preco_definido, ativo, ordem, created_at, updated_at)
SELECT 'var_inf_06', p.id, 'CAM-INF-06', '06', 'INFANTIL', 51, 39,
       1, 0, 1, 2, datetime('now'), datetime('now')
  FROM produtos p
 WHERE NOT EXISTS (SELECT 1 FROM produto_variacoes v WHERE v.produto_id = p.id AND v.categoria = 'INFANTIL' AND v.nome = '06');

INSERT INTO produto_variacoes
  (id, produto_id, sku, nome, categoria, altura_cm, largura_cm,
   valor_centavos, preco_definido, ativo, ordem, created_at, updated_at)
SELECT 'var_inf_08', p.id, 'CAM-INF-08', '08', 'INFANTIL', 54, 41,
       1, 0, 1, 3, datetime('now'), datetime('now')
  FROM produtos p
 WHERE NOT EXISTS (SELECT 1 FROM produto_variacoes v WHERE v.produto_id = p.id AND v.categoria = 'INFANTIL' AND v.nome = '08');

INSERT INTO produto_variacoes
  (id, produto_id, sku, nome, categoria, altura_cm, largura_cm,
   valor_centavos, preco_definido, ativo, ordem, created_at, updated_at)
SELECT 'var_inf_10', p.id, 'CAM-INF-10', '10', 'INFANTIL', 59, 43.5,
       1, 0, 1, 4, datetime('now'), datetime('now')
  FROM produtos p
 WHERE NOT EXISTS (SELECT 1 FROM produto_variacoes v WHERE v.produto_id = p.id AND v.categoria = 'INFANTIL' AND v.nome = '10');

INSERT INTO produto_variacoes
  (id, produto_id, sku, nome, categoria, altura_cm, largura_cm,
   valor_centavos, preco_definido, ativo, ordem, created_at, updated_at)
SELECT 'var_inf_12', p.id, 'CAM-INF-12', '12', 'INFANTIL', 65, 46.5,
       1, 0, 1, 5, datetime('now'), datetime('now')
  FROM produtos p
 WHERE NOT EXISTS (SELECT 1 FROM produto_variacoes v WHERE v.produto_id = p.id AND v.categoria = 'INFANTIL' AND v.nome = '12');

INSERT INTO produto_variacoes
  (id, produto_id, sku, nome, categoria, altura_cm, largura_cm,
   valor_centavos, preco_definido, ativo, ordem, created_at, updated_at)
SELECT 'var_inf_14', p.id, 'CAM-INF-14', '14', 'INFANTIL', 67, 48.5,
       1, 0, 1, 6, datetime('now'), datetime('now')
  FROM produtos p
 WHERE NOT EXISTS (SELECT 1 FROM produto_variacoes v WHERE v.produto_id = p.id AND v.categoria = 'INFANTIL' AND v.nome = '14');

INSERT INTO estoque (produto_variacao_id, quantidade_fisica, quantidade_reservada, updated_at)
SELECT v.id, 0, 0, datetime('now')
  FROM produto_variacoes v
 WHERE v.categoria = 'INFANTIL'
   AND NOT EXISTS (SELECT 1 FROM estoque e WHERE e.produto_variacao_id = v.id);
