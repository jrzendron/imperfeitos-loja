import { agora, novoId } from "../utils/ids";
import { erro } from "../utils/http";
import { auditar } from "./auditoria.service";
import { cancelarPedido, registrarPagamento } from "./pedido.service";
import {
  cancelarOrdemMercadoPago,
  obterOrdemMercadoPago,
  ordemFoiPaga,
  ordemFoiReembolsada,
  reembolsarOrdemMercadoPago,
  valorPagoEmCentavos,
} from "./mercado-pago.service";

interface PedidoCancelamento {
  id: string;
  numero: string;
  status: string;
  valor_total_centavos: number;
  pagamento_provider: string | null;
  pagamento_status: string | null;
  pagamento_valor: number | null;
  external_id: string | null;
  conta_pagamento_id: string | null;
}

/** Cancela a cobrança externa antes de liberar uma reserva local. */
export async function cancelarPedidoGerenciado(
  db: D1Database,
  env: Env,
  pedidoId: string,
  ator: "ADMIN" | "CLIENTE" | "SISTEMA",
  identificador: string,
  reembolsoManualConfirmado = false,
): Promise<{ status: "CANCELADO" | "EXPIRADO" | "REEMBOLSADO"; reembolso_centavos: number }> {
  const pedido = await db.prepare(
    `SELECT p.id, p.numero, p.status, p.valor_total_centavos,
            pg.provider AS pagamento_provider, pg.status AS pagamento_status,
            pg.valor_centavos AS pagamento_valor, pg.external_id, pg.conta_pagamento_id
       FROM pedidos p LEFT JOIN pagamentos pg ON pg.pedido_id = p.id WHERE p.id = ?1`,
  ).bind(pedidoId).first<PedidoCancelamento>();
  if (!pedido) throw erro(404, "PEDIDO_NAO_ENCONTRADO", "Pedido não encontrado.");

  if (pedido.status === "AGUARDANDO_PAGAMENTO") {
    if (pedido.pagamento_status === "APPROVED") {
      throw erro(409, "PAGAMENTO_REVISAR", "Há um pagamento confirmado. Confira a cobrança antes de cancelar.");
    }
    if (pedido.pagamento_provider === "MERCADO_PAGO" && pedido.pagamento_status === "PENDING") {
      if (!pedido.external_id) {
        throw erro(409, "COBRANCA_PROCESSANDO", "A cobrança ainda está sendo criada. Tente novamente em instantes.");
      }
      const ordem = await obterOrdemMercadoPago(db, env, pedido.external_id, pedido.conta_pagamento_id);
      if (ordem.external_reference !== pedido.id) {
        throw erro(409, "ORDEM_DIVERGENTE", "A cobrança não corresponde a este pedido. Não alteramos o estoque.");
      }
      if (ordemFoiPaga(ordem)) {
        if (valorPagoEmCentavos(ordem) !== pedido.valor_total_centavos) {
          throw erro(409, "VALOR_DIVERGENTE", "O Mercado Pago confirma pagamento com valor diferente. Confira antes de entregar.");
        }
        await registrarPagamento(db, env, pedido.id, {
          provider: "MERCADO_PAGO", adminEmail: "conciliacao@mercadopago", externalId: pedido.external_id,
        });
        throw erro(409, "PEDIDO_AGORA_PAGO", "O Mercado Pago confirmou o pagamento. O pedido foi atualizado; use a ação de reembolso se desejar cancelar.");
      }
      if (["created", "action_required"].includes(ordem.status ?? "")) {
        await cancelarOrdemMercadoPago(db, env, pedido.external_id, pedido.conta_pagamento_id, pedido.id);
      } else if (!["canceled", "expired", "failed"].includes(ordem.status ?? "")) {
        throw erro(409, "COBRANCA_EM_PROCESSAMENTO", "O pagamento ainda pode ser concluído. Confira o Mercado Pago antes de liberar o estoque.");
      }
    }
    const novoStatus = ator === "SISTEMA" ? "EXPIRADO" : "CANCELADO";
    const mudou = await cancelarPedido(db, pedidoId, ator,
      ator === "SISTEMA" ? "Prazo de pagamento esgotado" : "Cancelado no gerenciador de pedidos", novoStatus);
    if (!mudou) throw erro(409, "STATUS_ALTERADO", "O pedido mudou de status. Atualize a lista.");
    await db.prepare(
      `UPDATE pagamentos SET status = 'CANCELLED', updated_at = ?1
        WHERE pedido_id = ?2 AND status IN ('PENDING','REJECTED')`,
    ).bind(agora(), pedidoId).run();
    return { status: novoStatus, reembolso_centavos: 0 };
  }

  if (ator !== "ADMIN") throw erro(409, "NAO_CANCELAVEL", "Peça ajuda à equipe para um pedido já pago.");
  if (pedido.status === "REEMBOLSADO") return { status: "REEMBOLSADO", reembolso_centavos: pedido.valor_total_centavos };
  if (!["PAGO", "PRONTO_PARA_RETIRADA", "PAGO_REVISAR"].includes(pedido.status)) {
    throw erro(409, "NAO_CANCELAVEL", "Este pedido não pode ser cancelado aqui. Se já foi entregue, registre a devolução física antes de repor o estoque.");
  }
  if (pedido.pagamento_status !== "APPROVED" || pedido.pagamento_valor !== pedido.valor_total_centavos) {
    throw erro(409, "PAGAMENTO_DIVERGENTE", "Pagamento e pedido não conferem. Nenhum valor ou estoque foi alterado.");
  }
  const { results: itens } = await db.prepare(
    `SELECT produto_variacao_id, quantidade FROM pedido_itens WHERE pedido_id = ?1`,
  ).bind(pedidoId).all<{ produto_variacao_id: string; quantidade: number }>();
  const vendido = await db.prepare(
    `SELECT COALESCE(SUM(quantidade), 0) AS total FROM estoque_movimentos
      WHERE pedido_id = ?1 AND tipo = 'VENDA'`,
  ).bind(pedidoId).first<{ total: number }>();
  if (!itens.length || vendido?.total !== itens.reduce((s, item) => s + item.quantidade, 0)) {
    throw erro(409, "VENDA_NAO_CONCILIADA", "O histórico de venda não confere com os itens. Confira antes de repor o estoque.");
  }

  const statusInicial = pedido.status;
  async function bloquearRetirada() {
    if (statusInicial === "PAGO_REVISAR") return;
    const resultado = await db.prepare(
      `UPDATE pedidos SET status = 'PAGO_REVISAR', updated_at = ?1
        WHERE id = ?2 AND status IN ('PAGO','PRONTO_PARA_RETIRADA')
          AND NOT EXISTS (SELECT 1 FROM retiradas WHERE pedido_id = ?2)`,
    ).bind(agora(), pedidoId).run();
    if ((resultado.meta?.changes ?? 0) === 0) {
      throw erro(409, "STATUS_ALTERADO", "O pedido mudou de status ou foi entregue. Nenhum reembolso foi solicitado.");
    }
  }

  if (pedido.pagamento_provider === "MERCADO_PAGO") {
    if (!pedido.external_id) throw erro(409, "ORDEM_AUSENTE", "O pedido pago não possui ID de cobrança no Mercado Pago.");
    let ordem = await obterOrdemMercadoPago(db, env, pedido.external_id, pedido.conta_pagamento_id);
    if (ordem.id !== pedido.external_id || ordem.external_reference !== pedido.id ||
        Math.round(Number(ordem.total_amount ?? "0") * 100) !== pedido.valor_total_centavos) {
      throw erro(409, "ORDEM_DIVERGENTE", "A ordem do Mercado Pago não corresponde ao pedido. Nenhum reembolso foi lançado.");
    }
    await bloquearRetirada();
    if (!ordemFoiReembolsada(ordem)) {
      if (ordem.status !== "processed" || ordem.status_detail !== "accredited") {
        throw erro(409, "REEMBOLSO_INDISPONIVEL", "O pagamento não está confirmado para reembolso integral. Confira o Mercado Pago.");
      }
      await reembolsarOrdemMercadoPago(db, env, pedido.external_id, pedido.conta_pagamento_id, pedido.id);
      ordem = await obterOrdemMercadoPago(db, env, pedido.external_id, pedido.conta_pagamento_id);
    }
    if (!ordemFoiReembolsada(ordem)) {
      throw erro(409, "REEMBOLSO_EM_PROCESSAMENTO", "O Mercado Pago ainda não confirmou o reembolso. Tente novamente após a atualização da ordem.");
    }
  } else if (pedido.pagamento_provider === "MANUAL") {
    if (!reembolsoManualConfirmado) {
      throw erro(400, "CONFIRMACAO_OBRIGATORIA", "Confirme que o valor já foi devolvido ao comprador antes de registrar o reembolso manual.");
    }
    await bloquearRetirada();
  } else {
    throw erro(409, "PROVEDOR_DESCONHECIDO", "O provedor do pagamento não permite reembolso automático.");
  }

  const ts = agora();
  const ativo = `(SELECT status FROM pedidos WHERE id = ?4) = 'PAGO_REVISAR'
    AND (SELECT status FROM pagamentos WHERE pedido_id = ?4) = 'APPROVED'`;
  const stmts: D1PreparedStatement[] = [];
  for (const item of itens) {
    stmts.push(db.prepare(
      `UPDATE estoque SET quantidade_fisica = quantidade_fisica + ?1, updated_at = ?2
        WHERE produto_variacao_id = ?3 AND ${ativo}`,
    ).bind(item.quantidade, ts, item.produto_variacao_id, pedidoId));
    stmts.push(db.prepare(
      `INSERT INTO estoque_movimentos
         (id, produto_variacao_id, tipo, quantidade, pedido_id, motivo, admin_email, created_at)
       SELECT ?1, ?2, 'CANCELAMENTO', ?3, ?4, 'Reembolso confirmado', ?5, ?6
        WHERE ${ativo}`,
    ).bind(novoId("mov"), item.produto_variacao_id, item.quantidade, pedidoId, identificador, ts));
  }
  stmts.push(db.prepare(
    `UPDATE pagamentos SET status = 'REFUNDED', updated_at = ?1
      WHERE pedido_id = ?2 AND status = 'APPROVED'
        AND (SELECT status FROM pedidos WHERE id = ?2) = 'PAGO_REVISAR'`,
  ).bind(ts, pedidoId));
  stmts.push(db.prepare(
    `UPDATE retirada_tokens SET revoked_at = ?1 WHERE pedido_id = ?2 AND revoked_at IS NULL`,
  ).bind(ts, pedidoId));
  stmts.push(db.prepare(
    `UPDATE pedidos SET status = 'REEMBOLSADO', updated_at = ?1
      WHERE id = ?2 AND status = 'PAGO_REVISAR'`,
  ).bind(ts, pedidoId));
  const resultados = await db.batch(stmts);
  if ((resultados.at(-1)?.meta?.changes ?? 0) === 0) {
    throw erro(409, "STATUS_ALTERADO", "O pedido mudou durante o reembolso. Atualize a lista e confira o estoque.");
  }
  await auditar(db, {
    actor_type: "ADMIN", actor_identifier: identificador, action: "PEDIDO_REEMBOLSADO",
    entity_type: "pedido", entity_id: pedidoId,
    metadata: { numero: pedido.numero, valor_centavos: pedido.valor_total_centavos, provider: pedido.pagamento_provider },
  });
  return { status: "REEMBOLSADO", reembolso_centavos: pedido.valor_total_centavos };
}
