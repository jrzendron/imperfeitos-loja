-- 0002_indexes.sql
--
-- Os índices da ARQUITETURA §47. Desde 01/09/2026 o D1 FALHA as queries
-- quando a conta gratuita estoura o limite diário de linhas lidas, e as
-- queries só voltam à meia-noite UTC. Uma listagem sem índice deixou de
-- ser lentidão e passou a ser indisponibilidade. Por isso eles entram
-- agora, não "depois".

CREATE INDEX ix_clientes_telefone           ON clientes (telefone);

CREATE INDEX ix_pedidos_cliente             ON pedidos (cliente_id);
CREATE INDEX ix_pedidos_status              ON pedidos (status);
CREATE INDEX ix_pedidos_created             ON pedidos (created_at DESC);
-- o cron da expiração varre exatamente por estas duas colunas
CREATE INDEX ix_pedidos_status_expira       ON pedidos (status, expires_at);

CREATE INDEX ix_pedido_itens_pedido         ON pedido_itens (pedido_id);
CREATE INDEX ix_pedido_itens_variacao       ON pedido_itens (produto_variacao_id);

CREATE INDEX ix_pagamentos_external         ON pagamentos (external_id);

CREATE INDEX ix_variacoes_produto           ON produto_variacoes (produto_id, ordem);
CREATE INDEX ix_imagens_produto             ON produto_imagens (produto_id, ordem);

CREATE INDEX ix_movimentos_variacao         ON estoque_movimentos (produto_variacao_id, created_at DESC);
CREATE INDEX ix_movimentos_pedido           ON estoque_movimentos (pedido_id);

CREATE INDEX ix_auditoria_entidade          ON auditoria (entity_type, entity_id);
CREATE INDEX ix_auditoria_created           ON auditoria (created_at DESC);

-- retirada_tokens.token_hash e pedidos.acesso_token_hash já são UNIQUE,
-- o que cria índice sozinho. É por eles que o scanner e o link do pedido
-- fazem a busca — sempre uma linha lida, nunca varredura.
