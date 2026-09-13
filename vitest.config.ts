import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

/**
 * Config separada de propósito: o plugin do Cloudflare existe para servir
 * o Worker em desenvolvimento e não tem o que fazer nos testes de unidade —
 * carregá-lo aqui só quebra o Vitest.
 *
 * As invariantes de concorrência não são testadas aqui: elas precisam do
 * banco e do runtime reais, e vivem em `tests/e2e/invariantes.mjs`
 * (`pnpm test:e2e`, com o `pnpm dev` rodando).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@app": fileURLToPath(new URL("./src/app", import.meta.url)),
      "@server": fileURLToPath(new URL("./src/server", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
