import type { CriarPedidoInput } from "../../shared/schemas";
import { novoId, agora, somarMinutos, gerarCodigoRetirada } from "../utils/ids";
import { gerarTokenRetirada, gerarNonce, derivarTokenRetirada, sha256, hmacSha256 } from "../utils/crypto";
import { erro, violouCheck, violouUnique } from "../utils/http";
import { auditar } from "./auditoria.service";
import { exigirContaAtivaParaVendas } from "./conta-pagamento.service";

interface VariacaoLida {
  id: string;
  nome: string;
  valor_centavos: number;
  produto_nome: string;
}

/**
 * Junta itens repetidos do carrinho antes de qualquer coisa.
 * Sem isso, dois "G" separados violariam UNIQUE(pedido_id, variacao_id)
 * e a pessoa veria um erro de banco em vez de comprar duas camisetas.
 */
function consolidarItens(itens: CriarPedidoInput["itens"]) {
  const mapa = new Map<string, number>();
  for (const item of itens) {
    mapa.set(item.produto_variacao_id, (mapa.get(item.produto_variacao_id) ?? 0) + item.quantidade);
  }
  return [...mapa].map(([produto_variacao_id, quantidade]) => ({ produto_variacao_id, quantidade }));
}

/**
 * Aloca o próximo número público.
 *
 * UPDATE ... RETURNING é uma instrução só, portanto atômica: duas
 * requisições simultâneas nunca recebem o mesmo número. Se o pedido
 * falhar depois disso, o número é queimado e fica um buraco na sequência.
 * Buraco em PED-000123 é inofensivo. Número repetido não é.
 */
async function alocarNumero(db: D1Database, prefixo: string): Promise<string> {
  const linha = await db
    .prepare(`UPDATE contadores SET valor = valor + 1 WHERE nome = 'pedido' RETURNING valor`)
    .first<{ valor: number }>();
  if (!linha) throw new Error("Contador de pedidos ausente. Rode as migrations.");
  return `${prefixo}-${String(linha.valor).padStart(6, "0")}`;
}

async function acharOuCriarCliente(
  db: D1Database,
  env: Env,
  cliente: CriarPedidoInput["cliente"],
): Promise<string> {
  const ts = agora();
  const cpfHash = await hmacSha256(env.CPF_PEPPER, cliente.cpf);
  const existente = await db
    // O CPF é a identidade usada para consultar pedidos. Procurar também
    // pelo telefone permitiria que outra pessoa reutilizasse um número e
    // acabasse ligada ao histórico do dono anterior.
    .prepare(`SELECT id FROM clientes WHERE cpf_hash = ?1 LIMIT 1`)
    .bind(cpfHash)
    .first<{ id: string }>();

  if (existente) {
    await db
      .prepare(`UPDATE clientes SET nome = ?1, telefone = ?2, email = COALESCE(?3, email), cpf_hash = ?4, updated_at = ?5 WHERE id = ?6`)
      .bind(cliente.nome, cliente.telefone, cliente.email || null, cpfHash, ts, existente.id)
      .run();
    return existente.id;
  }

  const id = novoId("cli");
  await db
    .prepare(
      `INSERT OR IGNORE INTO clientes (id, nome, telefone, email, cpf_hash, ativo, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6)`,
    )
    .bind(id, cliente.nome, cliente.telefone, cliente.email || null, cpfHash, ts)
    .run();

  // Duas finalizações simultâneas com o mesmo CPF podem chegar aqui antes
  // de qualquer uma enxergar a outra. O índice único escolhe uma linha;
  // ambas continuam usando a identidade vencedora em vez de uma falhar.
  const criado = await db.prepare(`SELECT id FROM clientes WHERE cpf_hash = ?1 LIMIT 1`)
    .bind(cpfHash)
    .first<{ id: string }>();
  if (!criado) throw new Error("Não foi possível identificar o cliente pelo CPF.");
  return criado.id;
}

/**
 * Cria o pedido e reserva o estoque.
 *
 * Tudo o que pode dar errado por concorrência acontece dentro de UM
 * `batch()`. O D1 roda o batch numa transação e desfaz tudo quando uma
 * instrução levanta erro — e a CHECK `quantidade_reservada <= quantidade_fisica`
 * é justamente o que levanta erro quando o estoque não dá.
 *
 * Isso resolve o caso que quebra a implementação ingênua: carrinho com três
 * itens em que o terceiro não tem estoque. Sem a CHECK, os dois primeiros
 * já teriam reservado e não voltariam.
 */
export async function criarPedido(
  db: D1Database,
  env: Env,
  entrada: CriarPedidoInput,
): Promise<{ numero: string; acesso_token: string; codigo_retirada: string }> {
  await exigirContaAtivaParaVendas(db, env);
  const itens = consolidarItens(entrada.itens);
  const ts = agora();

  // 1. Lê preço e disponibilidade do BANCO. O que o navegador mandou de
  //    preço nem existe: o schema Zod é .strict() e recusaria o campo.
  const marcadores = itens.map((_, i) => `?${i + 1}`).join(", ");
  const { results } = await db
    .prepare(
      `SELECT v.id, v.nome, v.valor_centavos, p.nome AS produto_nome
         FROM produto_variacoes v
         JOIN produtos p ON p.id = v.produto_id
        WHERE v.id IN (${marcadores}) AND v.ativo = 1 AND p.ativo = 1`,
    )
    .bind(...itens.map((i) => i.produto_variacao_id))
    .all<VariacaoLida>();

  if (results.length !== itens.length) {
    throw erro(400, "PRODUTO_INDISPONIVEL", "Um dos produtos saiu do catálogo. Revise o carrinho.");
  }

  // 2. Número e cliente, antes do batch.
  const numero = await alocarNumero(db, env.ORDER_PREFIX || "PED");
  const clienteId = await acharOuCriarCliente(db, env, entrada.cliente);

  const pedidoId = novoId("ped");
  const acessoToken = gerarTokenRetirada();
  const acessoHash = await sha256(acessoToken);
  const codigoRetirada = gerarCodigoRetirada();
  const minutos = Number(env.ORDER_EXPIRATION_MINUTES ?? 30) || 30;

  const stmts: D1PreparedStatement[] = [];

  // 3a. Reserva. Repare que o UPDATE não tem WHERE de disponibilidade:
  //     quem recusa é a CHECK do banco. Um UPDATE que casa com zero linhas
  //     seria "sucesso" e não derrubaria o batch — a constraint, sim.
  for (const item of itens) {
    stmts.push(
      db
        .prepare(
          `UPDATE estoque
              SET quantidade_reservada = quantidade_reservada + ?1,
                  updated_at = ?2
            WHERE produto_variacao_id = ?3`,
        )
        .bind(item.quantidade, ts, item.produto_variacao_id),
    );
  }

  // 3b. O pedido.
  stmts.push(
    db
      .prepare(
         `INSERT INTO pedidos
           (id, numero, cliente_id, status, valor_total_centavos,
            acesso_token_hash, codigo_retirada, expires_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'AGUARDANDO_PAGAMENTO', 0, ?4, ?5, ?6, ?7, ?7)`,
      )
      .bind(pedidoId, numero, clienteId, acessoHash, codigoRetirada, somarMinutos(ts, minutos), ts),
  );

  // 3c. Os itens. INSERT ... SELECT lê o preço DE DENTRO da transação,
  //     então nem uma alteração de preço no meio do caminho passa.
  for (const item of itens) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO pedido_itens
             (id, pedido_id, produto_variacao_id, produto_nome_snapshot,
              variacao_nome_snapshot, quantidade, valor_unitario_centavos,
              subtotal_centavos, created_at)
           SELECT ?1, ?2, v.id, p.nome,
                  CASE v.categoria WHEN 'INFANTIL' THEN 'Infantil' ELSE 'Adulto' END || ' · ' || v.nome,
                  ?3, v.valor_centavos,
                  v.valor_centavos * ?3, ?4
             FROM produto_variacoes v
             JOIN produtos p ON p.id = v.produto_id
            WHERE v.id = ?5 AND v.ativo = 1 AND p.ativo = 1`,
        )
        .bind(novoId("itm"), pedidoId, item.quantidade, ts, item.produto_variacao_id),
    );
  }

  // 3d. Histórico de estoque. Nada muda o estoque sem deixar rastro.
  for (const item of itens) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO estoque_movimentos
             (id, produto_variacao_id, tipo, quantidade, pedido_id, motivo, created_at)
           VALUES (?1, ?2, 'RESERVA', ?3, ?4, 'Pedido criado', ?5)`,
        )
        .bind(novoId("mov"), item.produto_variacao_id, item.quantidade, pedidoId, ts),
    );
  }

  // 3e. O total é somado pelo banco, a partir do que foi realmente gravado.
  stmts.push(
    db
      .prepare(
        `UPDATE pedidos
            SET valor_total_centavos =
                  (SELECT COALESCE(SUM(subtotal_centavos), 0) FROM pedido_itens WHERE pedido_id = ?1)
          WHERE id = ?1`,
      )
      .bind(pedidoId),
  );

  try {
    await db.batch(stmts);
  } catch (e) {
    if (violouCheck(e)) {
      throw erro(
        409,
        "ESTOQUE_INSUFICIENTE",
        "Um dos tamanhos acabou de esgotar. Nenhuma peça foi reservada — revise o carrinho.",
      );
    }
    throw e;
  }

  // 4. Conferência: se uma variação tivesse sido desativada entre a leitura
  //    e o batch, o INSERT...SELECT teria gravado zero linhas sem erro.
  //    Nesse caso desfazemos, porque um pedido com item faltando é pior
  //    do que um pedido recusado.
  const conferencia = await db
    .prepare(`SELECT COUNT(*) AS n FROM pedido_itens WHERE pedido_id = ?1`)
    .bind(pedidoId)
    .first<{ n: number }>();

  if (!conferencia || conferencia.n !== itens.length) {
    await cancelarPedido(db, pedidoId, "SISTEMA", "Item indisponível durante a criação");
    throw erro(409, "PRODUTO_INDISPONIVEL", "Um dos produtos saiu do catálogo. Revise o carrinho.");
  }

  await auditar(db, {
    actor_type: "CLIENTE",
    actor_identifier: entrada.cliente.telefone,
    action: "PEDIDO_CRIADO",
    entity_type: "pedido",
    entity_id: pedidoId,
    metadata: { numero, itens: itens.length },
  });

  return { numero, acesso_token: acessoToken, codigo_retirada: codigoRetirada };
}

/**
 * Libera a reserva e marca o pedido. Serve para o cancelamento pelo
 * cliente, para o cancelamento pelo admin e para a expiração do cron.
 *
 * O guard `(SELECT status FROM pedidos ...) = 'AGUARDANDO_PAGAMENTO'`
 * dentro do UPDATE do estoque é o que impede liberar estoque de um pedido
 * que acabou de ser pago (ARQUITETURA §1.11). Se o status mudou, o UPDATE
 * não casa com nada e a liberação simplesmente não acontece.
 */
export async function cancelarPedido(
  db: D1Database,
  pedidoId: string,
  ator: "CLIENTE" | "ADMIN" | "SISTEMA",
  motivo: string,
  novoStatus: "CANCELADO" | "EXPIRADO" = "CANCELADO",
): Promise<boolean> {
  const ts = agora();
  const { results: itens } = await db
    .prepare(`SELECT produto_variacao_id, quantidade FROM pedido_itens WHERE pedido_id = ?1`)
    .bind(pedidoId)
    .all<{ produto_variacao_id: string; quantidade: number }>();

  const stmts: D1PreparedStatement[] = [];

  for (const item of itens) {
    stmts.push(
      db
        .prepare(
          `UPDATE estoque
              SET quantidade_reservada = quantidade_reservada - ?1,
                  updated_at = ?2
            WHERE produto_variacao_id = ?3
              AND (SELECT status FROM pedidos WHERE id = ?4) = 'AGUARDANDO_PAGAMENTO'`,
        )
        .bind(item.quantidade, ts, item.produto_variacao_id, pedidoId),
    );
    stmts.push(
      db
        .prepare(
          `INSERT INTO estoque_movimentos
             (id, produto_variacao_id, tipo, quantidade, pedido_id, motivo, created_at)
           SELECT ?1, ?2, 'LIBERACAO_RESERVA', ?3, ?4, ?5, ?6
            WHERE (SELECT status FROM pedidos WHERE id = ?4) = 'AGUARDANDO_PAGAMENTO'`,
        )
        .bind(novoId("mov"), item.produto_variacao_id, item.quantidade, pedidoId, motivo, ts),
    );
  }

  stmts.push(
    db
      .prepare(
        `UPDATE pedidos SET status = ?1, updated_at = ?2
          WHERE id = ?3 AND status = 'AGUARDANDO_PAGAMENTO'`,
      )
      .bind(novoStatus, ts, pedidoId),
  );

  const resultados = await db.batch(stmts);
  const ultimo = resultados[resultados.length - 1];
  const mudou = (ultimo?.meta?.changes ?? 0) > 0;

  if (mudou) {
    await auditar(db, {
      actor_type: ator,
      action: novoStatus === "EXPIRADO" ? "PEDIDO_EXPIRADO" : "PEDIDO_CANCELADO",
      entity_type: "pedido",
      entity_id: pedidoId,
      metadata: { motivo },
    });
  }
  return mudou;
}

/**
 * Registra o pagamento e libera a retirada.
 *
 * O webhook e o processamento do cartão usam o mesmo caminho. A restrição
 * UNIQUE de pagamentos.pedido_id ajuda a manter a operação idempotente.
 */
export async function registrarPagamento(
  db: D1Database,
  env: Env,
  pedidoId: string,
  opcoes: { provider: "MANUAL" | "MERCADO_PAGO"; adminEmail: string; externalId?: string },
): Promise<{ retirada_token: string }> {
  const ts = agora();

  const pedido = await db
    .prepare(`SELECT id, numero, status, valor_total_centavos FROM pedidos WHERE id = ?1`)
    .bind(pedidoId)
    .first<{ id: string; numero: string; status: string; valor_total_centavos: number }>();

  if (!pedido) throw erro(404, "PEDIDO_NAO_ENCONTRADO", "Pedido não encontrado.");

  if (["PAGO", "PRONTO_PARA_RETIRADA", "RETIRADO"].includes(pedido.status)) {
    const existente = await db
      .prepare(
        `SELECT t.nonce
           FROM pagamentos pg
           JOIN retirada_tokens t ON t.pedido_id = pg.pedido_id AND t.revoked_at IS NULL
          WHERE pg.pedido_id = ?1 AND pg.status = 'APPROVED' LIMIT 1`,
      )
      .bind(pedidoId)
      .first<{ nonce: string }>();
    if (existente) {
      return {
        retirada_token: await derivarTokenRetirada(env.QR_TOKEN_SECRET, pedidoId, existente.nonce),
      };
    }
  }

  if (pedido.status === "EXPIRADO" || pedido.status === "CANCELADO") {
    // O caso do ARQUITETURA §1.11: o dinheiro entrou depois de o estoque
    // ter sido liberado. Ninguém decide isso automaticamente.
    await db
      .prepare(`UPDATE pedidos SET status = 'PAGO_REVISAR', updated_at = ?1 WHERE id = ?2`)
      .bind(ts, pedidoId)
      .run();
    await auditar(db, {
      actor_type: "ADMIN",
      actor_identifier: opcoes.adminEmail,
      action: "PAGAMENTO_APOS_EXPIRACAO",
      entity_type: "pedido",
      entity_id: pedidoId,
      metadata: { status_anterior: pedido.status },
    });
    throw erro(
      409,
      "PAGO_REVISAR",
      "Este pedido já tinha expirado e o estoque foi devolvido. Marcado como PAGO — REVISAR: confira se ainda há peça antes de entregar.",
    );
  }

  if (pedido.status !== "AGUARDANDO_PAGAMENTO") {
    throw erro(409, "STATUS_INVALIDO", `O pedido já está como "${pedido.status}".`);
  }

  const { results: itens } = await db
    .prepare(`SELECT produto_variacao_id, quantidade FROM pedido_itens WHERE pedido_id = ?1`)
    .bind(pedidoId)
    .all<{ produto_variacao_id: string; quantidade: number }>();

  const pagamentoAtual = await db.prepare(
    `SELECT provider, status, external_id FROM pagamentos WHERE pedido_id = ?1 LIMIT 1`,
  ).bind(pedidoId).first<{ provider: string; status: string; external_id: string | null }>();

  // O token do QR não é sorteado nem guardado: é derivado da chave do
  // Worker com um nonce público. Ver utils/crypto.ts.
  const nonce = gerarNonce();
  const token = await derivarTokenRetirada(env.QR_TOKEN_SECRET, pedidoId, nonce);
  const tokenHash = await sha256(token);
  const stmts: D1PreparedStatement[] = [];

  // O UNIQUE em pedido_id faz a segunda tentativa levantar erro e derrubar
  // o batch inteiro, sem ter tocado no estoque. É a idempotência do webhook,
  // garantida pelo banco em vez de por um `if`.
  if (opcoes.provider === "MERCADO_PAGO") {
    stmts.push(
      db
        .prepare(
          `UPDATE pagamentos
              SET status = 'APPROVED', external_id = COALESCE(external_id, ?1),
                  paid_at = ?2, updated_at = ?2
            WHERE pedido_id = ?3 AND provider = 'MERCADO_PAGO' AND status = 'PENDING'`,
        )
        .bind(opcoes.externalId ?? null, ts, pedidoId),
    );
  } else {
    if (pagamentoAtual) {
      if (pagamentoAtual.provider !== "MANUAL" || pagamentoAtual.status !== "PENDING") {
        throw erro(409, "PAGAMENTO_EXISTENTE", "Este pedido já possui outro pagamento em processamento.");
      }
      stmts.push(db.prepare(
        `UPDATE pagamentos SET status = 'APPROVED', paid_at = ?1, updated_at = ?1
          WHERE pedido_id = ?2 AND provider = 'MANUAL' AND status = 'PENDING'`,
      ).bind(ts, pedidoId));
    } else {
      stmts.push(
        db
          .prepare(
            `INSERT INTO pagamentos
               (id, pedido_id, provider, external_id, status, valor_centavos, paid_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 'APPROVED', ?5, ?6, ?6, ?6)`,
          )
          .bind(
            novoId("pag"),
            pedidoId,
            opcoes.provider,
            opcoes.externalId ?? null,
            pedido.valor_total_centavos,
            ts,
          ),
      );
    }
  }

  stmts.push(
    db
      .prepare(
        `UPDATE pedidos SET status = 'PAGO', expires_at = NULL, updated_at = ?1
          WHERE id = ?2 AND status = 'AGUARDANDO_PAGAMENTO'`,
      )
      .bind(ts, pedidoId),
  );

  // Reserva vira venda: sai do físico e sai da reserva ao mesmo tempo.
  for (const item of itens) {
    stmts.push(
      db
        .prepare(
          `UPDATE estoque
              SET quantidade_fisica    = quantidade_fisica - ?1,
                  quantidade_reservada = quantidade_reservada - ?1,
                  updated_at = ?2
            WHERE produto_variacao_id = ?3`,
        )
        .bind(item.quantidade, ts, item.produto_variacao_id),
    );
    stmts.push(
      db
        .prepare(
          `INSERT INTO estoque_movimentos
             (id, produto_variacao_id, tipo, quantidade, pedido_id, motivo, admin_email, created_at)
           VALUES (?1, ?2, 'VENDA', ?3, ?4, 'Pagamento confirmado', ?5, ?6)`,
        )
        .bind(novoId("mov"), item.produto_variacao_id, item.quantidade, pedidoId, opcoes.adminEmail, ts),
    );
  }

  // O QR de retirada só nasce aqui. Antes do pagamento ele não existe —
  // é o que torna impossível retirar sem ter pago.
  stmts.push(
    db
      .prepare(
        `INSERT INTO retirada_tokens (id, pedido_id, nonce, token_hash, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
      )
      .bind(novoId("rtk"), pedidoId, nonce, tokenHash, ts),
  );

  try {
    await db.batch(stmts);
  } catch (e) {
    if (violouUnique(e)) {
      throw erro(409, "JA_PAGO", "Este pedido já tinha pagamento registrado. Nada foi alterado.");
    }
    if (violouCheck(e)) {
      throw erro(
        409,
        "ESTOQUE_INCONSISTENTE",
        "O estoque não comporta esta baixa. Verifique os ajustes manuais recentes.",
      );
    }
    throw e;
  }

  await auditar(db, {
    actor_type: "ADMIN",
    actor_identifier: opcoes.adminEmail,
    action: "PAGAMENTO_APROVADO",
    entity_type: "pedido",
    entity_id: pedidoId,
    metadata: { numero: pedido.numero, provider: opcoes.provider },
  });

  return { retirada_token: token };
}

/** Roda no cron. Devolve ao estoque o que ninguém pagou. */
export async function expirarPedidosVencidos(db: D1Database): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT id FROM pedidos
        WHERE status = 'AGUARDANDO_PAGAMENTO' AND expires_at IS NOT NULL AND expires_at < ?1
        LIMIT 100`,
    )
    .bind(agora())
    .all<{ id: string }>();

  let expirados = 0;
  for (const linha of results) {
    const ok = await cancelarPedido(db, linha.id, "SISTEMA", "Prazo de pagamento esgotado", "EXPIRADO");
    if (ok) expirados++;
  }
  return expirados;
}
