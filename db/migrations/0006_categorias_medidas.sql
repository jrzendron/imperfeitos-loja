-- Uma única camiseta, com tamanhos independentes por categoria.
ALTER TABLE produto_variacoes ADD COLUMN categoria TEXT NOT NULL DEFAULT 'ADULTO'
  CHECK (categoria IN ('ADULTO', 'INFANTIL'));
ALTER TABLE produto_variacoes ADD COLUMN altura_cm REAL
  CHECK (altura_cm IS NULL OR (altura_cm > 0 AND altura_cm <= 300));
ALTER TABLE produto_variacoes ADD COLUMN largura_cm REAL
  CHECK (largura_cm IS NULL OR (largura_cm > 0 AND largura_cm <= 300));

-- Medidas fornecidas para a grade adulta existente. O estoque e os preços não mudam.
UPDATE produto_variacoes
   SET altura_cm = CASE nome
     WHEN 'PP' THEN 66 WHEN 'P' THEN 68 WHEN 'M' THEN 71 WHEN 'G' THEN 73
     WHEN 'GG' THEN 75 WHEN 'XG' THEN 78 WHEN 'G2' THEN 83 WHEN 'G3' THEN 87 END,
       largura_cm = CASE nome
     WHEN 'PP' THEN 47 WHEN 'P' THEN 51 WHEN 'M' THEN 54 WHEN 'G' THEN 57
     WHEN 'GG' THEN 60 WHEN 'XG' THEN 63 WHEN 'G2' THEN 67 WHEN 'G3' THEN 71 END
 WHERE nome IN ('PP', 'P', 'M', 'G', 'GG', 'XG', 'G2', 'G3');

-- A coleção admite somente um produto, inclusive por acesso direto à API.
CREATE UNIQUE INDEX IF NOT EXISTS ux_produtos_unico ON produtos ((1));
CREATE UNIQUE INDEX IF NOT EXISTS ux_variacao_categoria_tamanho
  ON produto_variacoes (produto_id, categoria, nome COLLATE NOCASE);
