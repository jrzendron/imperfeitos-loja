# Loja PWA da Igreja

Loja de camisetas com catálogo, reserva de estoque, pedido, QR de retirada e
painel administrativo. Roda inteira num Cloudflare Worker, com D1 como banco.

**O que já funciona:** o ciclo completo — catálogo → tamanho → carrinho →
pedido com reserva atômica → confirmação de pagamento → QR de retirada →
scanner → entrega, com bloqueio de retirada dupla. E o cadastro de produtos
pelo painel: criar, editar, tamanhos com preço, estoque inicial e fotos.

**O que ainda não existe:** a integração com o Mercado Pago. No lugar dela,
o admin tem um botão "Confirmar pagamento". Ele chama exatamente a mesma
função do servidor que o webhook vai chamar, inclusive a proteção contra
pagamento duplicado — então ligar o Pix depois é acrescentar quem aperta o
botão, não reescrever o fluxo.

---

## Rodando na sua máquina

Precisa de **Node 20+** e **pnpm**. Não precisa de conta na Cloudflare: o
banco roda local.

```bash
pnpm install

# copie o arquivo de segredos (ele nunca vai para o Git)
cp .dev.vars.example .dev.vars        # Windows: copy .dev.vars.example .dev.vars

# crie o banco local com dados de exemplo
pnpm db:reset

pnpm dev
```

Abre em **http://localhost:5173**.

| Endereço | O quê |
|---|---|
| `/` | Catálogo |
| `/admin` | Painel — entre com o `ADMIN_TOKEN` do seu `.dev.vars`. Abas: Pedidos, Produtos, Estoque, Retirada |
| `/pedido/<token>` | Página do comprador (o link aparece após criar o pedido) |

### Dando uma volta completa

1. Escolha um tamanho, adicione ao carrinho, finalize com nome e telefone.
2. Você cai na página do pedido, com status **Aguardando pagamento**.
   Deixe essa aba aberta.
3. Em outra aba, vá em `/admin`, aba **Pedidos**, e clique em
   **Confirmar pagamento**.
4. Volte à aba do pedido: o QR apareceu sozinho, sem recarregar.
5. No `/admin`, aba **Retirada**, clique em **Abrir leitor** e aponte a
   câmera para o QR. (Sem câmera? Copie o trecho final da URL do QR e
   cole no campo manual.)
6. Confirme a retirada. Tente confirmar de novo: **PEDIDO JÁ RETIRADO**.

---

## Comandos

| Comando | O quê |
|---|---|
| `pnpm dev` | Sobe a aplicação e o Worker juntos |
| `pnpm db:reset` | Recria o banco local e aplica o seed |
| `pnpm db:migrate:local` | Só aplica as migrations pendentes |
| `pnpm test` | Testes de unidade (schemas, formatação) |
| `pnpm test:e2e` | **Bateria de invariantes** — precisa do `pnpm dev` rodando |
| `pnpm build` | Checa tipos e gera o build de produção |

### `pnpm test:e2e` é o teste que importa

Ele ataca o servidor de verdade com requisições **simultâneas**, porque é sob
concorrência que as regras de estoque e pagamento quebram. Um teste que faz
uma requisição por vez passa tranquilamente num sistema que vende a mesma
camiseta duas vezes.

```
1 · Não vender sem estoque (50 requisições simultâneas para 1 peça)
2 · Carrinho parcial não deixa reserva órfã
3 · Não confiar no preço do frontend
4 · QR de retirada não existe antes do pagamento
5 · Pagamento duplicado não duplica estoque (o caso do webhook)
6 · QR não permite duas retiradas
7 · Isolamento e autorização
8 · Pedido expirado libera estoque
9 · Corrida entre o cron e o pagamento
10 · Ajuste de estoque
11 · Conciliação: o estoque é explicado pelo histórico
```

Cobre os testes críticos da §45 da especificação que não dependem do
Mercado Pago. **Rode antes de qualquer deploy.**

---

## A ideia central do código

As regras que não podem ser violadas estão em
[`db/migrations/0001_initial.sql`](db/migrations/0001_initial.sql), como
constraints — não no TypeScript.

O motivo é o D1: ele não tem transação interativa, só `batch()`, que reverte
tudo quando uma instrução **levanta erro**. E um `UPDATE` que casa com zero
linhas não é erro, é sucesso silencioso. Então cada invariante foi escrita
como algo que o SQLite recusa:

| Regra | Quem garante |
|---|---|
| Não vender mais do que existe | `CHECK (quantidade_reservada <= quantidade_fisica)` |
| Não pagar o mesmo pedido duas vezes | `UNIQUE` em `pagamentos.pedido_id` |
| Não entregar o mesmo pedido duas vezes | `UNIQUE` em `retiradas.pedido_id` |
| Não processar o mesmo webhook duas vezes | `UNIQUE (provider, external_event_id)` |

O efeito prático: um carrinho de três itens em que o terceiro está esgotado
não deixa os dois primeiros reservados. O batch inteiro reverte sozinho,
sem nenhuma lógica de compensação para alguém esquecer de escrever.

### Outras decisões que valem saber

**O preço nunca vem do navegador.** O corpo aceito em `POST /api/pedidos`
tem exatamente dois campos por item: `produto_variacao_id` e `quantidade`.
O schema Zod é `.strict()`, então mandar um `valor_centavos` junto faz a
requisição inteira ser recusada com 400. O valor é lido de dentro da
transação, com `INSERT ... SELECT`.

**O token do QR não é guardado.** Ele é derivado:
`HMAC-SHA256(QR_TOKEN_SECRET, pedido_id + ':' + nonce)`. O nonce fica em
texto puro no banco — ele não é segredo, a chave é. Assim o comprador pode
pedir o QR de volta quando quiser (trocou de celular, limpou o histórico) e
mesmo assim um vazamento do D1 sozinho não gera nenhum QR válido.

**O acesso ao pedido é pelo link secreto, não pelo número.** `PED-000184` é
para as pessoas conversarem; ele não abre nada.

**A tela do pedido consulta com intervalo crescente** — 3 s, 8 s, 20 s — e
para em qualquer status final. Trinta minutos consultando a cada 3 s dariam
600 requisições por comprador, e cerca de 170 compradores esgotariam a cota
diária do plano gratuito. Quando o Pix entrar, é essa mesma função que
acompanha o pagamento.

**As fotos encolhem no navegador antes de subir.** Uma foto de celular tem
4 a 8 MB e 4000 px; a loja mostra em 400 px. A tela converte para WebP com
1400 px antes do upload — costuma cair para 100–200 KB, sem diferença visível.
Economiza o 4G de quem compra, o R2, e o tempo de quem cadastra.

**Retirada exige conexão.** Offline, a tela recusa e não enfileira nada para
enviar depois. Enfileirar seria o caminho mais curto para entregar a mesma
peça duas vezes.

---

## Estrutura

```
src/
  app/                  React + TanStack Router + Tailwind
    routes/             Catalogo, Produto, Carrinho, Checkout, Pedido, Admin
    components/         UI, QrCode, Scanner
    lib/                cliente da API, carrinho
  server/               Hono rodando no Worker
    routes/             produtos, pedidos, admin
    services/           pedido, retirada, estoque, auditoria  ← as regras
    middleware/         autenticação do admin
  shared/               schemas Zod, tipos e formatação usados pelos dois lados

db/
  migrations/           SQL versionado. 0001 tem as constraints.
  seeds/                dados de desenvolvimento

tests/
  unit/                 vitest
  e2e/invariantes.mjs   a bateria de concorrência
```

---

## O que falta, na ordem

1. **Mercado Pago** — criar o Pix, exibir o Copia-e-Cola, receber o webhook.
   O webhook chama `registrarPagamento()`, que já existe e já é idempotente.
2. **Cloudflare Access** no `/admin`. Hoje o painel usa um token compartilhado
   do `.dev.vars`, que serve só para desenvolvimento e está marcado como tal
   no código. Ver `src/server/middleware/admin.ts`.
3. **Reordenar fotos** arrastando, e **tela de auditoria**. Os eventos já são
   gravados; falta a tela.

Antes de qualquer deploy em produção, os passos estão na Fase 11 do plano de
execução — principalmente: banco de produção separado do staging, secrets
**novos** (nunca copiados do staging), e backup restaurado com sucesso antes
de abrir as vendas.

---

## Avisos

- **`.dev.vars` nunca vai para o Git.** Já está no `.gitignore`. Confira antes
  do primeiro commit.
- **O `database_id` no `wrangler.jsonc` precisa ser um UUID bem formado**,
  mesmo em desenvolvimento: o runtime local deriva o caminho do arquivo a
  partir dele e falha com `SQLITE_CANTOPEN` se receber texto solto.
- **Este build não coleta CPF** — a identificação é nome + telefone. É a
  decisão D6 do plano, ainda em aberto. Se o CPF entrar depois, ele precisa
  de HMAC com pepper, não de SHA-256 puro: existem só ~1,45 bilhão de CPFs
  válidos, e a tabela completa de hashes se constrói em horas.
