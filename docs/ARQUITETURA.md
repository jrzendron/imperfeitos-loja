# LOJA PWA DA IGREJA
**Especificação Técnica e Arquitetura — Versão 1.0**

## 1. Objetivo

Construir uma aplicação PWA para venda de produtos da igreja, inicialmente camisetas, com:

- catálogo de produtos;
- variações de produto, como P, M, G, GG;
- cadastro de clientes;
- identificação por CPF, nome e telefone;
- login simples;
- controle de estoque;
- geração automática de pedidos;
- integração com Mercado Pago;
- pagamento Pix por QR Code e Copia e Cola;
- confirmação automática do pagamento;
- QR Code próprio do pedido;
- painel administrativo;
- controle da retirada;
- leitura do QR Code pela câmera do celular;
- confirmação da entrega;
- histórico e auditoria;
- possibilidade de expansão para novos produtos e eventos.

O sistema deverá funcionar inicialmente sem mensalidade obrigatória de infraestrutura.

## 2. Princípios do projeto

1. Nenhum ativo de produção deve pertencer pessoalmente ao desenvolvedor.
2. Código-fonte deve pertencer à igreja.
3. Banco deve pertencer à igreja.
4. Cloudflare deve pertencer à igreja.
5. Mercado Pago deve pertencer à igreja ou à entidade legal responsável pelas vendas.
6. Domínio deve pertencer à igreja.
7. Desenvolvedores devem ser convidados como membros.
8. Nenhum segredo deve ser salvo no Git.
9. Produção e homologação devem utilizar bancos diferentes.
10. Preço, estoque e pagamento sempre devem ser validados no backend.
11. Nunca confiar em valores enviados pelo frontend.
12. Nenhum dado de cartão será armazenado.
13. O QR Code de pagamento e o QR Code de retirada serão independentes.
14. Nenhuma retirada poderá ser confirmada offline.
15. Toda operação administrativa importante deverá gerar auditoria.

## 3. Arquitetura final

```text
                       INTERNET
                           │
                           ▼
               loja.nomedaigreja.com.br
                           │
                           ▼
┌───────────────────────────────────────────────────┐
│                 CLOUDFLARE WORKER                 │
│                                                   │
│   STATIC ASSETS                    API            │
│   React + Vite                     Hono           │
│   TypeScript                       /api/*         │
│   PWA                              Backend        │
│   Tailwind                         Segurança      │
│   shadcn/ui                        Regras         │
│                                                   │
└───────────────┬──────────────────────┬────────────┘
                │                      │
                ▼                      ▼
        CLOUDFLARE D1             MERCADO PAGO
         Banco SQL                 Pix / API
             │                         │
             │                    Webhook
             │                         │
             └────────────◄────────────┘
             │
             ▼
        CLOUDFLARE R2
       Fotos dos produtos
```

A aplicação será servida pelo mesmo domínio:

```text
https://loja.igreja.com.br/
https://loja.igreja.com.br/produtos
https://loja.igreja.com.br/meus-pedidos
https://loja.igreja.com.br/admin
https://loja.igreja.com.br/api/*
```

Isso elimina CORS desnecessário e reduz a quantidade de serviços.

## 4. Stack

**Frontend**

```text
React
Vite
TypeScript
TanStack Router
Tailwind CSS
shadcn/ui
Zod
vite-plugin-pwa
```

**Backend**

```text
Cloudflare Workers
TypeScript
Hono
Zod
Web Crypto API
```

**Dados**

```text
Cloudflare D1
SQLite SQL
Drizzle ORM / D1
SQL migrations versionadas
```

Drizzle poderá ser utilizado como camada tipada de consulta. As migrations SQL deverão continuar visíveis e versionadas.

**Arquivos** — Cloudflare R2

```text
produto/
  camiseta-evento/
    frente.webp
    costas.webp
    tabela-medidas.webp
```

**Pagamentos**

```text
Mercado Pago API
Pix
Webhook
X-Idempotency-Key
```

**QR Code**

- Geração: `qrcode`
- Leitura: `@zxing/browser` ou equivalente compatível com browser/PWA.

**Hospedagem:** Cloudflare Workers + Static Assets
**Controle de versão:** Git / GitHub Organization

**Deploy**

```text
GitHub → Cloudflare Workers Builds → Cloudflare Worker
```

## 5. Contas e propriedade

E-mail institucional controlado pela igreja. Preferência:

```text
tecnologia@igreja.com.br
sistemas@igreja.com.br
```

Se ainda não houver domínio/e-mail, `sistemas.nomedaigreja@gmail.com` pode ser usado temporariamente. Essa conta será a conta administrativa institucional. Não utilizar e-mail pessoal do desenvolvedor como proprietário.

## 6. Contas que devem existir

| Serviço | Proprietário |
|---|---|
| Domínio | Igreja |
| Cloudflare | Igreja |
| GitHub Organization | Igreja |
| Mercado Pago | Igreja / entidade responsável |
| Banco D1 | Igreja |
| R2 | Igreja |
| Worker | Igreja |
| Credenciais de produção | Igreja |

## 7. GitHub

Criar uma Organization, ex.: `github.com/igreja-nome`, com o repositório `igreja-loja` **privado**.

O desenvolvedor não será proprietário do código em sua conta pessoal — será membro da Organization.

```text
Igreja
└── GitHub Organization
      └── igreja-loja
```

Manter no mínimo dois responsáveis com capacidade administrativa (responsável da igreja e responsável técnico). Evitar utilizar uma única conta compartilhada para desenvolvimento diário.

## 8. Branches

```text
main     → PRODUÇÃO
develop  → HOMOLOGAÇÃO
feature/* → desenvolvimento
```

Exemplos: `feature/cadastro-clientes`, `feature/checkout-pix`, `feature/scanner-retirada`

Fluxo: `feature/* → develop → teste → main → produção`

## 9. Ambientes

**Local**

```text
localhost
D1 local
R2 local/mock
Mercado Pago mock/teste
```

**Homologação**

```text
Worker:  igreja-loja-staging
Banco:   igreja-loja-staging
Bucket:  igreja-loja-media-staging
MP:      credenciais de teste
URL:     staging.loja.igreja.com.br (ou *.workers.dev inicialmente)
```

**Produção**

```text
Worker:  igreja-loja-prod
Banco:   igreja-loja-prod
Bucket:  igreja-loja-media-prod
MP:      credenciais reais
URL:     loja.igreja.com.br
```

O ambiente de homologação NUNCA deve acessar o banco de produção.

## 10. Estrutura do repositório

```text
igreja-loja/
│
├── src/
│   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── catalogo/
│   │   │   ├── checkout/
│   │   │   ├── pedidos/
│   │   │   ├── pagamento/
│   │   │   └── admin/
│   │   │       ├── dashboard/
│   │   │       ├── pedidos/
│   │   │       ├── produtos/
│   │   │       ├── estoque/
│   │   │       ├── clientes/
│   │   │       └── retirada/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── routes/
│   │   ├── styles/
│   │   ├── App.tsx
│   │   └── main.tsx
│   │
│   ├── server/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── produtos.ts
│   │   │   ├── pedidos.ts
│   │   │   ├── pagamentos.ts
│   │   │   ├── webhook.ts
│   │   │   └── admin/
│   │   │       ├── pedidos.ts
│   │   │       ├── produtos.ts
│   │   │       ├── estoque.ts
│   │   │       └── retirada.ts
│   │   ├── services/
│   │   │   ├── auth.service.ts
│   │   │   ├── pedido.service.ts
│   │   │   ├── estoque.service.ts
│   │   │   ├── pagamento.service.ts
│   │   │   ├── retirada.service.ts
│   │   │   ├── mercado-pago.service.ts
│   │   │   └── auditoria.service.ts
│   │   ├── repositories/
│   │   ├── middleware/
│   │   ├── security/
│   │   └── utils/
│   │
│   └── shared/
│       ├── schemas/
│       ├── types/
│       ├── constants/
│       └── utils/
│
├── db/
│   ├── schema.ts
│   ├── migrations/
│   │   ├── 0001_initial.sql
│   │   ├── 0002_indexes.sql
│   │   └── ...
│   └── seeds/
│       └── development.sql
│
├── public/
│   ├── icons/
│   ├── manifest.webmanifest
│   └── robots.txt
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── DEPLOYMENT.md
│   ├── PROVISIONING.md
│   ├── SECURITY.md
│   └── OPERATIONS.md
│
├── scripts/
│
├── .dev.vars.example
├── .env.example
├── .gitignore
├── wrangler.jsonc
├── vite.config.ts
├── tsconfig.json
├── package.json
├── pnpm-lock.yaml
└── README.md
```

## 11. Banco de dados

**clientes**

```text
id
nome
cpf_hash
cpf_encrypted
telefone_hash
telefone_encrypted
email
pin_salt
pin_verifier
ativo
created_at
updated_at
```

CPF não deverá ser utilizado diretamente como chave primária. O CPF deverá ser normalizado antes do processamento.

**cliente_sessoes**

```text
id
cliente_id
token_hash
expires_at
created_at
last_seen_at
```

O token da sessão nunca será salvo puro.

**admin_perfis**

```text
email
nome
perfil   -- ADMIN | ATENDENTE
ativo
created_at
```

**produtos**

```text
id
slug
nome
descricao
ativo
created_at
updated_at
```

**produto_variacoes**

```text
Camiseta Evento
├── P
├── M
├── G
├── GG
└── XG
```

```text
id
produto_id
sku
nome
valor_centavos
ativo
ordem
created_at
updated_at
```

Todos os valores monetários deverão ser armazenados em centavos. Nunca utilizar FLOAT para dinheiro.

**produto_imagens**

```text
id
produto_id
r2_key
alt_text
ordem
created_at
```

## 12. Estoque

**estoque**

```text
produto_variacao_id
quantidade_fisica
quantidade_reservada
updated_at
```

```text
quantidade_disponivel = quantidade_fisica - quantidade_reservada
```

**estoque_movimentos**

```text
id
produto_variacao_id
tipo
quantidade
pedido_id
motivo
admin_email
created_at
```

Tipos: `ENTRADA`, `RESERVA`, `LIBERACAO_RESERVA`, `VENDA`, `CANCELAMENTO`, `AJUSTE`

Nunca alterar estoque sem registrar movimento.

## 13. Pedidos

**pedidos**

```text
id
numero
cliente_id
status
valor_total_centavos
expires_at
created_at
updated_at
```

Número público: `PED-000001`, `PED-000002`, … O número público não será utilizado como mecanismo de segurança.

**pedido_itens**

```text
id
pedido_id
produto_variacao_id
produto_nome_snapshot
variacao_nome_snapshot
quantidade
valor_unitario_centavos
subtotal_centavos
created_at
```

O snapshot garante que um pedido antigo continue mostrando o valor e nome originais mesmo se o produto mudar posteriormente.

## 14. Status do pedido

```text
AGUARDANDO_PAGAMENTO
        ↓
       PAGO
        ↓
PRONTO_PARA_RETIRADA
        ↓
     RETIRADO
```

Estados adicionais: `CANCELADO`, `EXPIRADO`, `REEMBOLSADO`, `PAGO_REVISAR`

`PAGO_REVISAR` será utilizado para exceções que necessitem intervenção administrativa.

## 15. Pagamentos

**pagamentos**

```text
id
pedido_id
provider
external_id
idempotency_key
status
valor_centavos
pix_copia_cola
expires_at
paid_at
created_at
updated_at
```

Provider inicialmente: `MERCADO_PAGO`
Status: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `REFUNDED`

## 16. Webhooks

**webhook_events**

```text
id
provider
external_event_id
event_type
payload_hash
processed_at
created_at
```

Deve existir UNIQUE em `provider + external_event_id`. Isso impede processamento duplo.

## 17. Retirada

**retirada_tokens**

```text
id
pedido_id
token_hash
created_at
revoked_at
```

O QR Code deverá conter um token aleatório criptograficamente seguro. O banco guarda apenas `SHA-256(token)`. Nunca guardar apenas `PED-000123` como QR de retirada.

**retiradas**

```text
id
pedido_id
admin_email
data_hora
observacao
created_at
```

O pedido poderá possuir apenas uma retirada válida.

## 18. QR Code do pedido

```text
PAGAMENTO APROVADO
        ↓
gerar token aleatório
        ↓
armazenar hash
        ↓
gerar QR Code
```

QR: `https://loja.igreja.com.br/retirada/<TOKEN>`

Ao abrir normalmente: *"Pedido pronto para apresentação no ponto de retirada."* Nenhuma informação pessoal deve ser exibida publicamente.

Quando escaneado pelo painel administrativo:

```text
QR → token → backend → pedido → cliente → pagamento → retirada
```

## 19. Autenticação do cliente

Cadastro: Nome, CPF, Telefone, PIN. E-mail opcional/condicional — o campo deverá existir porque alguns fluxos de integração de pagamento podem necessitar dele.

Login: CPF + PIN (recomendado 6 dígitos).

Proteções:

```text
HMAC server-side
salt por usuário
pepper secreto
limitação de tentativas
bloqueio temporário
```

Exemplo: máximo 5 tentativas em janela de 15 minutos.

Após autenticação: cookie `HttpOnly`, `Secure`, `SameSite`. Não utilizar localStorage para sessão.

## 20. Autenticação administrativa

Preferência: **Cloudflare Access**.

O Cloudflare Access responde *quem é essa pessoa*; o banco responde *o que essa pessoa pode fazer*.

```text
Cloudflare: maria@igreja.com.br autenticada
D1:         maria@igreja.com.br → perfil = ATENDENTE
```

**ATENDENTE** pode: visualizar pedido, consultar cliente, escanear QR, confirmar retirada.
Não pode: alterar preço, alterar estoque manual, criar administrador, alterar configuração.

**ADMIN**: pode administrar o sistema.

## 21. Rotas públicas

```text
/                 Home/produtos
/produto/:slug    Produto
/entrar           Login
/cadastro         Cadastro
/checkout         Checkout
/pedido/:numero   Pedido
/meus-pedidos     Histórico
```

## 22. Rotas administrativas

```text
/admin
/admin/pedidos
/admin/pedidos/:id
/admin/produtos
/admin/estoque
/admin/clientes
/admin/retirada
/admin/auditoria
/admin/configuracoes
```

## 23. API

**Auth**

```text
POST /api/auth/cadastro
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

**Produtos**

```text
GET /api/produtos
GET /api/produtos/:slug
```

**Pedidos**

```text
POST /api/pedidos
GET  /api/pedidos/:numero
GET  /api/me/pedidos
```

**Pagamentos**

```text
POST /api/pedidos/:numero/pagamento/pix
GET  /api/pedidos/:numero/status
```

**Mercado Pago**

```text
POST /api/webhooks/mercado-pago
```

**Admin**

```text
GET    /api/admin/dashboard
GET    /api/admin/pedidos
GET    /api/admin/pedidos/:id
POST   /api/admin/produtos
PATCH  /api/admin/produtos/:id
POST   /api/admin/estoque/ajuste
POST   /api/admin/retirada/consultar
POST   /api/admin/retirada/confirmar
```

## 24. Criação do pedido

Frontend enviará somente `produto_variacao_id` e `quantidade` — nunca preço confiável.

Backend:

```text
1. validar sessão
2. buscar produto
3. buscar preço no banco
4. conferir produto ativo
5. verificar estoque
6. reservar estoque
7. calcular total
8. criar pedido
9. criar itens
10. gerar número
11. retornar pedido
```

O preço enviado pelo navegador deverá ser ignorado.

## 25. Controle de estoque

```text
Pedido criado:       quantidade_reservada += quantidade
Pagamento aprovado:  quantidade_fisica -= quantidade
                     quantidade_reservada -= quantidade
Pagamento expirado:  quantidade_reservada -= quantidade
```

Assim evitamos vender a mesma camiseta duas vezes.

## 26. Expiração do pedido

Exemplo: 30 minutos (configurável).

Cron: `*/10 * * * *`

A cada período: buscar pedidos expirados → liberar estoque → marcar pedido `EXPIRADO`.

## 27. Mercado Pago

```text
Cliente → Pedido → Worker → Mercado Pago → QR PIX
  → Cliente paga → Mercado Pago → Webhook → Worker → D1 → Pedido = PAGO
```

Toda criação de pagamento deverá utilizar `X-Idempotency-Key`, e essa chave deverá ser persistida.

O Access Token do Mercado Pago **NUNCA** deverá ir para React, browser, GitHub ou arquivo versionado. Ele deverá existir somente como Secret do Worker.

## 28. Webhook Mercado Pago

`POST /api/webhooks/mercado-pago` deverá:

```text
1. receber notificação
2. validar assinatura
3. verificar idempotência
4. consultar Mercado Pago quando necessário
5. localizar pagamento
6. atualizar pagamento
7. atualizar pedido
8. movimentar estoque
9. gerar QR de retirada
10. registrar auditoria
```

Nunca confiar cegamente no JSON recebido.

## 29. Retirada

Tela `/admin/retirada`, botão **ABRIR LEITOR**, câmera abre. Após leitura:

```text
Pedido PED-000184

Cliente    José Roberto
Produto    Camiseta Evento
Tamanho    G
Quantidade 1
Pagamento  PAGO
Retirada   PENDENTE

[ CONFIRMAR RETIRADA ]
```

Após confirmar:

```text
ENTREGUE
12/09/2026 19:54
Por: atendente@igreja.com.br
```

Segunda tentativa com o mesmo QR: **PEDIDO JÁ RETIRADO**. Nunca permitir segunda confirmação.

## 30. PWA

Manifest: `name`, `short_name`, `theme_color`, `background_color`, `icons`, `display=standalone`, `start_url`.

Cache offline somente para: HTML, CSS, JS, ícones, imagens públicas.

Não cachear: login, sessão, pedidos, pagamentos, QR privado, admin, webhook.

Checkout e retirada deverão exigir conexão. Se estiver offline:

```text
Sem conexão.
Não é possível confirmar a retirada.
```

## 31. Painel administrativo

Dashboard: pedidos, pagos, aguardando pagamento, aguardando retirada, retirados, cancelados, faturamento.

Pedidos: número, cliente, CPF mascarado, telefone mascarado, status, pagamento, valor, data.

Filtros: número, nome, CPF, telefone, status, data.

## 32. Produtos

Admin poderá: criar produto, editar produto, ativar/desativar, adicionar imagem, criar variações, definir preço, ordenar tamanhos.

Não excluir fisicamente produto que já tenha pedido — utilizar `ativo = false`.

## 33. Estoque (admin)

Admin poderá lançar: entrada, ajuste positivo, ajuste negativo.

Todo ajuste exige **motivo** e gera `estoque_movimentos` + auditoria.

## 34. Auditoria

**auditoria**

```text
id
actor_type
actor_identifier
action
entity_type
entity_id
metadata_json
created_at
```

Exemplos de ações: `PEDIDO_CRIADO`, `PAGAMENTO_APROVADO`, `ESTOQUE_RESERVADO`, `ESTOQUE_LIBERADO`, `RETIRADA_CONFIRMADA`, `PRODUTO_ALTERADO`, `ESTOQUE_AJUSTADO`, `ADMIN_LOGIN`

## 35. Privacidade

Dados pessoais: nome, CPF, telefone, histórico de compra.

Deverá existir: Política de Privacidade, Termo de Uso, Finalidade do cadastro.

Mascaramento: CPF `***.***.***-42`, telefone `(47) *****-1234`.

## 36. Segurança

Obrigatório:

```text
HTTPS
HttpOnly Cookies
Secure Cookies
SameSite
CSP
Origin validation
input validation (Zod)
prepared SQL statements
rate limiting de login
idempotência
webhook signature validation
audit logs
secrets fora do Git
```

Nunca concatenar parâmetros diretamente em SQL.

## 37. Variáveis e secrets

Bindings: `DB`, `MEDIA`, `ASSETS`

Secrets:

```text
MERCADO_PAGO_ACCESS_TOKEN
MERCADO_PAGO_WEBHOOK_SECRET
SESSION_SECRET
AUTH_PEPPER
DATA_ENCRYPTION_KEY
QR_TOKEN_SECRET
CLOUDFLARE_ACCESS_AUD
```

Configurações não secretas:

```text
APP_NAME
APP_URL
APP_ENV
ORDER_PREFIX
ORDER_EXPIRATION_MINUTES
```

Local: `.dev.vars` (no `.gitignore`). Produção: Cloudflare Secrets.

## 38. Wrangler

```json
{
  "name": "igreja-loja-prod",
  "main": "src/server/index.ts",
  "compatibility_date": "2026-09-12",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  }
}
```

Depois do provisionamento serão adicionados: D1 binding, R2 binding, Cron. IDs reais nunca devem ser inventados.

## 39. Deploy

**Produção**

```text
git push main → GitHub → Cloudflare Workers Builds
  → pnpm install → tests → build → wrangler deploy → produção
```

**Staging**

```text
git push develop → staging Worker
```

## 40. Cloudflare — recursos

```text
Workers:  igreja-loja-prod, igreja-loja-staging
D1:       igreja-loja-prod, igreja-loja-staging
R2:       igreja-loja-media-prod, igreja-loja-media-staging
```

## 41. Domínio

Preferência: `loja.igreja.com.br`

Se o site institucional continuar separado: `www.igreja.com.br` → site atual; `loja.igreja.com.br` → PWA.

Não alterar DNS existente sem antes documentar: A, AAAA, CNAME, MX, TXT, SPF, DKIM, DMARC — para evitar derrubar e-mail/site da igreja.

## 42. Backup

Proteções: D1 Time Travel + export periódico.

Procedimento mensal: exportar banco → criptografar backup → armazenar cópia controlada pela igreja.

Antes de grandes alterações: gerar backup.

Nunca colocar backup com CPF em repositório Git.

## 43. .gitignore

```text
node_modules
dist
.env
.env.*
.dev.vars
*.local
backup/
*.sqlite
.DS_Store
```

Exceto: `.env.example`, `.dev.vars.example`

## 44. Testes

**Unitários:** cálculo de pedido, estoque, status, tokens, autorização.
**Integração:** D1, Mercado Pago mock, webhook, pedido, retirada.
**E2E:** cadastro, login, compra, Pix, pagamento aprovado mockado, QR, retirada.

Ferramentas: Vitest, Playwright.

## 45. Testes críticos

O sistema não estará pronto sem validar:

```text
não vender sem estoque
não confiar no preço do frontend
webhook duplicado não duplica venda
pagamento duplicado não duplica estoque
QR não funciona antes do pagamento
QR não permite duas retiradas
pedido expirado libera estoque
cliente não acessa pedido de outro cliente
atendente não altera preço
segredos não aparecem no frontend
staging não acessa produção
```

## 46. Monitoramento de gratuidade

- **Worker:** requisições dinâmicas/dia, CPU
- **D1:** rows read, rows written, storage
- **R2:** storage, Class A, Class B

Objetivo: permanecer dentro do Free Tier. O sistema deverá utilizar índices adequados para evitar leitura excessiva no D1.

## 47. Índices importantes

```text
clientes.cpf_hash
clientes.telefone_hash
pedidos.numero
pedidos.cliente_id
pedidos.status
pedidos.created_at
pagamentos.external_id
pagamentos.pedido_id
retirada_tokens.token_hash
produto_variacoes.produto_id
estoque_movimentos.produto_variacao_id
```

## 48. Mercado Pago — contas

Criar integração pertencente à igreja. Ambientes `TEST` e `PRODUCTION` — nunca misturar as credenciais.

Webhook produção: `https://loja.igreja.com.br/api/webhooks/mercado-pago`

## 49. Chave Pix estática

A integração principal será Pix dinâmico Mercado Pago.

Opcionalmente poderá existir uma modalidade `PIX_MANUAL` para contingência. Neste caso o pagamento não será automaticamente aprovado e deverá exigir conferência administrativa. Não misturar Pix manual com o processo automático.

## 50. Fases de implementação

**Fase 0 — Governança:** e-mail institucional, GitHub Organization, Cloudflare, Mercado Pago, domínio/subdomínio.

**Fase 1 — Fundação:** repositório, React/Vite, Cloudflare Worker, Hono, D1 local, R2 local, PWA, layout base.

**Fase 2 — Banco:** migrations, clientes, produtos, variações, estoque, pedidos, pagamentos, retiradas, auditoria.

**Fase 3 — Autenticação:** cadastro, login, sessão, logout, proteções, admin.

**Fase 4 — Loja:** home, produto, tamanhos, quantidade, carrinho, checkout.

**Fase 5 — Pedido e estoque:** pedido, número, reserva, expiração, movimentação.

**Fase 6 — Mercado Pago:** Pix, QR Code, Copia e Cola, idempotência, webhook, confirmação.

**Fase 7 — Retirada:** token, QR pedido, scanner, validação, confirmação, auditoria.

**Fase 8 — Administração:** dashboard, pedidos, produtos, clientes, estoque, retiradas.

**Fase 9 — PWA e segurança:** manifest, service worker, cache, offline UX, CSP, headers, hardening.

**Fase 10 — Homologação:** Mercado Pago TEST, staging, celulares, iOS, Android, scanner, estoque.

**Fase 11 — Produção:** D1 production, R2 production, Secrets, Mercado Pago production, Webhook, Cloudflare Access, domínio.

## 51. Critério de go-live

```text
[ ] domínio funcionando
[ ] HTTPS funcionando
[ ] banco production criado
[ ] backup validado
[ ] produto cadastrado
[ ] estoque cadastrado
[ ] Mercado Pago produção funcionando
[ ] webhook validado
[ ] QR Pix validado
[ ] pagamento aprovado automaticamente
[ ] QR de retirada gerado
[ ] scanner funcionando
[ ] dupla retirada bloqueada
[ ] admin protegido
[ ] política de privacidade publicada
[ ] teste real de baixo valor realizado
```

## 52. Propriedade final

```text
IGREJA
│
├── Domínio
├── GitHub Organization
│    └── Repository
│
├── Cloudflare
│    ├── Worker
│    ├── D1
│    ├── R2
│    └── DNS
│
└── Mercado Pago
     ├── Conta
     ├── Aplicação
     └── Credenciais
```

O desenvolvedor será **membro / colaborador**, e não proprietário pessoal da infraestrutura.

## 53. Decisão de arquitetura

Arquitetura aprovada para o MVP:

```text
React + Vite + TypeScript + TanStack Router + Tailwind/shadcn
+ Cloudflare Workers + Cloudflare Static Assets + Hono
+ Cloudflare D1 + Cloudflare R2 + Cloudflare Access
+ Mercado Pago + GitHub Organization
```

Objetivo financeiro inicial: infraestrutura fixa **R$ 0/mês**.

Custos externos permitidos: domínio anual, taxas do meio de pagamento.

A arquitetura deverá permanecer migrável e o código-fonte integralmente sob controle da igreja.
