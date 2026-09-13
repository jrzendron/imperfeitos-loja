#!/usr/bin/env node
/**
 * Recria o banco LOCAL: derruba as tabelas, reaplica as migrations e roda o seed.
 *
 * Faz isso por SQL, e não apagando `.wrangler/state`. Remover o diretório
 * por fora deixa o runtime local com referência a um arquivo que não existe
 * mais, e o próximo `pnpm dev` morre com SQLITE_CANTOPEN.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const shell = process.platform === "win32";
const run = (cmd, args, silencioso = false) => {
  const r = spawnSync(cmd, args, {
    stdio: silencioso ? ["ignore", "pipe", "pipe"] : "inherit",
    shell,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  if (r.status !== 0 && !silencioso) process.exit(r.status ?? 1);
  return r;
};

/**
 * Ordem de derrubada: filha antes da mãe, sempre.
 *
 * O D1 ignora `PRAGMA foreign_keys = OFF`, então não dá para desligar a
 * checagem e apagar em qualquer ordem — cada DROP precisa vir depois de
 * todas as tabelas que apontam para ela. `estoque_movimentos` referencia
 * `pedidos`, por exemplo, e por isso cai antes.
 */
const TABELAS = [
  "auditoria",
  "retiradas",
  "retirada_tokens",
  "webhook_events",
  "pagamentos",
  "pedido_itens",
  "estoque_movimentos",
  "pedidos",
  "estoque",
  "produto_imagens",
  "produto_variacoes",
  "produtos",
  "clientes",
  "contadores",
  "configuracoes",
];

const arquivo = join(tmpdir(), `igreja-loja-drop-${Date.now()}.sql`);
writeFileSync(arquivo, TABELAS.map((t) => `DROP TABLE IF EXISTS ${t};`).join("\n"));

console.log("Derrubando tabelas…");
const derrubada = run("npx", ["wrangler", "d1", "execute", "igreja-loja", "--local", "--file", arquivo, "-y"], true);
unlinkSync(arquivo);
if (derrubada.status !== 0) {
  console.error("Falha ao derrubar as tabelas:\n" + (derrubada.stderr?.toString() ?? ""));
  process.exit(derrubada.status ?? 1);
}

run("node", ["scripts/migrate.mjs", "local"]);

console.log("Aplicando seed…");
run("npx", ["wrangler", "d1", "execute", "igreja-loja", "--local", "--file", "db/seeds/development.sql", "-y"], true);

console.log("\nBanco local pronto com dados de desenvolvimento.");
console.log("Se o `pnpm dev` já estava rodando, reinicie-o.");
