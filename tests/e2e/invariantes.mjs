/**
 * Bateria de invariantes — roda contra o servidor DE VERDADE.
 *
 *   Terminal 1:  pnpm db:reset && pnpm dev
 *   Terminal 2:  pnpm test:e2e
 *
 * Estes não são testes de unidade: eles atacam o sistema com requisições
 * concorrentes, porque é sob concorrência que as regras de estoque e de
 * pagamento quebram. Um teste que faz uma requisição por vez passa mesmo
 * num sistema que vende a mesma camiseta duas vezes.
 *
 * Cobre os testes críticos da ARQUITETURA §45 que não dependem do
 * Mercado Pago.
 */

import { execSync } from "node:child_process";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const ADMIN = process.env.ADMIN_TOKEN ?? "dev-token-local";

let passou = 0;
let falhou = 0;
const ok = (nome, condicao, extra = "") => {
  console.log(`  ${condicao ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${nome}${extra ? `  \x1b[2m${extra}\x1b[0m` : ""}`);
  condicao ? passou++ : falhou++;
};
const titulo = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

async function post(caminho, corpo, admin = false) {
  const h = { "Content-Type": "application/json" };
  if (admin) h.Authorization = `Bearer ${ADMIN}`;
  const r = await fetch(BASE + caminho, { method: "POST", headers: h, body: JSON.stringify(corpo ?? {}) });
  return { status: r.status, dados: await r.json().catch(() => ({})) };
}
async function get(caminho, admin = false) {
  const r = await fetch(BASE + caminho, { headers: admin ? { Authorization: `Bearer ${ADMIN}` } : {} });
  return { status: r.status, dados: await r.json().catch(() => ({})) };
}

let sequenciaCliente = 0;
const gerarCpf = (n) => {
  const base = String(100_000_000 + n).slice(-9);
  const digito = (parcial) => {
    let soma = 0;
    for (let i = 0; i < parcial.length; i++) soma += Number(parcial[i]) * (parcial.length + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const primeiro = digito(base);
  return `${base}${primeiro}${digito(`${base}${primeiro}`)}`;
};
const cliente = (n) => {
  const id = ++sequenciaCliente;
  return {
    nome: `Teste ${n} da Silva`,
    telefone: String(47990000000 + id),
    cpf: gerarCpf(id),
  };
};
const disp = async (id) =>
  (await get("/api/produtos")).dados.produtos[0].variacoes.find((v) => v.id === id).disponivel;
const sql = (q) =>
  execSync(`npx wrangler d1 execute igreja-loja --local -y --command "${q}"`, {
    stdio: "ignore",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
const cron = () => fetch(`${BASE}/cdn-cgi/handler/scheduled?cron=*%2F10+*+*+*+*`);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const saude = await get("/api/health").catch(() => null);
if (!saude || saude.status !== 200) {
  console.error(`\nServidor não respondeu em ${BASE}. Rode \`pnpm dev\` em outro terminal.\n`);
  process.exit(1);
}

// ───────────────────────────────────────────────────────────────
titulo("1 · Não vender sem estoque (50 requisições simultâneas para 1 peça)");
{
  const antes = await disp("var_xg");
  if (antes !== 1) {
    console.log(`  \x1b[33m!\x1b[0m XG tem ${antes} em estoque, esperado 1. Rode \`pnpm db:reset\`.`);
  }
  const respostas = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      post("/api/pedidos", { cliente: cliente(i), itens: [{ produto_variacao_id: "var_xg", quantidade: 1 }] }),
    ),
  );
  const criados = respostas.filter((r) => r.status === 201).length;
  const recusados = respostas.filter((r) => r.dados?.erro === "ESTOQUE_INSUFICIENTE").length;
  ok("exatamente 1 pedido criado", criados === 1, `criados=${criados}`);
  ok("os outros 49 recusados por estoque", recusados === 49, `recusados=${recusados}`);
  ok("disponível zerou", (await disp("var_xg")) === 0);
}

titulo("2 · Carrinho parcial não deixa reserva órfã");
{
  const p = await disp("var_p");
  const m = await disp("var_m");
  const r = await post("/api/pedidos", {
    cliente: cliente("carrinho"),
    itens: [
      { produto_variacao_id: "var_p", quantidade: 2 },
      { produto_variacao_id: "var_m", quantidade: 1 },
      { produto_variacao_id: "var_xg", quantidade: 1 },
    ],
  });
  ok("pedido inteiro recusado", r.status === 409, r.dados?.erro ?? "");
  ok("P não foi reservado", (await disp("var_p")) === p);
  ok("M não foi reservado", (await disp("var_m")) === m);
}

titulo("3 · Não confiar no preço do frontend");
{
  const adulterado = await post("/api/pedidos", {
    cliente: cliente("adulterado"),
    itens: [{ produto_variacao_id: "var_g", quantidade: 1, valor_centavos: 1 }],
  });
  ok("campo de preço extra faz a requisição ser recusada", adulterado.status === 400, adulterado.dados?.erro ?? "");

  const limpo = await post("/api/pedidos", {
    cliente: cliente("honesto"),
    itens: [{ produto_variacao_id: "var_g", quantidade: 1 }],
  });
  const { dados } = await get(`/api/pedidos/${limpo.dados.acesso_token}`);
  ok("o valor veio do banco", dados.pedido.valor_total_centavos === 4500, `${dados.pedido.valor_total_centavos} centavos`);
  globalThis.pedidoG = limpo.dados;
}

titulo("4 · QR de retirada não existe antes do pagamento");
{
  const r = await get(`/api/pedidos/${globalThis.pedidoG.acesso_token}/retirada`);
  ok("QR negado enquanto não pago", r.status === 409 && r.dados.erro === "NAO_PAGO", `status=${r.status}`);
}

titulo("5 · Pagamento duplicado não duplica estoque (o caso do webhook)");
{
  let problemas = 0;
  for (let rodada = 1; rodada <= 5; rodada++) {
    const antes = await disp("var_m");
    const novo = await post("/api/pedidos", {
      cliente: cliente("webhook"),
      itens: [{ produto_variacao_id: "var_m", quantidade: 2 }],
    });
    const lista = await get("/api/admin/pedidos?limite=5&status=AGUARDANDO_PAGAMENTO", true);
    const alvo = lista.dados.pedidos.find((p) => p.numero === novo.dados.numero);

    // Seis chamadas ao mesmo tempo, como o Mercado Pago reentregando a notificação.
    const r = await Promise.all(
      Array.from({ length: 6 }, () => post(`/api/admin/pedidos/${alvo.id}/marcar-pago`, null, true)),
    );
    const sucessos = r.filter((x) => x.status === 200).length;
    const baixou = antes - (await disp("var_m"));
    // Uma repetição que chega após o primeiro pagamento pode responder 200
    // com o mesmo QR: isso é idempotência, desde que haja uma única baixa.
    if (sucessos < 1 || baixou !== 2) {
      problemas++;
      console.log(`    rodada ${rodada}: sucessos=${sucessos}, baixa=${baixou}, respostas=${r.map((x) => x.status).join(",")}`);
    }
  }
  ok("5 rodadas de 6 pagamentos simultâneos, nenhuma venda duplicada", problemas === 0, `rodadas com erro=${problemas}`);
}

titulo("6 · QR não permite duas retiradas");
{
  const lista = await get("/api/admin/pedidos?limite=100&status=AGUARDANDO_PAGAMENTO", true);
  const alvo = lista.dados.pedidos.find((p) => p.numero === globalThis.pedidoG.numero);
  await post(`/api/admin/pedidos/${alvo.id}/marcar-pago`, null, true);

  const qr = await get(`/api/pedidos/${globalThis.pedidoG.acesso_token}/retirada`);
  ok("QR liberado depois de pago", qr.status === 200 && typeof qr.dados.token === "string");

  const qr2 = await get(`/api/pedidos/${globalThis.pedidoG.acesso_token}/retirada`);
  ok("o token é derivado, não sorteado (estável entre consultas)", qr2.dados.token === qr.dados.token);

  const token = qr.dados.token;
  const simultaneas = await Promise.all([
    post("/api/admin/retirada/confirmar", { token }, true),
    post("/api/admin/retirada/confirmar", { token }, true),
  ]);
  ok(
    "dois atendentes escaneando ao mesmo tempo: uma retirada só",
    simultaneas.filter((r) => r.status === 200).length === 1,
  );

  const terceira = await post("/api/admin/retirada/confirmar", { token }, true);
  ok("terceira tentativa bloqueada", terceira.status >= 400, `status=${terceira.status}`);
  ok("QR revogado após a entrega", (await post("/api/admin/retirada/consultar", { token }, true)).status === 404);
}

titulo("7 · Isolamento e autorização");
{
  const t = await post("/api/admin/retirada/consultar", { token: "x".repeat(40) }, true);
  ok("token inventado não abre nada", t.status === 404 && t.dados.erro === "QR_INVALIDO");

  ok("admin exige token", (await fetch(BASE + "/api/admin/pedidos")).status === 401);
  ok(
    "token errado é recusado",
    (await fetch(BASE + "/api/admin/pedidos", { headers: { Authorization: "Bearer errado" } })).status === 401,
  );

  const clienteA = cliente("isolamento A");
  const a = await post("/api/pedidos", { cliente: clienteA, itens: [{ produto_variacao_id: "var_p", quantidade: 1 }] });
  ok("o número público não abre o pedido", (await get(`/api/pedidos/${a.dados.numero}`)).status === 404);

  const clienteB = cliente("isolamento B");
  clienteB.telefone = clienteA.telefone;
  const b = await post("/api/pedidos", { cliente: clienteB, itens: [{ produto_variacao_id: "var_p", quantidade: 1 }] });
  const pedidosB = await post("/api/pedidos/consultar-cpf", { cpf: clienteB.cpf });
  ok(
    "reutilizar um telefone não mistura históricos de CPFs diferentes",
    pedidosB.status === 200 && pedidosB.dados.pedidos.every((p) => p.numero !== a.dados.numero),
  );

  const dinheiroRemovido = await post(`/api/pedidos/${b.dados.acesso_token}/dinheiro`, null);
  ok("pagamento em dinheiro não está disponível", dinheiroRemovido.status === 404);
  await post(`/api/pedidos/${a.dados.acesso_token}/cancelar`, null);
  await post(`/api/pedidos/${b.dados.acesso_token}/cancelar`, null);
}

titulo("8 · Pedido expirado libera estoque");
{
  const antes = await disp("var_g");
  const novo = await post("/api/pedidos", {
    cliente: cliente("expira"),
    itens: [{ produto_variacao_id: "var_g", quantidade: 4 }],
  });
  ok("reserva aplicada", (await disp("var_g")) === antes - 4);

  sql(`UPDATE pedidos SET expires_at='2020-01-01T00:00:00.000Z' WHERE numero='${novo.dados.numero}'`);
  await cron();
  await espera(600);

  ok("pedido marcado como EXPIRADO", (await get(`/api/pedidos/${novo.dados.acesso_token}`)).dados.pedido?.status === "EXPIRADO");
  ok("estoque devolvido", (await disp("var_g")) === antes);

  await cron();
  await espera(400);
  ok("cron rodando de novo não devolve em dobro", (await disp("var_g")) === antes);
}

titulo("9 · Corrida entre o cron e o pagamento");
{
  let incoerentes = 0;
  for (let i = 0; i < 4; i++) {
    const antes = await disp("var_m");
    const novo = await post("/api/pedidos", { cliente: cliente("corrida"), itens: [{ produto_variacao_id: "var_m", quantidade: 1 }] });
    const lista = await get("/api/admin/pedidos?limite=5&status=AGUARDANDO_PAGAMENTO", true);
    const alvo = lista.dados.pedidos.find((p) => p.numero === novo.dados.numero);
    sql(`UPDATE pedidos SET expires_at='2020-01-01T00:00:00.000Z' WHERE id='${alvo.id}'`);

    await Promise.all([cron(), post(`/api/admin/pedidos/${alvo.id}/marcar-pago`, null, true)]);
    await espera(400);

    const depois = await disp("var_m");
    const status = (await get(`/api/admin/pedidos/${alvo.id}`, true)).dados.pedido?.status;

    // Só dois desfechos são aceitáveis, e ambos são consistentes:
    //   pagou   -> estoque baixou 1 e o pedido está PAGO
    //   expirou -> estoque voltou e o pedido está EXPIRADO ou PAGO_REVISAR
    const coerente =
      (status === "PAGO" && depois === antes - 1) ||
      ((status === "EXPIRADO" || status === "PAGO_REVISAR") && depois === antes);
    if (!coerente) incoerentes++;
  }
  ok("nenhum desfecho incoerente", incoerentes === 0, `incoerentes=${incoerentes}`);
}

titulo("10 · Ajuste de estoque");
{
  const p = await disp("var_p");
  const ajuste = await post("/api/admin/estoque/ajuste", { produto_variacao_id: "var_p", delta: 5 }, true);
  ok(
    "ajuste simplificado não exige motivo",
    ajuste.status === 200 && (await disp("var_p")) === p + 5,
  );
  ok(
    "baixa impossível é recusada pela CHECK",
    (await post("/api/admin/estoque/ajuste", { produto_variacao_id: "var_p", delta: -9999, motivo: "Limite" }, true)).status === 409,
  );
}

titulo("11 · Conciliação: o estoque é explicado pelo histórico");
{
  const saida = execSync(
    `npx wrangler d1 execute igreja-loja --local -y --json --command "` +
      `SELECT v.id, e.quantidade_fisica, e.quantidade_reservada, ` +
      ` (SELECT COALESCE(SUM(CASE WHEN tipo IN ('ENTRADA','AJUSTE') THEN quantidade WHEN tipo='VENDA' THEN -quantidade ELSE 0 END),0) ` +
      `  FROM estoque_movimentos m WHERE m.produto_variacao_id=v.id) AS calculado, ` +
      ` (SELECT COALESCE(SUM(i.quantidade),0) FROM pedido_itens i JOIN pedidos p ON p.id=i.pedido_id ` +
      `  WHERE i.produto_variacao_id=v.id AND p.status='AGUARDANDO_PAGAMENTO') AS reservado_real ` +
      `FROM produto_variacoes v JOIN estoque e ON e.produto_variacao_id=v.id"`,
    { encoding: "utf8", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
  );
  const linhas = JSON.parse(saida.slice(saida.indexOf("[")))[0].results;
  let erros = 0;
  for (const l of linhas) {
    const bom = l.quantidade_fisica === l.calculado && l.quantidade_reservada === l.reservado_real;
    if (!bom) erros++;
    console.log(
      `    \x1b[2m${l.id.padEnd(8)} físico ${String(l.quantidade_fisica).padStart(3)}/${String(l.calculado).padStart(3)}` +
        `   reservado ${String(l.quantidade_reservada).padStart(3)}/${String(l.reservado_real).padStart(3)}\x1b[0m  ${bom ? "" : "DIVERGE"}`,
    );
  }
  ok("nenhuma divergência", erros === 0);
}

titulo("12 · Reembolso manual retira do caixa e devolve estoque uma vez");
{
  const antesEstoque = await disp("var_p");
  const antesCaixa = (await get("/api/admin/dashboard", true)).dados.faturamento_centavos;
  const novo = await post("/api/pedidos", {
    cliente: cliente("reembolso"), itens: [{ produto_variacao_id: "var_p", quantidade: 2 }],
  });
  const lista = await get("/api/admin/pedidos?limite=100&status=AGUARDANDO_PAGAMENTO", true);
  const alvo = lista.dados.pedidos.find((p) => p.numero === novo.dados.numero);
  await post(`/api/admin/pedidos/${alvo.id}/marcar-pago`, null, true);
  const qr = await get(`/api/pedidos/${novo.dados.acesso_token}/retirada`);
  ok("venda reduz estoque e aumenta caixa", (await disp("var_p")) === antesEstoque - 2 &&
    (await get("/api/admin/dashboard", true)).dados.faturamento_centavos === antesCaixa + 9000);
  const semConfirmacao = await post(`/api/admin/pedidos/${alvo.id}/cancelar`, {}, true);
  ok("reembolso manual exige confirmação de devolução", semConfirmacao.status === 400);
  const devolvido = await post(`/api/admin/pedidos/${alvo.id}/cancelar`, { reembolso_manual_confirmado: true }, true);
  const painel = await get("/api/admin/dashboard", true);
  ok("pedido e pagamento marcados como reembolsados", devolvido.status === 200 &&
    (await get(`/api/admin/pedidos/${alvo.id}`, true)).dados.pedido.status === "REEMBOLSADO");
  ok("caixa e estoque voltam aos valores anteriores", painel.dados.faturamento_centavos === antesCaixa &&
    (await disp("var_p")) === antesEstoque);
  await post(`/api/admin/pedidos/${alvo.id}/cancelar`, { reembolso_manual_confirmado: true }, true);
  ok("repetição não duplica reposição", (await disp("var_p")) === antesEstoque);
  ok("QR revogado no reembolso", (await post("/api/admin/retirada/consultar", { token: qr.dados.token }, true)).status === 404);
}

titulo("13 · Entrega pelo gerenciador é única e impede reposição indevida");
{
  const novo = await post("/api/pedidos", {
    cliente: cliente("entrega admin"), itens: [{ produto_variacao_id: "var_g", quantidade: 1 }],
  });
  const lista = await get("/api/admin/pedidos?limite=100&status=AGUARDANDO_PAGAMENTO", true);
  const alvo = lista.dados.pedidos.find((p) => p.numero === novo.dados.numero);
  await post(`/api/admin/pedidos/${alvo.id}/marcar-pago`, null, true);
  const antes = await disp("var_g");
  const entrega = await post(`/api/admin/pedidos/${alvo.id}/entregar`, {}, true);
  const segunda = await post(`/api/admin/pedidos/${alvo.id}/entregar`, {}, true);
  const cancelamento = await post(`/api/admin/pedidos/${alvo.id}/cancelar`, { reembolso_manual_confirmado: true }, true);
  ok("entrega registra responsável e data", entrega.status === 200 &&
    Boolean((await get(`/api/admin/pedidos/${alvo.id}`, true)).dados.pedido.retirado_em));
  ok("segunda entrega e cancelamento após entrega bloqueados", segunda.status === 409 && cancelamento.status === 409);
  ok("peça entregue não volta ao estoque", (await disp("var_g")) === antes);
}

titulo("14 · Entrega e reembolso simultâneos não se sobrepõem");
{
  const antes = await disp("var_p");
  const novo = await post("/api/pedidos", {
    cliente: cliente("corrida entrega reembolso"), itens: [{ produto_variacao_id: "var_p", quantidade: 1 }],
  });
  const lista = await get("/api/admin/pedidos?limite=100&status=AGUARDANDO_PAGAMENTO", true);
  const alvo = lista.dados.pedidos.find((p) => p.numero === novo.dados.numero);
  await post(`/api/admin/pedidos/${alvo.id}/marcar-pago`, null, true);
  const [entrega, reembolso] = await Promise.all([
    post(`/api/admin/pedidos/${alvo.id}/entregar`, {}, true),
    post(`/api/admin/pedidos/${alvo.id}/cancelar`, { reembolso_manual_confirmado: true }, true),
  ]);
  const pedidoFinal = (await get(`/api/admin/pedidos/${alvo.id}`, true)).dados.pedido;
  const estoqueFinal = await disp("var_p");
  const coerente =
    (pedidoFinal.status === "RETIRADO" && entrega.status === 200 && reembolso.status !== 200 && estoqueFinal === antes - 1) ||
    (pedidoFinal.status === "REEMBOLSADO" && reembolso.status === 200 && entrega.status !== 200 && estoqueFinal === antes);
  ok("ou entrega, ou reembolso; estoque acompanha o desfecho", coerente,
    `pedido=${pedidoFinal.status}, entrega=${entrega.status}, reembolso=${reembolso.status}, estoque=${estoqueFinal}`);
}

console.log(
  `\n${"─".repeat(52)}\n  \x1b[1m${passou} passaram\x1b[0m · ${falhou ? `\x1b[31m${falhou} falharam\x1b[0m` : "0 falharam"}\n${"─".repeat(52)}\n`,
);
process.exit(falhou ? 1 : 0);
