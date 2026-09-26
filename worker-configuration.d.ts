/// <reference types="@cloudflare/workers-types" />

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  MEDIA: R2Bucket;

  // Secrets (.dev.vars em desenvolvimento, Cloudflare Secrets em produção)
  ADMIN_TOKEN: string;
  QR_TOKEN_SECRET: string;
  MERCADO_PAGO_ACCESS_TOKEN: string;
  MERCADO_PAGO_WEBHOOK_SECRET: string;

  // Configurações não secretas (wrangler.jsonc -> vars)
  APP_NAME: string;
  APP_ENV: string;
  ORDER_PREFIX: string;
  ORDER_EXPIRATION_MINUTES: string;
}
