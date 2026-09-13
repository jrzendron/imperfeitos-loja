#!/usr/bin/env node
// Aplica as migrations em ordem, local ou remoto.
//   node scripts/migrate.mjs local
//   node scripts/migrate.mjs remote
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const alvo = process.argv[2] ?? "local";
if (!["local", "remote"].includes(alvo)) {
  console.error("Uso: node scripts/migrate.mjs <local|remote>");
  process.exit(1);
}

const dir = "db/migrations";
const arquivos = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

if (arquivos.length === 0) {
  console.error("Nenhuma migration encontrada em " + dir);
  process.exit(1);
}

for (const arquivo of arquivos) {
  process.stdout.write(`→ ${arquivo} ... `);
  const r = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", "igreja-loja", `--${alvo}`, "--file", join(dir, arquivo), "-y"],
    { stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" }
  );
  if (r.status !== 0) {
    console.log("FALHOU");
    process.stderr.write(r.stderr?.toString() ?? "");
    process.exit(r.status ?? 1);
  }
  console.log("ok");
}
console.log(`\nMigrations aplicadas (${alvo}).`);
