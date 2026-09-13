# LOJA PWA DA IGREJA — Plano de Execução
**Derivado da Especificação Técnica v1.0 · 12/09/2026**

Este plano traduz as Fases 0–11 da spec em ordem operacional. Ele não substitui a
especificação: ela diz *o que* construir, este documento diz *em que ordem, com que
dependência, e o que precisa ser decidido por uma pessoa antes de existir código*.

Três coisas mudam em relação à leitura literal da spec, e estão justificadas ao longo
do texto:

1. **Três spikes de risco sobem para a Fase 1.** Câmera em iOS, Pix ponta a ponta e
   Cloudflare Access são os itens capazes de invalidar a arquitetura. Descobrir isso
   na Fase 10 significa refazer. Descobrir na semana 1 custa dois dias.
2. **O caminho do dinheiro é construído antes da autenticação.** Pedido → estoque →
   Pix → webhook é o núcleo de risco; login é trabalho conhecido. Com um cliente
   semeado no banco, dá para construir o núcleo primeiro.
3. **O limite do D1 virou bloqueio de go-live, não item de monitoramento.** Desde
   1º de setembro de 2026 o D1 passou a *falhar* as queries quando a conta free
   estoura o limite diário, em vez de apenas registrar o excesso. Isso deixou de ser
   uma preocupação de custo e virou uma forma de a loja sair do ar no meio do evento.

---

## 0. O que precisa de decisão humana antes de qualquer código

Estes itens são bloqueantes e nenhum depende de programação. Eles têm o prazo mais
longo e o menor controle do desenvolvedor — comece por eles hoje, em paralelo com a
Fase 1.

### 0.1 Bloqueadores duros

| # | Decisão | Quem decide | Por que bloqueia |
|---|---|---|---|
| D1 | **Qual entidade legal vende.** CNPJ da igreja ou de associação/ministério vinculado. | Liderança + tesouraria | A conta Mercado Pago PJ nasce de um CNPJ. Sem isso não existe credencial de produção, não existe Fase 6 nem Fase 11. |
| D2 | **Tratamento fiscal da venda.** Venda de camiseta por entidade sem fins lucrativos: emite nota? há tributação? | Contador da igreja | Pode exigir campos adicionais no pedido (endereço, CPF do pagador para NF) — ou seja, muda o modelo de dados. Descobrir depois custa migration e retrabalho de UI. |
| D3 | **Conta bancária de saque** vinculada ao Mercado Pago. | Tesouraria | Sem isso o dinheiro fica preso no MP. Não bloqueia o código, bloqueia a operação. |
| D4 | **Quem são os dois administradores** com poder sobre Cloudflare, GitHub e MP. | Liderança | Princípio 7 da spec. Uma pessoa só é ponto único de falha; três ou mais dilui responsabilidade. |
| D5 | **Titularidade do domínio.** Quem é o registrante atual de `igreja.com.br` no registro.br. | Responsável técnico atual | Domínio `.com.br` é registrado sob CNPJ ou CPF. Se estiver no CPF de alguém, a transferência tem prazo próprio e precisa começar cedo. |

### 0.2 Decisões que mudam o modelo de dados

| # | Decisão | Impacto se decidida tarde |
|---|---|---|
| D6 | **O CPF é mesmo necessário?** | Ver §1.3. Se a resposta for "não", some meia dúzia de campos, some a criptografia em repouso, some metade do peso de LGPD. Decidir depois da Fase 2 significa migration + reescrever auth. |
| D7 | **Política de troca de tamanho e reembolso.** | O status `REEMBOLSADO` existe na spec sem fluxo. Se houver troca de tamanho, isso é uma movimentação de estoque entre variações que não está modelada. |
| D8 | **Limite de peças por pessoa.** | Camiseta de evento costuma ter limite. É uma regra de negócio no `POST /api/pedidos` e uma consulta indexada por cliente. Barato agora, chato depois. |
| D9 | **Pedido com múltiplos itens no MVP?** | A spec prevê carrinho. Se o MVP vende uma camiseta em um tamanho, a reserva de estoque fica trivial. Com carrinho, ver §1.1. |

### 0.3 Decisões operacionais do dia do evento

Estas são as que costumam ser esquecidas e as que derrubam a operação.

| # | Decisão | Por quê |
|---|---|---|
| D10 | **Existe sinal de internet no ponto de retirada?** Wi-Fi da igreja alcança? 4G funciona lá dentro? | O princípio 14 proíbe retirada offline, e com razão. Mas se o balcão fica num porão sem sinal, o sistema simplesmente não opera. **Vá ao local e teste com um celular antes de escrever o scanner.** |
| D11 | **Quantos atendentes e quantos celulares** simultâneos na retirada. | Define se uma fila de 200 pessoas escoa. Também define quantos e-mails entram no Cloudflare Access. |
| D12 | **Plano B se a internet cair no meio da entrega.** | As opções honestas são: (a) parar a entrega, (b) anotar em papel e conciliar depois aceitando risco de entrega dupla. Não existe terceira. A liderança precisa escolher *antes*, não no momento. |
| D13 | **Data do evento / abertura das vendas.** | É o número que define o corte de escopo (§6). Sem data, o plano não tem prioridade. |

### 0.4 Provisionamento (execução, não decisão)

Ordem obrigatória — cada um depende do anterior:

```
1. E-mail institucional  (tecnologia@igreja.com.br ou sistemas.<igreja>@gmail.com)
      ↓  com 2FA ativado e recuperação em posse de DOIS responsáveis
2. GitHub Organization   (criada COM esse e-mail, não migrada depois)
      ↓
3. Cloudflare account    (criada COM esse e-mail, 2FA obrigatório)
      ↓
4. Domínio / subdomínio  (ver §0.5 antes de mexer em DNS)
      ↓
5. Mercado Pago          (depende de D1 e D3)
```

> **Regra que não se negocia:** cada conta é criada *já* com o e-mail institucional.
> Criar com e-mail pessoal "só para testar" e migrar depois é a forma mais comum de o
> princípio 1 da spec ser violado na prática — a migração quase nunca acontece.

### 0.5 Antes de tocar no DNS

A spec já alerta (§41). Concretamente, antes de apontar qualquer registro:

```bash
dig igreja.com.br     ANY  +noall +answer
dig igreja.com.br     MX   +short
dig igreja.com.br     TXT  +short
dig _dmarc.igreja.com.br TXT +short
dig www.igreja.com.br CNAME +short
```

Salve a saída num arquivo datado, fora do repositório. Colocar um domínio no
Cloudflare importa os registros automaticamente, mas a importação não é perfeita —
e um MX perdido derruba o e-mail da igreja inteira num domingo.

Se houver qualquer dúvida: **use um subdomínio delegado** (`loja.igreja.com.br` via
CNAME apontando para o Worker) em vez de mover o domínio inteiro para o Cloudflare.
Risco muito menor, custo zero em funcionalidade para este projeto.

---

## 1. Lacunas e riscos da spec v1.0

A spec é sólida — os princípios 10, 11, 13 e 14 já eliminam as classes de erro mais
caras. O que segue são os pontos onde ela está incompleta ou onde a plataforma impõe
uma restrição que ela ainda não absorveu.

### 1.1 Atomicidade da reserva de estoque — o ponto mais crítico

**O problema.** O D1 não tem transação interativa (`BEGIN` … lógica em TypeScript …
`COMMIT`). Só existe `db.batch()`, que roda as instruções numa transação implícita e
faz rollback **quando uma instrução dá erro**. Um `UPDATE` que casa com zero linhas
não é erro — é sucesso com `changes: 0`. Então a escrita ingênua:

```sql
UPDATE estoque
   SET quantidade_reservada = quantidade_reservada + ?
 WHERE produto_variacao_id = ?
   AND quantidade_fisica - quantidade_reservada >= ?;
```

…funciona para um item (basta checar `meta.changes === 1`), mas num carrinho de três
itens onde o terceiro falha, os dois primeiros **já reservaram e não voltam**.

**A solução: deixar o banco recusar.** Coloque a invariante numa `CHECK` constraint.
Aí a violação vira erro de verdade, e o `batch()` desfaz tudo sozinho:

```sql
CREATE TABLE estoque (
  produto_variacao_id  INTEGER PRIMARY KEY REFERENCES produto_variacoes(id),
  quantidade_fisica    INTEGER NOT NULL DEFAULT 0,
  quantidade_reservada INTEGER NOT NULL DEFAULT 0,
  updated_at           TEXT    NOT NULL,

  CHECK (quantidade_fisica    >= 0),
  CHECK (quantidade_reservada >= 0),
  CHECK (quantidade_reservada <= quantidade_fisica)   -- a invariante do negócio
);
```

Com isso, a reserva de um carrinho inteiro é um único `batch()` de `UPDATE`s simples.
Se qualquer linha estourar o estoque, o SQLite levanta `CHECK constraint failed`, o
batch inteiro reverte, e o backend responde 409 sem ter deixado resíduo. É a diferença
entre *tentar acertar a lógica de compensação* e *tornar o estado inválido
impossível de existir*. Prefira sempre a segunda.

> **Teste obrigatório (Fase 5):** com `quantidade_fisica = 1`, disparar 50 requisições
> concorrentes de reserva. Exatamente 1 deve passar. Este teste é o que separa o
> sistema de vender a mesma camiseta duas vezes.

### 1.2 O orçamento de 100.000 requisições/dia — e o polling do Pix

Os limites verificados hoje para o plano gratuito:

| Recurso | Limite free | Observação |
|---|---|---|
| Workers — requisições | **100.000/dia** | Reseta à meia-noite UTC (21h de Brasília) |
| Workers — CPU | **10 ms por requisição** | Ver §1.4 |
| Workers — subrequisições | 50 por invocação | Folgado aqui |
| Workers — Cron Triggers | 5 por conta | Prod + staging = 2. Folgado |
| **Static Assets** | **grátis e ilimitado** | Não conta no limite acima |
| D1 — linhas lidas | **5.000.000/dia** | **Falha as queries ao estourar** |
| D1 — linhas escritas | **100.000/dia** | |
| D1 — armazenamento | 5 GB | |
| D1 — Time Travel | **7 dias** no free (30 no pago) | Ver §1.6 |
| R2 | 10 GB-mês · 1M Classe A · 10M Classe B | Egress grátis |
| Workers Builds | 3.000 min/mês · 1 build simultâneo | |

O achado bom: **os arquivos estáticos são grátis e ilimitados**, e com
`run_worker_first: ["/api/*"]` o Worker nem é invocado para eles. Então a casca do PWA,
CSS, JS e ícones não consomem nada. Só `/api/*` conta.

O achado ruim: **o polling do status do Pix pode sozinho estourar as 100 mil.**

```
Pedido expira em 30 min. Polling a cada 3 s  → 600 requisições por comprador.
170 compradores esperando Pix               → 102.000 requisições. Loja fora do ar.
```

Isso não é hipotético — é o comportamento natural de uma tela "aguardando pagamento"
escrita sem pensar. **Mitigação obrigatória na Fase 6:**

- Backoff: 2 s nos primeiros 30 s (quando a maioria paga), depois 5 s, depois 15 s.
- `document.visibilityState` — parar de consultar com a aba em segundo plano.
- Parar definitivamente em status terminal (`PAGO`, `EXPIRADO`, `CANCELADO`).
- Teto absoluto de consultas por pedido; passando disso, botão "Verificar agora".

Com backoff, o mesmo comprador gasta ~50 requisições em vez de 600 — e 170 compradores
passam a custar 8.500. A margem deixa de ser um problema.

- [ ] Instrumentar um contador de requisições `/api/*` por dia desde a Fase 1, para
      medir isso de verdade antes do evento em vez de estimar.

### 1.3 O CPF é o maior passivo do projeto

A spec trata o CPF com cuidado (hash + criptografado + mascarado). Ainda assim, vale
questionar a premissa, e este é o momento — depois da Fase 2 fica caro.

**Problema técnico.** `cpf_hash` precisa ser **HMAC-SHA256 com pepper secreto**, jamais
SHA-256 puro. Existem cerca de 1,45 bilhão de CPFs válidos; uma tabela de todos os
hashes SHA-256 se constrói em horas num computador comum. Um dump do banco com
`cpf_hash` em SHA-256 puro equivale a um dump com os CPFs em texto claro. O mesmo vale,
com folga ainda maior, para `telefone_hash`.

```
cpf_hash = HMAC-SHA256(key = AUTH_PEPPER, msg = cpf_normalizado)
```

O `AUTH_PEPPER` vive **só como Secret do Worker**, nunca no D1. É o que separa um
vazamento de banco de um vazamento de CPFs.

**Problema jurídico (LGPD).** Coletar CPF exige base legal, finalidade declarada,
prazo de retenção e um caminho para atender pedido de exclusão. Para vender camiseta
com retirada presencial, o CPF não é necessário do ponto de vista funcional — o QR de
retirada (§17–18 da spec) já resolve a identificação, e ele não depende de quem a
pessoa é, só de quem tem o token.

**Alternativa a considerar (D6):** identidade = **telefone + PIN**. O telefone você já
coleta, já serve para avisar o cliente, e tem muito menos peso regulatório. Se o
Mercado Pago exigir CPF do pagador no Pix, ele pode ser enviado ao MP no momento do
pagamento **sem ser persistido no D1**.

Isso não é uma recomendação de descartar o CPF — é um pedido para que a decisão seja
consciente e tomada agora. Se a igreja quiser CPF (para conferência na retirada, por
exemplo), tudo bem; então o plano de LGPD do §9 vira obrigatório.

### 1.4 O teto de 10 ms de CPU dita o hash do PIN

Com 10 ms de CPU por requisição no plano gratuito, **PBKDF2, bcrypt, scrypt e Argon2
estão fora** — qualquer um deles, configurado com custo relevante, estoura o orçamento.
Por isso a spec acerta ao dizer "HMAC server-side": não é preferência, é a única opção.

A consequência precisa estar escrita, porque é desconfortável: um PIN de 6 dígitos são
1.000.000 de combinações, e HMAC-SHA256 é instantâneo. Se o banco **e** o pepper
vazarem juntos, todos os PINs caem em segundos. A segurança do login depende de:

1. O pepper estar em Secret do Worker e nunca no D1 (superfícies de vazamento separadas).
2. Rate limiting real (5 tentativas / 15 min, conforme spec) — é o que impede o ataque online.
3. **Nada de alto valor estar protegido só pelo PIN.** Ver o histórico de pedidos é o
   teto do que esse nível de garantia sustenta. Nenhuma ação administrativa, nunca.

- [ ] Medir o CPU real do endpoint de login na Fase 3 (`wrangler tail` mostra o tempo).

### 1.5 O D1 agora falha — não só avisa

Mudança de 1º de setembro de 2026: ao estourar o limite diário de linhas lidas ou
escritas, o D1 **retorna erro** nas queries até a meia-noite UTC. Antes, seguia
funcionando.

Traduzindo para este projeto: **uma query mal indexada na listagem do admin pode tirar
a loja do ar no dia da venda**, e ela só volta às 21h de Brasília. O §47 da spec (os
índices) deixou de ser otimização e virou requisito de disponibilidade.

- [ ] Todos os índices do §47 criados na migration `0002`, não "depois".
- [ ] `EXPLAIN QUERY PLAN` em toda query de listagem do admin antes do go-live.
      Qualquer `SCAN TABLE` numa tabela que cresce é bug.
- [ ] Paginação obrigatória em `/api/admin/pedidos` — `LIMIT` sempre, sem exceção.
- [ ] Alerta de e-mail do Cloudflare configurado na conta institucional.

### 1.6 Time Travel são 7 dias, não 30

A spec (§42) prevê "D1 Time Travel + export mensal". No plano gratuito o Time Travel
guarda **7 dias**. Com export mensal, existe uma janela de até ~23 dias em que um erro
não é recuperável nem por um nem por outro.

**Correção:** export **semanal** no mínimo; **diário** na semana do evento. O volume é
pequeno, o custo é um comando.

### 1.7 Tabelas que faltam no modelo

| Tabela | Para quê |
|---|---|
| `login_tentativas` | A spec exige rate limiting (§19) mas não modela onde ele mora. `(identificador_hash, ip_hash, created_at)` + limpeza no cron. |
| `configuracoes` | `/admin/configuracoes` existe como tela (§22), mas `ORDER_EXPIRATION_MINUTES` está como variável de ambiente (§37) — mudá-la exigiria deploy. Resolver: tabela no D1, env var só como valor padrão. |
| `webhook_events.payload_raw` | A spec guarda `payload_hash`. Para depurar uma divergência de pagamento às 20h de domingo, você vai querer o corpo. Guarde com TTL curto. |

### 1.8 Fluxos e endpoints que faltam

| Falta | Onde entra |
|---|---|
| **Esqueci meu PIN** | Sem e-mail obrigatório não há auto-serviço. Solução: reset por admin, com auditoria. `POST /api/admin/clientes/:id/reset-pin` |
| **Cancelamento pelo cliente** | Antes de pagar, deve poder desistir e liberar o estoque na hora. |
| **Cancelamento / reembolso pelo admin** | `REEMBOLSADO` existe como status sem nenhum caminho que chegue nele. |
| **Upload de imagem para o R2** | O §23 não tem endpoint. `POST /api/admin/produtos/:id/imagens` |
| **Troca de tamanho** | Depende de D7. É movimentação entre duas variações + auditoria. |
| **Página pública do QR de retirada** | `GET /retirada/:token` é rota de app; falta o endpoint que a alimenta sem vazar dado pessoal (§18). |

### 1.9 Service Worker × Cloudflare Access × PWA

Três armadilhas conhecidas, todas baratas de evitar e caras de descobrir tarde:

1. **O SW cacheia a tela de login do Access.** O Access intercepta antes do Worker e
   responde com um redirect/HTML próprio. Um service worker com fallback de navegação
   genérico guarda isso como se fosse o app, e o atendente passa a ver a tela de login
   para sempre. → Excluir `/admin/*` e `/api/*` do escopo do SW, explicitamente.
2. **A sessão do Access expira com o PWA aberto.** No modo standalone não há barra de
   endereço; o redirect de reautenticação pode ficar preso. → Detectar resposta não-JSON
   em `/api/admin/*` e forçar navegação de topo.
3. **`not_found_handling: single-page-application` + Access.** Verificar a ordem de
   avaliação para que rotas do admin não sejam servidas como HTML do SPA antes do Access
   decidir. É exatamente o que o spike S3 (§2) testa.

### 1.10 Câmera em PWA no iOS

`getUserMedia` em PWA instalado na tela inicial do iOS tem histórico de comportamento
irregular entre versões. Não é uma incógnita grande, mas é **a** funcionalidade que
sustenta toda a Fase 7 e toda a operação da retirada. Testar em hardware real, no iOS
que os atendentes realmente têm, antes de construir em cima. → spike S2.

Plano de contingência, se falhar: entrada manual do código do pedido + conferência, ou
o atendente usando o navegador em vez do app instalado. Ambos degradam a experiência,
nenhum inviabiliza a operação — mas você precisa saber disso na semana 1.

### 1.11 Race: webhook chegando depois do cron

Cenário real: o cliente paga aos 29min50s; o cron roda aos 30min00s e expira o pedido;
o webhook do Mercado Pago chega aos 30min05s. O dinheiro entrou, o estoque foi liberado
e pode já ter sido vendido para outra pessoa.

**Mitigações, todas necessárias:**

- Toda transição de status é `UPDATE` guardado, nunca leitura-depois-escrita:
  ```sql
  UPDATE pedidos SET status = 'PAGO'
   WHERE id = ? AND status = 'AGUARDANDO_PAGAMENTO';
  ```
  Se `changes = 0`, alguém chegou antes — trate, não sobrescreva.
- O `expires_at` do pedido = expiração do Pix no MP **+ margem de 5 min**. O cron nunca
  expira algo ainda pagável.
- Antes de expirar, o cron **consulta o status no MP** para pagamentos `PENDING`. Custa
  uma subrequisição por pedido pendente; o teto é 50 por invocação — processe em lotes.
- Webhook que encontra pedido já `EXPIRADO` → status **`PAGO_REVISAR`**, auditoria, e
  **nenhuma movimentação automática de estoque**. É exatamente para isso que o
  `PAGO_REVISAR` da spec existe. Uma pessoa decide: entrega, ou estorna.
- [ ] Escrever o procedimento humano de `PAGO_REVISAR` (§9) antes do go-live. Um status
      sem procedimento é um pedido perdido.

---

## 2. Os três spikes da semana 1

Um spike é código descartável cujo único objetivo é responder uma pergunta que, se mal
respondida, muda a arquitetura. Rode os três **antes** de construir qualquer tela de
verdade. Custo estimado: 2 a 3 dias somados.

### S1 — Pix ponta a ponta em ambiente TEST

**Pergunta:** consigo criar uma cobrança Pix pelo Worker, exibir o QR, pagar com
credencial de teste e receber o webhook de volta?

**Entrega:** um Worker com dois endpoints e nenhum banco. Cria o pagamento com
`X-Idempotency-Key`, devolve o `qr_code` e o Copia-e-Cola, e loga o webhook recebido.

**Por que primeiro:** é a integração mais externa e menos controlável do projeto.
Valida credenciais, formato da assinatura do webhook, comportamento do ambiente TEST e
a URL pública do webhook de uma vez só. Se houver surpresa, ela aparece aqui.

- [ ] Pagamento criado e QR renderizado
- [ ] Webhook recebido pelo Worker (URL pública, não localhost)
- [ ] Assinatura do webhook validada de verdade
- [ ] Segunda notificação do mesmo evento identificada como duplicada

### S2 — Câmera lendo QR no celular real

**Pergunta:** `@zxing/browser` lê um QR pela câmera traseira num PWA instalado, nos
celulares que os atendentes realmente usam?

**Entrega:** uma página com um botão, a câmera e o texto lido na tela. Publicada num
`*.workers.dev` (precisa ser HTTPS).

**Testar em:** ao menos um iPhone e um Android, **instalados na tela inicial**, não
apenas no navegador. Luz do ambiente parecida com a do ponto de retirada.

- [ ] Lê no Android, navegador
- [ ] Lê no Android, PWA instalado
- [ ] Lê no iOS, Safari
- [ ] **Lê no iOS, PWA instalado** ← o que realmente importa
- [ ] Lê a tela de outro celular (o cliente vai mostrar o QR na tela, não no papel)
- [ ] Permissão de câmera é lembrada entre sessões

### S3 — Cloudflare Access sobre `/admin` sem quebrar o PWA

**Pergunta:** o Access protege `/admin/*` e `/api/admin/*` deixando o resto público, e
o Worker consegue ler a identidade autenticada?

**Entrega:** uma aplicação do Access com política de e-mail, um endpoint que devolve o
e-mail extraído do JWT, e o `/` público sem qualquer autenticação.

- [ ] `/` abre sem login
- [ ] `/admin` exige login
- [ ] `/api/admin/*` protegido (não só a rota visual)
- [ ] O Worker lê e **valida** o JWT do Access (`CLOUDFLARE_ACCESS_AUD` + chaves públicas)
- [ ] Funciona em PWA instalado, no iOS, sem prender no redirect
- [ ] Confirmar quantos usuários o plano Zero Trust gratuito cobre e se os atendentes cabem

> Se S3 falhar ou o número de assentos não fechar, o plano B é autenticação própria de
> admin (e-mail + senha forte + TOTP) no próprio D1. É mais código e mais
> responsabilidade — por isso é plano B, e por isso é bom saber cedo.

---

## 3. Ordem de execução recomendada

Os números das fases são os da spec (vocabulário compartilhado). A **ordem** proposta
difere: constrói-se o caminho do dinheiro antes do login.

```
FASE 0 ─ Governança ────────────────────────────────────┐
(humano, roda em paralelo com tudo abaixo)              │
                                                        │
FASE 1 ─ Fundação + S1 S2 S3 ──┐                        │
                               │                        │
FASE 2 ─ Banco ────────────────┤                        │
                               │                        │
FASE 5 ─ Pedido e estoque ─────┤  ← núcleo de risco     │
                               │                        │
FASE 6 ─ Mercado Pago ─────────┘                        │
                               │                        │
FASE 3 ─ Autenticação ─────────┤                        │
                               │                        │
FASE 4 ─ Loja (UI) ────────────┤                        │
                               │                        │
FASE 7 ─ Retirada ─────────────┤                        │
                               │                        │
FASE 8 ─ Administração ────────┤                        │
                               │                        │
FASE 9 ─ PWA e segurança ──────┘                        │
                               │                        │
FASE 10 ─ Homologação ◄────────┴────────────────────────┘
                               │        (Fase 0 precisa estar concluída aqui)
FASE 11 ─ Produção ────────────┘
```

**Por que 5 e 6 antes de 3 e 4:** com um cliente semeado via SQL, dá para criar pedido,
reservar estoque, gerar Pix e processar webhook sem existir nenhuma tela de login. O
risco concentrado (concorrência de estoque, idempotência, race do webhook) fica resolvido
enquanto ainda há prazo. Login e catálogo são trabalho previsível — são o que se corta
ou simplifica se o prazo apertar, e são péssimos candidatos a ficar por último **se**
forem também onde mora o risco. Aqui não são.

**Fase 0 é a única com prazo fora do seu controle.** Abrir conta PJ no Mercado Pago,
confirmar tratamento fiscal com o contador, transferir titularidade de domínio — tudo
isso depende de terceiros. Comece hoje, mesmo que o código só comece semana que vem.

---

## 4. Detalhamento por fase

Cada fase traz o que entra, o que **não** entra, e o critério objetivo de conclusão.
Uma fase não termina porque "está funcionando" — termina quando o critério passa.

### Fase 1 — Fundação

**Entra:** repositório na Organization, Vite + React + TS, TanStack Router, Tailwind +
shadcn, Worker com Hono servindo `/api/*`, `wrangler.jsonc` com Static Assets, D1 local,
PWA mínimo (manifest + ícones), layout base, Vitest configurado, os três spikes.

**Não entra:** nenhuma regra de negócio, nenhuma tela real.

**Pontos de atenção**

- `run_worker_first: ["/api/*"]` desde o primeiro commit — é o que mantém os assets grátis.
- `.dev.vars` no `.gitignore` **antes** do primeiro secret existir. Um segredo comitado
  não se apaga do histórico sem reescrevê-lo.
- Criar `staging` junto com `prod`, não depois. Ambiente que nasce depois nasce diferente.
- README com o passo a passo de setup local — outro voluntário vai precisar dele.

**Critério de conclusão**

- [ ] `pnpm dev` sobe a aplicação com o Worker respondendo em `/api/health`
- [ ] `pnpm build && wrangler deploy` publica no Worker de staging
- [ ] `*.workers.dev` de staging abre no celular e instala como PWA
- [ ] Os três spikes respondidos e documentados em `docs/`
- [ ] Repositório na Organization da igreja, com dois administradores

### Fase 2 — Banco

**Entra:** migrations SQL versionadas, `db/schema.ts` (Drizzle), seeds de desenvolvimento.

**Pontos de atenção**

- Todos os índices do §47 na migration `0002` — releia §1.5, isso virou disponibilidade.
- As `CHECK` constraints de `estoque` (§1.1) são o coração da correção do sistema.
- `UNIQUE (provider, external_event_id)` em `webhook_events` — é o que impede venda dupla.
- Dinheiro em `INTEGER` de centavos. Nunca `REAL`. O SQLite aceita, e é assim que se
  perde um centavo por pedido até alguém conferir o caixa.
- Datas em ISO-8601 UTC, texto. Converter para horário de Brasília só na exibição.
- `PRAGMA foreign_keys = ON` — o D1 exige que isso seja explícito.
- Incluir as tabelas ausentes do §1.7.

**Critério de conclusão**

- [ ] Migrations aplicam do zero, em ordem, num banco vazio
- [ ] Seed cria 1 produto, 5 variações, estoque e 1 cliente de teste
- [ ] Tentar `quantidade_reservada > quantidade_fisica` falha por CHECK
- [ ] Inserir o mesmo `(provider, external_event_id)` duas vezes falha por UNIQUE
- [ ] `EXPLAIN QUERY PLAN` de toda listagem usa índice

### Fase 5 — Pedido e estoque *(antecipada)*

**Entra:** `POST /api/pedidos`, geração do número público, reserva atômica, cálculo do
total no servidor, expiração por cron, movimentação de estoque com histórico.

**Pontos de atenção**

- O preço **nunca** vem do frontend (§24 da spec, princípio 11). O corpo aceito tem
  exatamente dois campos por item: `produto_variacao_id` e `quantidade`. Valide com Zod
  em modo estrito e rejeite campos extras — assim nem por acidente alguém lê um preço.
- Snapshot de nome e valor em `pedido_itens` no momento da criação.
- Geração do número: `PED-000001` sequencial exige cuidado com concorrência.
  Considere `INTEGER PRIMARY KEY AUTOINCREMENT` formatado na leitura — simples e correto.
- Todo movimento de estoque grava em `estoque_movimentos`. Sem exceção (§12).

**Critério de conclusão**

- [ ] **50 requisições concorrentes para 1 unidade → exatamente 1 pedido criado**
- [ ] Carrinho com 3 itens onde o 3º não tem estoque → nenhum dos 3 reservado
- [ ] Preço adulterado no corpo da requisição é ignorado
- [ ] Cron expira pedido vencido e devolve o estoque
- [ ] Soma de `estoque_movimentos` reconcilia com `estoque` (script de conferência)

### Fase 6 — Mercado Pago *(antecipada)*

**Entra:** criação de Pix, QR + Copia-e-Cola, idempotência persistida, webhook com
validação de assinatura e deduplicação, confirmação automática, geração do token de
retirada.

**Pontos de atenção**

- A `idempotency_key` é gerada e **gravada no D1 antes** da chamada ao MP. Gravar depois
  significa que uma falha de rede no meio deixa você sem saber se cobrou.
- O webhook faz as dez etapas do §28 numa ordem que tolera repetição: dedup primeiro,
  efeito depois.
- Notificação de pagamento que ainda não existe no banco: responda de forma que o MP
  reenvie, ou guarde como evento órfão e reprocesse. Não descarte silenciosamente.
- Toda a lógica de race do §1.11 mora aqui.
- `MERCADO_PAGO_ACCESS_TOKEN` só como Secret do Worker. Nunca no bundle, nunca no Git.
- [ ] Grep no `dist/` procurando o token antes de todo deploy — vira passo do CI.

**Critério de conclusão**

- [ ] Pagamento TEST aprovado → pedido vira `PAGO` sozinho
- [ ] **Webhook duplicado não move estoque duas vezes**
- [ ] Webhook com assinatura inválida é rejeitado
- [ ] Webhook chegando após expiração → `PAGO_REVISAR`, estoque intocado
- [ ] Token de retirada gerado só após aprovação
- [ ] Contagem de requisições de polling medida com backoff ativo (§1.2)

### Fase 3 — Autenticação

**Entra:** cadastro, login, sessão em cookie `HttpOnly`, logout, rate limiting, perfis
de admin lidos do D1 sobre a identidade do Access.

**Pontos de atenção**

- HMAC + salt por usuário + pepper em Secret (§1.4). Medir o CPU.
- Rate limiting **por identificador e por IP** — só por identificador não impede varredura.
- Cookie: `HttpOnly; Secure; SameSite=Lax; Path=/`. Nada de sessão em `localStorage` (§19).
- `token_hash` no banco, jamais o token (§11).
- Autorização de `ATENDENTE` testada por endpoint, não só escondendo botão na tela.
- Fluxo de reset de PIN pelo admin (§1.8), com auditoria.

**Critério de conclusão**

- [ ] 6ª tentativa em 15 min é bloqueada
- [ ] `ATENDENTE` recebe 403 em endpoint de `ADMIN` — testado na API, não na UI
- [ ] Cliente A recebe 404 ao pedir pedido do cliente B
- [ ] Sessão expira e exige novo login
- [ ] CPU do login medido e com folga dentro dos 10 ms

### Fase 4 — Loja

**Entra:** home com catálogo, página de produto, seleção de tamanho, quantidade,
carrinho, checkout.

**Pontos de atenção**

- Tabela de medidas visível na seleção de tamanho. Reduz troca, que é o custo operacional
  mais chato de uma venda de camiseta.
- Mostrar "esgotado" por variação, não só por produto.
- Imagens em WebP, com dimensões declaradas. O R2 é barato, a paciência de quem está no
  4G da igreja não é.
- Estado do carrinho em memória/sessão — o pedido só existe no servidor após o POST.

**Critério de conclusão**

- [ ] Catálogo abre em 3G simulado em menos de 3 s
- [ ] Tamanho esgotado não é selecionável
- [ ] Layout correto em 360 px de largura
- [ ] Checkout leva a um pedido criado no servidor com o valor correto

### Fase 7 — Retirada

**Entra:** rota pública `/retirada/:token`, scanner no admin, consulta, confirmação,
bloqueio de segunda retirada, auditoria.

**Pontos de atenção**

- Token aleatório de alta entropia (32 bytes via `crypto.getRandomValues`), no banco só
  o SHA-256 (§17). Aqui SHA-256 puro está correto — a entropia é alta, não há dicionário.
- A página pública não mostra nada de pessoal (§18). Nem nome, nem valor.
- Confirmação com `UPDATE` guardado: `WHERE pedido_id = ? AND NOT EXISTS (retirada)`.
- Offline → recusar claramente, com a mensagem do §30. Não enfileirar "para enviar depois".
- Tela pensada para uma mão, no escuro, com fila esperando. Fonte grande, alvo grande,
  status em cor.

**Critério de conclusão**

- [ ] **Segundo scan do mesmo QR mostra "PEDIDO JÁ RETIRADO"**
- [ ] Dois atendentes escaneando o mesmo QR ao mesmo tempo → uma retirada só
- [ ] QR de pedido não pago não permite retirada
- [ ] Token inválido ou adulterado → erro genérico, sem vazar existência
- [ ] Modo avião → recusa explícita, sem fila local
- [ ] Testado no celular real do atendente, em pé, com fila

### Fase 8 — Administração

**Entra:** dashboard, lista e detalhe de pedidos, CRUD de produtos, ajuste de estoque
com motivo, consulta de clientes, histórico de retiradas, tela de auditoria.

**Pontos de atenção**

- **Paginação obrigatória em tudo** (§1.5). Uma listagem sem `LIMIT` é um incidente.
- CPF e telefone mascarados por padrão (§35). Revelar exige ação deliberada e gera auditoria.
- Produto com pedido nunca é excluído — `ativo = false` (§32).
- Ajuste de estoque sem motivo é rejeitado no servidor, não só desabilitado no formulário.

**Critério de conclusão**

- [ ] Nenhuma listagem sem `LIMIT`
- [ ] Ajuste sem motivo → 400
- [ ] Toda ação administrativa aparece na auditoria com autor e horário
- [ ] Dashboard carrega com dados de volume realista (semear 2.000 pedidos e medir)

### Fase 9 — PWA e segurança

**Entra:** service worker com estratégia de cache, UX offline, CSP, cabeçalhos de
segurança, revisão final.

**Pontos de atenção**

- A lista de "não cachear" do §30 é literal: login, sessão, pedidos, pagamentos, QR
  privado, admin, webhook. Mais as armadilhas do §1.9.
- CSP sem `unsafe-inline`. Se algo quebrar, corrija o código, não a política.
- `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy` (liberando `camera` só no admin).
- Testar a atualização do SW: publicar uma versão nova com o PWA instalado e conferir
  que o usuário recebe, sem precisar desinstalar.

**Critério de conclusão**

- [ ] Nenhuma resposta autenticada no cache (verificado no DevTools)
- [ ] CSP ativa sem erro no console em todas as telas
- [ ] Deploy novo chega a um PWA já instalado
- [ ] Offline mostra tela útil, não erro do navegador

### Fase 10 — Homologação

**Entra:** rodada completa em staging com credenciais TEST, em dispositivos reais.

**Critério de conclusão** — os onze testes críticos do §45 da spec, cada um executado e
registrado:

- [ ] Não vende sem estoque
- [ ] Não confia no preço do frontend
- [ ] Webhook duplicado não duplica venda
- [ ] Pagamento duplicado não duplica estoque
- [ ] QR não funciona antes do pagamento
- [ ] QR não permite duas retiradas
- [ ] Pedido expirado libera estoque
- [ ] Cliente não acessa pedido de outro cliente
- [ ] Atendente não altera preço
- [ ] Segredos não aparecem no frontend
- [ ] Staging não acessa produção

Mais, deste plano:

- [ ] Ensaio de operação: 10 pessoas comprando e retirando em sequência, **no local real
      do evento, com a internet real do local**
- [ ] Contagem de requisições e linhas lidas do ensaio, extrapolada para o volume esperado

### Fase 11 — Produção

**Pré-requisito:** Fase 0 concluída. Sem CNPJ e conta MP aprovada, esta fase não começa.

**Entra:** D1 e R2 de produção, secrets, credenciais reais do MP, webhook de produção,
Access com os e-mails reais, domínio, primeiro backup.

**Ordem importa**

```
1. Criar D1 e R2 de produção     (bancos separados — princípio 9)
2. Aplicar migrations
3. Configurar todos os secrets   (gerados novos, nunca reaproveitados de staging)
4. Deploy do Worker
5. Domínio e HTTPS
6. Webhook de produção no painel do MP
7. Cloudflare Access com os e-mails reais
8. Cadastrar produto e estoque real
9. Backup inicial + teste de restauração
10. Venda real de valor baixo, do início ao fim
11. Abrir vendas
```

- [ ] Cada secret de produção é **novo**, não copiado do staging
- [ ] `staging` aponta comprovadamente para o banco de staging (§45)
- [ ] Backup restaurado com sucesso num banco descartável — backup não testado não é backup

---

## 5. Go-live: a lista final

A lista do §51 da spec, com os itens que este plano acrescentou:

**Infraestrutura**
- [ ] Domínio resolvendo, HTTPS válido
- [ ] Banco de produção criado, migrations aplicadas, separado do staging
- [ ] Secrets de produção configurados e ausentes do bundle
- [ ] Backup gerado **e restaurado** com sucesso

**Pagamento**
- [ ] Mercado Pago produção ativo, conta bancária vinculada
- [ ] Webhook de produção validado com evento real
- [ ] QR Pix e Copia-e-Cola testados em banco real
- [ ] Venda real de valor baixo, concluída e conferida no extrato

**Operação**
- [ ] Produto e estoque reais cadastrados e conferidos peça a peça
- [ ] Scanner funcionando nos celulares dos atendentes
- [ ] Segunda retirada bloqueada, testado
- [ ] Sinal de internet confirmado **no ponto de retirada** (D10)
- [ ] Atendentes com acesso liberado no Cloudflare Access e treinados
- [ ] Procedimento escrito para `PAGO_REVISAR` (§1.11)
- [ ] Plano B de queda de internet decidido pela liderança (D12)

**Legal**
- [ ] Política de Privacidade publicada e acessível do rodapé
- [ ] Termos de uso publicados
- [ ] Finalidade do cadastro declarada no formulário
- [ ] Canal de contato para pedido de exclusão de dados

**Capacidade**
- [ ] Alerta do Cloudflare configurado no e-mail institucional
- [ ] Polling com backoff medido e dentro do orçamento (§1.2)
- [ ] Nenhuma query de listagem sem índice ou sem `LIMIT`

---

## 6. Se o prazo apertar: o que cortar

Cortar escopo é decisão de engenharia, não fracasso. O que **não** se corta são os itens
que causam prejuízo financeiro ou constrangimento público. Em ordem de sacrifício:

**Corta primeiro, sem dó**
1. Dashboard com métricas → uma listagem de pedidos resolve
2. CRUD de produtos no admin → cadastro por SQL na migration; é um produto
3. Upload de imagem no R2 → imagem estática no `public/`
4. `/admin/clientes` → a busca na tela de pedidos cobre
5. Carrinho com múltiplos itens → uma camiseta por pedido simplifica muita coisa
6. Tela de auditoria → os dados ficam gravados; consulta por SQL quando precisar

**Corta com cuidado**
7. Histórico "meus pedidos" → o link do pedido por WhatsApp cobre
8. Login com PIN → identificação só no checkout, acesso ao pedido pelo link secreto.
   Isso **elimina** a Fase 3 inteira e boa parte do peso de LGPD. Se o prazo estiver
   muito curto, este é o corte de maior retorno — e vale reler a §1.3 antes, porque
   pode ser a decisão certa mesmo sem pressa de prazo.

**Nunca corta**
- Validação de preço no servidor
- Atomicidade da reserva de estoque
- Idempotência do webhook
- Bloqueio de retirada dupla
- Segredos fora do Git
- Bancos separados entre staging e produção
- Política de privacidade

Um sistema que vende uma camiseta por pedido, sem dashboard e sem histórico, mas que
nunca vende estoque que não existe e nunca entrega duas vezes, é um sistema pronto.
O contrário não é.

---

## 7. Itens em aberto

Precisam de resposta antes de este plano virar cronograma:

1. **Qual a data do evento / abertura das vendas?** (D13) É o que define quais cortes
   da §6 entram em vigor.
2. **Quantas peças e quantos tamanhos?** Define o volume e, portanto, se o Free Tier
   se sustenta ou se vale a pena o Workers Paid (US$5/mês) como seguro.
3. **CPF: fica ou sai?** (D6)
4. **Repositório privado com plano pago, ou público sem segredos?** A proteção de branch
   em repositório privado exige GitHub Pro/Team; o repositório público a tem de graça e
   não conflita com o princípio 8 (nenhum segredo no Git). A spec pede privado — vale
   confirmar se é requisito real ou hábito.
5. **Quem opera no dia?** (D11) Define os assentos do Access e o treinamento.

---

## Fontes dos limites citados

Números de plano gratuito mudam. Os da §1.2 foram verificados em 12/09/2026:

- [D1 — Pricing / limites do plano free](https://developers.cloudflare.com/d1/platform/pricing/)
- [D1 — Cobrança do limite diário a partir de 01/09/2026](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/)
- [D1 — Time Travel (7 dias no free, 30 no pago)](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Workers — Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers Static Assets — "requests to static assets are free and unlimited"](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- [R2 — Pricing](https://developers.cloudflare.com/r2/pricing/)
- [Workers Builds — Limits and pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)
- [GitHub — About protected branches (planos que cobrem repositório privado)](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

A taxa do Mercado Pago para recebimento via Pix **não** está citada de propósito: ela
varia por conta e por acordo comercial. Confirme no painel da conta da igreja, depois
que ela existir. É o único custo recorrente do projeto além do domínio.
