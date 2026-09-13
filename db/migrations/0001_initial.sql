-- 0001_initial.sql
--
-- As regras de negócio que não podem ser violadas moram NESTE arquivo,
-- como constraints, e não no TypeScript. O motivo está em ARQUITETURA §1.1:
-- o D1 não tem transação interativa, só `batch()`, que faz rollback quando
-- uma instrução levanta ERRO. Um UPDATE que casa com zero linhas não é erro.
-- Então transformamos cada invariante em algo que o SQLite recusa:
--
--   vender mais do que existe   -> CHECK (reservada <= fisica)
--   pagar o mesmo pedido 2x     -> UNIQUE (pedido_id) em pagamentos
--   retirar o mesmo pedido 2x   -> UNIQUE (pedido_id) em retiradas
--
-- Com isso a correção não depende de ninguém lembrar de checar `meta.changes`.

PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────────────
-- CLIENTES
-- Neste primeiro build a identificação é nome + telefone, sem login
-- e sem CPF (decisão D6 ainda em aberto). O telefone fica em texto
-- porque a igreja precisa ligar para o comprador; ele é exibido
-- mascarado nas listagens. Quando o CPF entrar, ele NÃO segue este
-- padrão: vai com HMAC + pepper, conforme ARQUITETURA §1.3.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE clientes (
  id           TEXT PRIMARY KEY,
  nome         TEXT NOT NULL,
  telefone     TEXT NOT NULL,          -- normalizado: só dígitos, com DDD
  email        TEXT,
  ativo        INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,

  CHECK (length(telefone) BETWEEN 10 AND 11),
  CHECK (length(trim(nome)) >= 3)
);

-- ─────────────────────────────────────────────────────────────
-- PRODUTOS E VARIAÇÕES
-- Dinheiro SEMPRE em centavos, INTEGER. Nunca REAL.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE produtos (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  nome         TEXT NOT NULL,
  descricao    TEXT,
  ativo        INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE produto_variacoes (
  id             TEXT PRIMARY KEY,
  produto_id     TEXT NOT NULL REFERENCES produtos(id),
  sku            TEXT NOT NULL UNIQUE,
  nome           TEXT NOT NULL,             -- P, M, G, GG, XG
  valor_centavos INTEGER NOT NULL,
  ativo          INTEGER NOT NULL DEFAULT 1,
  ordem          INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,

  CHECK (valor_centavos > 0)
);

CREATE TABLE produto_imagens (
  id          TEXT PRIMARY KEY,
  produto_id  TEXT NOT NULL REFERENCES produtos(id),
  r2_key      TEXT NOT NULL,
  alt_text    TEXT,
  ordem       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- ESTOQUE  ← o coração da correção do sistema
-- ─────────────────────────────────────────────────────────────
CREATE TABLE estoque (
  produto_variacao_id  TEXT PRIMARY KEY REFERENCES produto_variacoes(id),
  quantidade_fisica    INTEGER NOT NULL DEFAULT 0,
  quantidade_reservada INTEGER NOT NULL DEFAULT 0,
  updated_at           TEXT NOT NULL,

  CHECK (quantidade_fisica    >= 0),
  CHECK (quantidade_reservada >= 0),
  -- A invariante do negócio. É ela que faz o batch inteiro reverter
  -- quando duas pessoas tentam comprar a última camiseta ao mesmo tempo.
  CHECK (quantidade_reservada <= quantidade_fisica)
);

CREATE TABLE estoque_movimentos (
  id                   TEXT PRIMARY KEY,
  produto_variacao_id  TEXT NOT NULL REFERENCES produto_variacoes(id),
  tipo                 TEXT NOT NULL,
  quantidade           INTEGER NOT NULL,
  pedido_id            TEXT REFERENCES pedidos(id),
  motivo               TEXT,
  admin_email          TEXT,
  created_at           TEXT NOT NULL,

  CHECK (tipo IN ('ENTRADA','RESERVA','LIBERACAO_RESERVA','VENDA','CANCELAMENTO','AJUSTE'))
);

-- ─────────────────────────────────────────────────────────────
-- CONTADORES  (numeração pública dos pedidos)
-- Alocada por UPDATE ... RETURNING, que é atômico em uma instrução só.
-- Se o pedido falhar depois, o número é queimado e fica um buraco na
-- sequência. Buraco em PED-000123 é inofensivo; número repetido não é.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE contadores (
  nome  TEXT PRIMARY KEY,
  valor INTEGER NOT NULL DEFAULT 0
);
INSERT INTO contadores (nome, valor) VALUES ('pedido', 0);

-- ─────────────────────────────────────────────────────────────
-- PEDIDOS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE pedidos (
  id                   TEXT PRIMARY KEY,
  numero               TEXT NOT NULL UNIQUE,
  cliente_id           TEXT NOT NULL REFERENCES clientes(id),
  status               TEXT NOT NULL,
  valor_total_centavos INTEGER NOT NULL DEFAULT 0,
  -- token do link secreto: /pedido/<token>. Substitui o login enquanto
  -- a decisão D6 não é tomada. O banco guarda só o SHA-256.
  acesso_token_hash    TEXT NOT NULL UNIQUE,
  expires_at           TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,

  CHECK (status IN (
    'AGUARDANDO_PAGAMENTO','PAGO','PRONTO_PARA_RETIRADA','RETIRADO',
    'CANCELADO','EXPIRADO','REEMBOLSADO','PAGO_REVISAR'
  )),
  CHECK (valor_total_centavos >= 0)
);

CREATE TABLE pedido_itens (
  id                      TEXT PRIMARY KEY,
  pedido_id               TEXT NOT NULL REFERENCES pedidos(id),
  produto_variacao_id     TEXT NOT NULL REFERENCES produto_variacoes(id),
  -- snapshot: o pedido antigo continua mostrando nome e valor originais
  -- mesmo depois de o produto mudar.
  produto_nome_snapshot   TEXT NOT NULL,
  variacao_nome_snapshot  TEXT NOT NULL,
  quantidade              INTEGER NOT NULL,
  valor_unitario_centavos INTEGER NOT NULL,
  subtotal_centavos       INTEGER NOT NULL,
  created_at              TEXT NOT NULL,

  CHECK (quantidade > 0),
  CHECK (subtotal_centavos = valor_unitario_centavos * quantidade),
  UNIQUE (pedido_id, produto_variacao_id)
);

-- ─────────────────────────────────────────────────────────────
-- PAGAMENTOS
-- O UNIQUE em pedido_id é o que impede o mesmo pedido ser pago duas
-- vezes: a segunda tentativa levanta erro e derruba o batch inteiro,
-- sem ter mexido no estoque. Quando o Mercado Pago entrar, o webhook
-- usa exatamente este mesmo caminho.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE pagamentos (
  id              TEXT PRIMARY KEY,
  pedido_id       TEXT NOT NULL UNIQUE REFERENCES pedidos(id),
  provider        TEXT NOT NULL,
  external_id     TEXT,
  idempotency_key TEXT UNIQUE,
  status          TEXT NOT NULL,
  valor_centavos  INTEGER NOT NULL,
  pix_copia_cola  TEXT,
  expires_at      TEXT,
  paid_at         TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,

  CHECK (provider IN ('MANUAL','MERCADO_PAGO')),
  CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED','REFUNDED'))
);

CREATE TABLE webhook_events (
  id                TEXT PRIMARY KEY,
  provider          TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  event_type        TEXT,
  payload_hash      TEXT,
  payload_raw       TEXT,
  processed_at      TEXT,
  created_at        TEXT NOT NULL,

  -- impede processar a mesma notificação duas vezes
  UNIQUE (provider, external_event_id)
);

-- ─────────────────────────────────────────────────────────────
-- RETIRADA
-- ─────────────────────────────────────────────────────────────
-- O token do QR de retirada NÃO é guardado, nem em claro nem cifrado.
-- Ele é DERIVADO sob demanda:
--
--   token = HMAC-SHA256(QR_TOKEN_SECRET, pedido_id || ':' || nonce)
--
-- O nonce fica aqui em texto puro — ele não é segredo, a chave é. Assim
-- o comprador pode pedir o token de volta a qualquer momento (para redesenhar
-- o QR num celular novo) sem que o banco jamais tenha guardado o segredo.
-- Um dump do D1 sozinho não gera um QR válido.
CREATE TABLE retirada_tokens (
  id          TEXT PRIMARY KEY,
  pedido_id   TEXT NOT NULL REFERENCES pedidos(id),
  nonce       TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,     -- SHA-256 do token derivado, para a busca do scanner
  created_at  TEXT NOT NULL,
  revoked_at  TEXT
);

-- Um único token válido por pedido. Índice parcial: tokens revogados
-- não contam, então dá para reemitir depois de revogar.
CREATE UNIQUE INDEX ux_retirada_tokens_ativo
  ON retirada_tokens (pedido_id) WHERE revoked_at IS NULL;

CREATE TABLE retiradas (
  id          TEXT PRIMARY KEY,
  -- É ESTE UNIQUE que bloqueia a segunda retirada. Dois atendentes
  -- escaneando o mesmo QR ao mesmo tempo: um grava, o outro recebe
  -- erro de constraint e vê "PEDIDO JÁ RETIRADO".
  pedido_id   TEXT NOT NULL UNIQUE REFERENCES pedidos(id),
  admin_email TEXT NOT NULL,
  data_hora   TEXT NOT NULL,
  observacao  TEXT,
  created_at  TEXT NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- AUDITORIA
-- ─────────────────────────────────────────────────────────────
CREATE TABLE auditoria (
  id               TEXT PRIMARY KEY,
  actor_type       TEXT NOT NULL,       -- CLIENTE | ADMIN | SISTEMA
  actor_identifier TEXT,
  action           TEXT NOT NULL,
  entity_type      TEXT,
  entity_id        TEXT,
  metadata_json    TEXT,
  created_at       TEXT NOT NULL,

  CHECK (actor_type IN ('CLIENTE','ADMIN','SISTEMA'))
);

-- ─────────────────────────────────────────────────────────────
-- CONFIGURAÇÕES
-- A tela /admin/configuracoes precisa mudar valores sem deploy.
-- A variável de ambiente vira apenas o padrão inicial.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE configuracoes (
  chave      TEXT PRIMARY KEY,
  valor      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
