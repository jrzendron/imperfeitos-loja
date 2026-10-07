import type { PedidoPublico } from "../../shared/types";
import type { PagamentoCartaoInput } from "../../shared/schemas";
import { sha256 } from "../utils/crypto";
import { ErroDeNegocio, erro, violouUnique } from "../utils/http";
import { agora, novoId, somarMinutos } from "../utils/ids";
import { registrarPagamento } from "./pedido.service";
import { credenciaisPagamento, exigirContaAtivaParaVendas, type CredenciaisPagamento } from "./conta-pagamento.service";

const API = "https://api.mercadopago.com/v1/orders";

type PagamentoPublico = NonNullable<PedidoPublico["pagamento"]>;

export interface OrdemMercadoPago {
  id: string;
  external_reference?: string;
  status?: string;
  status_detail?: string;
  total_amount?: string;
  total_paid_amount?: string;
  transactions?: {
    payments?: Array<{
      id?: string;
      status?: string;
      status_detail?: string;
      amount?: string;
      paid_amount?: string;
      payment_method?: {
        id?: string;
        type?: string;
        ticket_url?: string;
        qr_code?: string;
        qr_code_base64?: string;
      };
    }>;
  };
}

interface PedidoPagamento {
  id: string;
  numero: string;
  status: string;
  valor_total_centavos: number;
  expires_at: string | null;
  email: string | null;
  nome: string;
}

function dinheiroMercadoPago(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

interface RespostaErroMercadoPago {
  errors?: Array<{ code?: string; details?: string[] }>;
  data?: OrdemMercadoPago;
}

class ErroRespostaMercadoPago extends ErroDeNegocio {
  constructor(readonly httpStatus: number, readonly resposta: RespostaErroMercadoPago) {
    const codigoMp = resposta.errors?.[0]?.code ?? "desconhecido";
    super(502, "ERRO_MERCADO_PAGO", `O Mercado Pago não processou o pagamento (${codigoMp}). Tente novamente ou escolha outra forma de pagamento.`);
  }
}

async function chamarMercadoPago(conta: CredenciaisPagamento, caminho: string, init?: RequestInit) {
  if (!conta.accessToken) {
    throw erro(503, "PIX_NAO_CONFIGURADO", "O Pix ainda não foi configurado nesta loja.");
  }

  const resposta = await fetch(`${API}${caminho}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${conta.accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  const texto = await resposta.text();
  let dados: unknown = {};
  try {
    dados = texto ? JSON.parse(texto) : {};
  } catch {
    dados = {};
  }

  if (!resposta.ok) {
    console.error("Mercado Pago respondeu com erro", resposta.status, dados);
    throw new ErroRespostaMercadoPago(resposta.status, dados as RespostaErroMercadoPago);
  }
  return dados as OrdemMercadoPago;
}

async function localizarPedido(db: D1Database, acessoToken: string): Promise<PedidoPagamento> {
  const hash = await sha256(acessoToken.trim());
  const pedido = await db
    .prepare(
      `SELECT p.id, p.numero, p.status, p.valor_total_centavos, p.expires_at, c.email, c.nome
         FROM pedidos p
         JOIN clientes c ON c.id = p.cliente_id
        WHERE p.acesso_token_hash = ?1 LIMIT 1`,
    )
    .bind(hash)
    .first<PedidoPagamento>();

  if (!pedido) throw erro(404, "PEDIDO_NAO_ENCONTRADO", "Pedido não encontrado.");
  if (pedido.status !== "AGUARDANDO_PAGAMENTO") {
    throw erro(409, "STATUS_INVALIDO", "Este pedido não está aguardando pagamento.");
  }
  if (!pedido.email) {
    throw erro(422, "EMAIL_OBRIGATORIO", "Informe um e-mail para gerar o pagamento Pix.");
  }
  return pedido;
}

async function pagamentoPublico(db: D1Database, pedidoId: string): Promise<PagamentoPublico | null> {
  return db
    .prepare(
      `SELECT provider, status, pix_copia_cola, expires_at
         FROM pagamentos WHERE pedido_id = ?1 LIMIT 1`,
    )
    .bind(pedidoId)
    .first<PagamentoPublico>();
}

/**
 * Cria uma Order Pix em modo automático. A linha PENDING é persistida antes
 * da chamada externa e a chave é determinística; qualquer repetição usa a
 * mesma X-Idempotency-Key e não gera uma segunda cobrança.
 */
export async function criarPix(
  db: D1Database,
  env: Env,
  acessoToken: string,
): Promise<PagamentoPublico> {
  const pedido = await localizarPedido(db, acessoToken);
  const existente = await pagamentoPublico(db, pedido.id);
  if (existente?.pix_copia_cola || existente?.status === "APPROVED") return existente;
  if (existente && existente.provider !== "MERCADO_PAGO") {
    throw erro(409, "PAGAMENTO_EXISTENTE", "Este pedido já possui outro pagamento.");
  }

  const ts = agora();
  const conta = await credenciaisPagamento(db, env);
  // Uma tentativa recusada pelo provedor precisa de uma nova chave. Repetir a
  // chave anterior apenas devolve a mesma order que já falhou.
  const idempotencia = existente && ["REJECTED", "CANCELLED"].includes(existente.status)
    ? `pix-${pedido.id}-${crypto.randomUUID()}`
    : `pix-${pedido.id}`;
  const expiraEm = somarMinutos(ts, 35);

  if (!existente) {
    try {
      await db
        .prepare(
          `INSERT INTO pagamentos
             (id, pedido_id, provider, idempotency_key, status, valor_centavos,
              expires_at, created_at, updated_at, conta_pagamento_id)
           VALUES (?1, ?2, 'MERCADO_PAGO', ?3, 'PENDING', ?4, ?5, ?6, ?6, ?7)`,
        )
        .bind(novoId("pag"), pedido.id, idempotencia, pedido.valor_total_centavos, expiraEm, ts, conta.id)
        .run();
    } catch (e) {
      if (!violouUnique(e)) throw e;
    }
  } else if (["REJECTED", "CANCELLED"].includes(existente.status)) {
    await db
      .prepare(
        `UPDATE pagamentos
            SET provider = 'MERCADO_PAGO', external_id = NULL, idempotency_key = ?1,
                status = 'PENDING', valor_centavos = ?2, pix_copia_cola = NULL,
                expires_at = ?3, paid_at = NULL, updated_at = ?4, conta_pagamento_id = ?6
          WHERE pedido_id = ?5 AND status IN ('REJECTED','CANCELLED')`,
      )
      .bind(idempotencia, pedido.valor_total_centavos, expiraEm, ts, pedido.id, conta.id)
      .run();
  }

  const vinculada = await db.prepare("SELECT conta_pagamento_id, idempotency_key FROM pagamentos WHERE pedido_id = ?1")
    .bind(pedido.id).first<{ conta_pagamento_id: string | null; idempotency_key: string }>();
  if (!vinculada?.idempotency_key?.startsWith("pix-")) {
    throw erro(409, "PAGAMENTO_EXISTENTE", "Este pedido já possui outro pagamento.");
  }
  // Em duas solicitações simultâneas, a segunda usa a chave que de fato foi
  // gravada pela primeira. Nunca se criam duas orders para o mesmo pedido.
  const chaveGravada = vinculada.idempotency_key;
  const contaCobranca = await credenciaisPagamento(db, env, vinculada?.conta_pagamento_id ?? null);
  let ordem: OrdemMercadoPago;
  try {
    ordem = await chamarMercadoPago(contaCobranca, "", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Idempotency-Key": chaveGravada,
    },
    body: JSON.stringify({
      type: "online",
      total_amount: dinheiroMercadoPago(pedido.valor_total_centavos),
      external_reference: pedido.id,
      processing_mode: "automatic",
      transactions: {
        payments: [
          {
            amount: dinheiroMercadoPago(pedido.valor_total_centavos),
            payment_method: { id: "pix", type: "bank_transfer" },
            expiration_time: "PT30M",
          },
        ],
      },
      payer: { email: pedido.email, first_name: pedido.nome.trim().split(/\s+/)[0] },
    }),
    });
  } catch (e) {
    // HTTP 402 pode conter uma order criada, porém com transação finalizada em
    // failed. Sem registrar isso, o pedido fica PENDING para sempre, sem QR.
    if (e instanceof ErroRespostaMercadoPago && e.httpStatus === 402 &&
        e.resposta.data?.id && e.resposta.data.status === "failed" &&
        e.resposta.data.transactions?.payments?.[0]?.status === "failed") {
      await db.prepare(
        `UPDATE pagamentos SET status = 'REJECTED', external_id = ?1,
                pix_copia_cola = NULL, updated_at = ?2
          WHERE pedido_id = ?3 AND idempotency_key = ?4 AND status = 'PENDING'`,
      ).bind(e.resposta.data.id, agora(), pedido.id, chaveGravada).run();
    }
    throw e;
  }

  const pix = ordem.transactions?.payments?.[0]?.payment_method?.qr_code;
  if (!ordem.id || !pix) {
    console.error("Resposta Pix sem order ou qr_code", ordem);
    throw erro(502, "PIX_INCOMPLETO", "O Mercado Pago não devolveu um Pix válido. Tente novamente.");
  }

  // O Mercado Pago também devolve um QR no sandbox, mas um banco real não o
  // reconhece. Nunca publicar esse código na loja de produção.
  const ticket = ordem.transactions?.payments?.[0]?.payment_method?.ticket_url ?? "";
  if (env.APP_ENV === "production" && (/TESTUSER/i.test(pix) || /\/sandbox\//i.test(ticket))) {
    await db.prepare(
      `UPDATE pagamentos SET status = 'REJECTED', external_id = NULL,
              pix_copia_cola = NULL, updated_at = ?1
        WHERE pedido_id = ?2 AND provider = 'MERCADO_PAGO' AND status = 'PENDING'`,
    ).bind(agora(), pedido.id).run();
    throw erro(503, "PIX_AMBIENTE_TESTE", "O Pix da loja está em modo de teste e não pode ser pago. Avise a organização para configurar as credenciais de produção.");
  }

  await db.batch([
    db
      .prepare(
        `UPDATE pagamentos
            SET external_id = ?1, pix_copia_cola = ?2, expires_at = ?3, updated_at = ?4
          WHERE pedido_id = ?5 AND provider = 'MERCADO_PAGO' AND status = 'PENDING'`,
      )
      .bind(ordem.id, pix, expiraEm, ts, pedido.id),
    db
      .prepare(
        `UPDATE pedidos SET expires_at = ?1, updated_at = ?2
          WHERE id = ?3 AND status = 'AGUARDANDO_PAGAMENTO'`,
      )
      .bind(expiraEm, ts, pedido.id),
  ]);

  const salvo = await pagamentoPublico(db, pedido.id);
  if (!salvo) throw new Error("Pagamento Pix não foi persistido.");
  return salvo;
}

export async function obterOrdemMercadoPago(db: D1Database, env: Env, orderId: string, contaId: string | null): Promise<OrdemMercadoPago> {
  const conta = await credenciaisPagamento(db, env, contaId);
  return chamarMercadoPago(conta, `/${encodeURIComponent(orderId)}`);
}

export function ordemFoiReembolsada(ordem: OrdemMercadoPago): boolean {
  return ordem.status === "refunded" && ordem.status_detail === "refunded";
}

/** Reembolso integral. A chave estável permite repetir a tentativa sem duplicar a operação. */
export async function reembolsarOrdemMercadoPago(
  db: D1Database,
  env: Env,
  orderId: string,
  contaId: string | null,
  pedidoId: string,
): Promise<OrdemMercadoPago> {
  const conta = await credenciaisPagamento(db, env, contaId);
  if (!conta.accessToken) throw erro(503, "CONTA_MP_INDISPONIVEL", "A conta desta cobrança não está configurada.");
  let resposta: Response;
  try {
    resposta = await fetch(`${API}/${encodeURIComponent(orderId)}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${conta.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Idempotency-Key": `refund-${pedidoId}`,
      },
      body: "{}",
    });
  } catch {
    throw erro(502, "MP_INDISPONIVEL", "Não foi possível falar com o Mercado Pago. Nenhum reembolso foi registrado na loja.");
  }
  if (!resposta.ok) {
    console.error("Mercado Pago recusou reembolso", resposta.status, orderId);
    throw erro(502, "REEMBOLSO_RECUSADO", "O Mercado Pago não confirmou o reembolso. Confira a conta e tente novamente.");
  }
  const retorno = await resposta.json() as OrdemMercadoPago;
  if (retorno.id !== orderId) throw erro(502, "RESPOSTA_MP_INVALIDA", "A resposta do Mercado Pago não corresponde ao pedido.");
  return retorno;
}

export async function cancelarOrdemMercadoPago(
  db: D1Database,
  env: Env,
  orderId: string,
  contaId: string | null,
  pedidoId: string,
): Promise<OrdemMercadoPago> {
  const conta = await credenciaisPagamento(db, env, contaId);
  if (!conta.accessToken) throw erro(503, "CONTA_MP_INDISPONIVEL", "A conta desta cobrança não está configurada.");
  let resposta: Response;
  try {
    resposta = await fetch(`${API}/${encodeURIComponent(orderId)}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${conta.accessToken}`,
        Accept: "application/json",
        "X-Idempotency-Key": `cancel-${pedidoId}`,
      },
    });
  } catch {
    throw erro(502, "MP_INDISPONIVEL", "Não foi possível cancelar a cobrança no Mercado Pago.");
  }
  if (!resposta.ok) {
    console.error("Mercado Pago recusou cancelamento", resposta.status, orderId);
    throw erro(502, "CANCELAMENTO_MP_RECUSADO", "A cobrança não foi cancelada no Mercado Pago. Confira o pagamento antes de liberar o estoque.");
  }
  const retorno = await resposta.json() as OrdemMercadoPago;
  if (retorno.id !== orderId || retorno.status !== "canceled") {
    throw erro(502, "CANCELAMENTO_MP_NAO_CONFIRMADO", "O Mercado Pago ainda não confirmou o cancelamento da cobrança.");
  }
  return retorno;
}

export function ordemFoiPaga(ordem: OrdemMercadoPago): boolean {
  const pagamento = ordem.transactions?.payments?.[0];
  return (
    (ordem.status === "processed" && ordem.status_detail === "accredited") ||
    (pagamento?.status === "processed" && pagamento?.status_detail === "accredited")
  );
}

export function valorPagoEmCentavos(ordem: OrdemMercadoPago): number {
  const valor = ordem.total_paid_amount ?? ordem.transactions?.payments?.[0]?.paid_amount ?? "0";
  return Math.round(Number(valor) * 100);
}

function ordemFalhou(ordem: OrdemMercadoPago): boolean {
  const status = ordem.transactions?.payments?.[0]?.status ?? ordem.status;
  return status === "failed" || status === "cancelled" || status === "rejected";
}

export interface ResultadoCartao {
  status: "PAGO" | "PROCESSANDO" | "RECUSADO";
  status_detail: string | null;
}

/** Processa o token descartável gerado pelo Card Payment Brick. */
export async function pagarComCartao(
  db: D1Database,
  env: Env,
  acessoToken: string,
  entrada: PagamentoCartaoInput,
): Promise<ResultadoCartao> {
  await exigirContaAtivaParaVendas(db, env);
  const pedido = await localizarPedido(db, acessoToken);
  const idempotencia = `card-${pedido.id}-${entrada.attempt_id}`;
  const ts = agora();

  const existente = await db
    .prepare(
    `SELECT provider, external_id, idempotency_key, status, pix_copia_cola, conta_pagamento_id
         FROM pagamentos WHERE pedido_id = ?1 LIMIT 1`,
    )
    .bind(pedido.id)
    .first<{
      provider: string;
      external_id: string | null;
      idempotency_key: string | null;
      status: string;
      pix_copia_cola: string | null;
      conta_pagamento_id: string | null;
    }>();

  if (existente?.status === "APPROVED") return { status: "PAGO", status_detail: "accredited" };
  if (existente?.status === "PENDING" &&
      (existente.pix_copia_cola || existente.idempotency_key?.startsWith("pix-"))) {
    throw erro(409, "PIX_EXISTENTE", "Este pedido já possui uma cobrança Pix.");
  }
  if (existente?.status === "PENDING" && existente.idempotency_key !== idempotencia) {
    throw erro(409, "PAGAMENTO_PROCESSANDO", "Já existe um pagamento sendo processado.");
  }

  const conta = await credenciaisPagamento(db, env);

  if (!existente) {
    await db
      .prepare(
        `INSERT INTO pagamentos
           (id, pedido_id, provider, idempotency_key, status, valor_centavos,
            expires_at, created_at, updated_at, conta_pagamento_id)
         VALUES (?1, ?2, 'MERCADO_PAGO', ?3, 'PENDING', ?4, ?5, ?6, ?6, ?7)`,
      )
      .bind(
        novoId("pag"),
        pedido.id,
        idempotencia,
        pedido.valor_total_centavos,
        pedido.expires_at,
        ts,
        conta.id,
      )
      .run();
  } else if (["REJECTED", "CANCELLED"].includes(existente.status)) {
    await db
      .prepare(
        `UPDATE pagamentos
            SET idempotency_key = ?1, external_id = NULL, status = 'PENDING',
                pix_copia_cola = NULL, updated_at = ?2, conta_pagamento_id = ?4
          WHERE pedido_id = ?3`,
      )
      .bind(idempotencia, ts, pedido.id, conta.id)
      .run();
  } else if (existente.external_id) {
    const ordem = await obterOrdemMercadoPago(db, env, existente.external_id, existente.conta_pagamento_id);
    return {
      status: ordemFoiPaga(ordem) ? "PAGO" : ordemFalhou(ordem) ? "RECUSADO" : "PROCESSANDO",
      status_detail: ordem.status_detail ?? ordem.transactions?.payments?.[0]?.status_detail ?? null,
    };
  }

  const vinculada = await db.prepare("SELECT conta_pagamento_id FROM pagamentos WHERE pedido_id = ?1")
    .bind(pedido.id).first<{ conta_pagamento_id: string | null }>();
  const contaCobranca = await credenciaisPagamento(db, env, vinculada?.conta_pagamento_id ?? null);
  if (env.APP_ENV === "production" && contaCobranca.id === null) {
    throw erro(409, "PEDIDO_AMBIENTE_TESTE", "Este pedido foi criado com a conta de teste. Cancele-o e faça um novo pedido após configurar a conta de produção.");
  }
  const ordem = await chamarMercadoPago(contaCobranca, "", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencia,
      ...(entrada.device_id ? { "X-meli-session-id": entrada.device_id } : {}),
    },
    body: JSON.stringify({
      type: "online",
      total_amount: dinheiroMercadoPago(pedido.valor_total_centavos),
      external_reference: pedido.id,
      processing_mode: "automatic",
      transactions: {
        payments: [
          {
            amount: dinheiroMercadoPago(pedido.valor_total_centavos),
            payment_method: {
              id: entrada.payment_method_id,
              type: entrada.payment_type_id,
              token: entrada.token,
              installments: entrada.installments,
            },
          },
        ],
      },
      payer: {
        email: entrada.payer.email,
        identification: entrada.payer.identification,
      },
    }),
  });

  const detalhe = ordem.status_detail ?? ordem.transactions?.payments?.[0]?.status_detail ?? null;
  await db
    .prepare(
      `UPDATE pagamentos SET external_id = ?1, status = ?2, updated_at = ?3
        WHERE pedido_id = ?4 AND idempotency_key = ?5`,
    )
    .bind(ordem.id, ordemFalhou(ordem) ? "REJECTED" : "PENDING", ts, pedido.id, idempotencia)
    .run();

  if (ordemFoiPaga(ordem)) {
    await registrarPagamento(db, env, pedido.id, {
      provider: "MERCADO_PAGO",
      adminEmail: "mercado-pago@cartao",
      externalId: ordem.id,
    });
    return { status: "PAGO", status_detail: detalhe };
  }

  return { status: ordemFalhou(ordem) ? "RECUSADO" : "PROCESSANDO", status_detail: detalhe };
}
