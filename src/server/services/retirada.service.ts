import { novoId, agora } from "../utils/ids";
import { sha256, derivarTokenRetirada } from "../utils/crypto";
import { erro, violouUnique } from "../utils/http";
import { auditar } from "./auditoria.service";
import { STATUS_RETIRAVEL, type StatusPedido } from "../../shared/types";

export interface ConsultaRetirada {
  pedido_id: string;
  numero: string;
  status: StatusPedido;
  cliente_nome: string;
  cliente_telefone: string;
  valor_total_centavos: number;
  itens: { produto_variacao_id: string; produto_nome: string; variacao_nome: string; descricao: string; quantidade: number }[];
  pago: boolean;
  pagamento_provider: string | null;
  retirado_em: string | null;
  retirado_por: string | null;
  pode_retirar: boolean;
  impedimento: string | null;
}

async function pedidoPorToken(db: D1Database, token: string) {
  const texto = token.trim();
  let codigo = texto;
  try {
    const url = new URL(texto);
    codigo = url.pathname.split("/").filter(Boolean).at(-1) ?? texto;
  } catch {
    // Entrada manual: já é o código/token.
  }

  if (/^RET-[2-9A-HJ-NP-Z]{8}$/i.test(codigo)) {
    const porCodigo = await db
      .prepare(
        `SELECT p.id, p.numero, p.status, p.valor_total_centavos,
                c.nome AS cliente_nome, c.telefone AS cliente_telefone,
                pg.status AS pagamento_status, pg.provider AS pagamento_provider,
                r.data_hora AS retirado_em, r.admin_email AS retirado_por
           FROM pedidos p
           JOIN clientes c ON c.id = p.cliente_id
           LEFT JOIN pagamentos pg ON pg.pedido_id = p.id
           LEFT JOIN retiradas r ON r.pedido_id = p.id
          WHERE p.codigo_retirada = ?1
          LIMIT 1`,
      )
      .bind(codigo.toUpperCase())
      .first<{
        id: string; numero: string; status: StatusPedido; valor_total_centavos: number;
        cliente_nome: string; cliente_telefone: string; pagamento_status: string | null; pagamento_provider: string | null;
        retirado_em: string | null; retirado_por: string | null;
      }>();
    if (porCodigo) return porCodigo;
  }

  const hash = await sha256(texto);
  return db
    .prepare(
      `SELECT p.id, p.numero, p.status, p.valor_total_centavos,
              c.nome AS cliente_nome, c.telefone AS cliente_telefone,
              pg.status AS pagamento_status, pg.provider AS pagamento_provider,
              r.data_hora AS retirado_em, r.admin_email AS retirado_por
         FROM retirada_tokens t
         JOIN pedidos  p  ON p.id = t.pedido_id
         JOIN clientes c  ON c.id = p.cliente_id
         LEFT JOIN pagamentos pg ON pg.pedido_id = p.id
         LEFT JOIN retiradas  r  ON r.pedido_id  = p.id
        WHERE t.token_hash = ?1 AND t.revoked_at IS NULL
        LIMIT 1`,
    )
    .bind(hash)
    .first<{
      id: string;
      numero: string;
      status: StatusPedido;
      valor_total_centavos: number;
      cliente_nome: string;
      cliente_telefone: string;
      pagamento_status: string | null;
      pagamento_provider: string | null;
      retirado_em: string | null;
      retirado_por: string | null;
    }>();
}

/**
 * O que o atendente vê depois de escanear.
 *
 * Token inválido devolve sempre a mesma mensagem genérica: não dizemos se
 * o token não existe ou se foi revogado, para não transformar o endpoint
 * num oráculo de pedidos existentes.
 */
export async function consultarPorToken(db: D1Database, token: string): Promise<ConsultaRetirada> {
  const pedido = await pedidoPorToken(db, token);
  if (!pedido) throw erro(404, "QR_INVALIDO", "QR Code inválido ou expirado.");

  const { results: itens } = await db
    .prepare(
      `SELECT produto_variacao_id, produto_nome_snapshot, variacao_nome_snapshot, quantidade
         FROM pedido_itens WHERE pedido_id = ?1`,
    )
    .bind(pedido.id)
    .all<{ produto_variacao_id: string; produto_nome_snapshot: string; variacao_nome_snapshot: string; quantidade: number }>();

  const pago = pedido.pagamento_status === "APPROVED";
  const jaRetirado = Boolean(pedido.retirado_em);
  const statusOk = STATUS_RETIRAVEL.includes(pedido.status);

  let impedimento: string | null = null;
  if (jaRetirado) impedimento = "PEDIDO JÁ RETIRADO";
  else if (["CANCELADO", "EXPIRADO", "REEMBOLSADO"].includes(pedido.status)) impedimento = `PEDIDO ${pedido.status}`;
  else if (!pago) impedimento = "PAGAMENTO NÃO CONFIRMADO";
  else if (!statusOk) impedimento = `PEDIDO ESTÁ COMO ${pedido.status}`;

  return {
    pedido_id: pedido.id,
    numero: pedido.numero,
    status: pedido.status,
    cliente_nome: pedido.cliente_nome,
    cliente_telefone: pedido.cliente_telefone,
    valor_total_centavos: pedido.valor_total_centavos,
    itens: itens.map((i) => ({
      produto_variacao_id: i.produto_variacao_id,
      produto_nome: i.produto_nome_snapshot,
      variacao_nome: i.variacao_nome_snapshot,
      descricao: `${i.produto_nome_snapshot} — ${i.variacao_nome_snapshot}`,
      quantidade: i.quantidade,
    })),
    pago,
    pagamento_provider: pedido.pagamento_provider,
    retirado_em: pedido.retirado_em,
    retirado_por: pedido.retirado_por,
    pode_retirar: impedimento === null,
    impedimento,
  };
}

/**
 * Confirma a entrega.
 *
 * Duas defesas, nesta ordem:
 *
 *  1. O INSERT ... SELECT só grava se o pedido estiver num status que
 *     permite retirada. Se não estiver, grava zero linhas.
 *  2. O UNIQUE em retiradas.pedido_id levanta erro na segunda vez.
 *
 * A segunda é a que importa de verdade: dois atendentes escaneando o mesmo
 * QR no mesmo segundo não são resolvidos por um `if`, e sim pelo banco —
 * um grava, o outro recebe constraint e vê "PEDIDO JÁ RETIRADO".
 */
export async function confirmarRetirada(
  db: D1Database,
  token: string,
  adminEmail: string,
  observacao?: string,
): Promise<ConsultaRetirada> {
  const consulta = await consultarPorToken(db, token);

  if (!consulta.pode_retirar) {
    throw erro(409, "RETIRADA_BLOQUEADA", consulta.impedimento ?? "Retirada não permitida.");
  }

  const ts = agora();
  const statusPermitidos = STATUS_RETIRAVEL.map((s) => `'${s}'`).join(", ");

  try {
    const resultados = await db.batch([
      db
        .prepare(
          `INSERT INTO retiradas (id, pedido_id, admin_email, data_hora, observacao, created_at)
           SELECT ?1, p.id, ?2, ?3, ?4, ?3
             FROM pedidos p
            WHERE p.id = ?5 AND p.status IN (${statusPermitidos})`,
        )
        .bind(novoId("ret"), adminEmail, ts, observacao ?? null, consulta.pedido_id),
      db
        .prepare(
          `UPDATE pedidos SET status = 'RETIRADO', updated_at = ?1
            WHERE id = ?2 AND status IN (${statusPermitidos})`,
        )
        .bind(ts, consulta.pedido_id),
      db
        .prepare(`UPDATE retirada_tokens SET revoked_at = ?1 WHERE pedido_id = ?2 AND revoked_at IS NULL`)
        .bind(ts, consulta.pedido_id),
    ]);

    if ((resultados[0]?.meta?.changes ?? 0) === 0) {
      throw erro(409, "RETIRADA_BLOQUEADA", "O pedido mudou de status. Escaneie novamente.");
    }
  } catch (e) {
    if (violouUnique(e)) {
      throw erro(409, "JA_RETIRADO", "PEDIDO JÁ RETIRADO");
    }
    throw e;
  }

  await auditar(db, {
    actor_type: "ADMIN",
    actor_identifier: adminEmail,
    action: "RETIRADA_CONFIRMADA",
    entity_type: "pedido",
    entity_id: consulta.pedido_id,
    metadata: { numero: consulta.numero },
  });

  return await consultarPorToken(db, token).catch(() => ({
    ...consulta,
    status: "RETIRADO" as StatusPedido,
    retirado_em: ts,
    retirado_por: adminEmail,
    pode_retirar: false,
    impedimento: "PEDIDO JÁ RETIRADO",
  }));
}

/** O painel confirma a mesma retirada pelo ID, reutilizando todas as validações do QR. */
export async function confirmarRetiradaPorPedido(
  db: D1Database,
  env: Env,
  pedidoId: string,
  adminEmail: string,
): Promise<ConsultaRetirada> {
  const linha = await db.prepare(
    `SELECT nonce FROM retirada_tokens WHERE pedido_id = ?1 AND revoked_at IS NULL LIMIT 1`,
  ).bind(pedidoId).first<{ nonce: string }>();
  if (!linha) throw erro(409, "RETIRADA_INDISPONIVEL", "Este pedido não possui um QR de retirada ativo.");
  const token = await derivarTokenRetirada(env.QR_TOKEN_SECRET, pedidoId, linha.nonce);
  return confirmarRetirada(db, token, adminEmail);
}
