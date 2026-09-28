# Auditoria funcional — 27/09/2026

## Resultado

O fluxo principal está operacional: catálogo, seleção de tamanhos, carrinho,
checkout, reserva de estoque, Pix, cartão, consulta por CPF, código de
retirada, scanner, confirmação de pagamento, entrega e administração.

## Evidências executadas

- Build de produção com TypeScript e Vite: aprovado.
- Testes unitários: 15 aprovados, 0 falhas.
- Testes de concorrência e invariantes: 30 aprovados, 0 falhas.
- Auditoria de dependências de produção: nenhuma vulnerabilidade conhecida.
- Smoke test online: páginas públicas, PWA, catálogo e APIs responderam 200.
- Admin sem token respondeu 401; sessão administrativa válida e dashboard carregaram.
- Mercado Pago possui Public Key configurada em produção.
- D1 de produção: nenhum pagamento ou retirada com status incoerente.
- Conciliação de estoque: físico e reservado conferem para todos os tamanhos.

## Falhas corrigidas durante a auditoria

1. A identificação de cliente aceitava CPF ou telefone. Reutilizar um telefone
   podia misturar históricos de CPFs diferentes. A identidade agora usa apenas o
   HMAC do CPF, com tratamento para finalizações simultâneas.
2. Depois de cartão recusado, registros rejeitados ou cancelados agora podem
   ser reutilizados com segurança para uma nova tentativa de pagamento.
3. A carga inicial do estoque de produção não possuía movimentos de entrada. Os
   saldos estavam corretos, mas o histórico não os explicava. A carga foi
   registrada de forma idempotente e a conciliação passou.
4. A tela cheia de um pedido já retirado usava um título incorreto. O texto
   agora acompanha o status real.
5. A bateria E2E ainda criava pedidos sem CPF e não cobria troca de pagamento nem
   isolamento entre CPFs com o mesmo telefone. Os testes foram atualizados.

## Riscos operacionais restantes

### Prioridade alta

- Proteger `/admin` com Cloudflare Access e rotacionar o token compartilhado.
- Aplicar limitação de tentativas em consulta por CPF e criação de pedidos.
- Testar restauração de backup do D1 antes de abrir as vendas.

### Prioridade média

- Executar um roteiro periódico no ambiente de testes do Mercado Pago com Pix,
  cartão aprovado, cartão recusado e webhook. A auditoria automática não efetuou
  uma cobrança externa real.
- Dividir o JavaScript por rota. O bundle atual tem cerca de 842 kB minificado
  (238 kB comprimido), funcional, mas maior do que o ideal para redes móveis.

## Limites

Nenhum dado pessoal foi exibido no relatório. As consultas no banco de produção
usaram somente contagens e saldos agregados. A auditoria não realizou pagamentos
reais nem confirmou retiradas de pedidos reais.
