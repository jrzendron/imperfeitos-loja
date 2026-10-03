-- Cada cobrança conserva a conta usada, inclusive após uma troca no painel.
CREATE TABLE IF NOT EXISTS contas_pagamento (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  public_key TEXT NOT NULL,
  access_token_cifrado TEXT NOT NULL,
  webhook_secret_cifrado TEXT NOT NULL,
  mercado_pago_user_id TEXT,
  ativo INTEGER NOT NULL DEFAULT 0 CHECK (ativo IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_conta_pagamento_ativa
  ON contas_pagamento (ativo) WHERE ativo = 1;
ALTER TABLE pagamentos ADD COLUMN conta_pagamento_id TEXT REFERENCES contas_pagamento(id);
