import { Hono } from "hono";
import { produtosRouter } from "./routes/produtos";
import { pedidosRouter } from "./routes/pedidos";
import { adminRouter } from "./routes/admin";
import { midiaRouter } from "./routes/midia";
import { tratarErro } from "./utils/http";
import { expirarPedidosVencidos } from "./services/pedido.service";
import { webhookMercadoPago } from "./routes/webhook";
import { credenciaisPagamento } from "./services/conta-pagamento.service";

const app = new Hono<{ Bindings: Env }>();

/** Cabeçalhos de segurança em toda resposta produzida pelo Worker. */
app.use("*", async (c, next) => {
  await next();
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; connect-src 'self' https://api.mercadopago.com https://api-static.mercadopago.com https://*.mercadopago.com https://api.mercadolibre.com https://http2.mlstatic.com; font-src 'self' data: https://http2.mlstatic.com; form-action 'self'; frame-ancestors 'none'; frame-src https://*.mercadopago.com https://maps.google.com https://www.google.com; img-src 'self' data: blob: https://*.mercadopago.com https://http2.mlstatic.com; manifest-src 'self'; media-src 'self' blob:; object-src 'none'; script-src 'self' https://sdk.mercadopago.com https://www.mercadopago.com https://http2.mlstatic.com; style-src 'self' 'unsafe-inline' https://http2.mlstatic.com; worker-src 'self' blob:",
  );
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(self), geolocation=(), microphone=()");
  // Nada da API pode ser guardado em cache: pedidos, sessões e QR privados
  // nunca entram no service worker (ARQUITETURA §30). As fotos são a única
  // exceção — elas são públicas e imutáveis, e definem o próprio cabeçalho.
  if (!c.req.path.startsWith("/api/midia/")) c.header("Cache-Control", "no-store");
});

app.get("/api/health", (c) =>
  c.json({ ok: true, app: c.env.APP_NAME, ambiente: c.env.APP_ENV, agora: new Date().toISOString() }),
);

app.get("/api/pagamentos/config", async (c) => {
  const conta = await credenciaisPagamento(c.env.DB, c.env);
  return c.json({ mercado_pago_public_key: conta.publicKey || null });
});

app.route("/api/produtos", produtosRouter);
app.route("/api/pedidos", pedidosRouter);
app.route("/api/midia", midiaRouter);
app.route("/api/admin", adminRouter);
app.route("/api/webhooks", webhookMercadoPago);

app.onError(tratarErro);

app.notFound((c) =>
  c.req.path.startsWith("/api/")
    ? c.json({ erro: "ROTA_NAO_ENCONTRADA", mensagem: "Rota não encontrada." }, 404)
    : c.env.ASSETS.fetch(c.req.raw),
);

export default {
  fetch: app.fetch,

  /**
   * Cron a cada 10 minutos: devolve ao estoque o que ninguém pagou.
   *
   * Quando o Mercado Pago entrar, este handler ganha uma etapa a mais —
   * consultar o status no MP antes de expirar um pagamento PENDING, para
   * não derrubar um pedido que a pessoa acabou de pagar (ARQUITETURA §1.11).
   */
  async scheduled(_evento: ScheduledController, env: Env) {
    const expirados = await expirarPedidosVencidos(env.DB);
    if (expirados > 0) console.log(`Cron: ${expirados} pedido(s) expirado(s), estoque devolvido.`);
  },
} satisfies ExportedHandler<Env>;
