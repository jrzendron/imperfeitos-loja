ALTER TABLE clientes ADD COLUMN cpf_hash TEXT;
CREATE UNIQUE INDEX ux_clientes_cpf_hash
  ON clientes(cpf_hash) WHERE cpf_hash IS NOT NULL;

ALTER TABLE pedidos ADD COLUMN codigo_retirada TEXT;
CREATE UNIQUE INDEX ux_pedidos_codigo_retirada
  ON pedidos(codigo_retirada) WHERE codigo_retirada IS NOT NULL;
