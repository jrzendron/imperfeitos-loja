import { Hono } from "hono";
import { criarPedidoSchema, pagamentoCartaoSchema, consultarCpfSchema } from "../../shared/schemas";
import { criarPedido } from "../services/pedido.service";
import { cancelarPedidoGerenciado } from "../services/cancelamento-pedido.service";
import { criarPix, pagarComCartao } from "../services/mercado-pago.service";
import { sha256, derivarTokenRetirada, hmacSha256 } from "../utils/crypto";
import { erro } from "../utils/http";
import type { PedidoPublico, PedidoConsultadoCpf, StatusPedido } from "../../shared/types";

export const pedidosRouter = new Hono<{ Bindings: Env }>();

/**
 * O corpo aceito tem exatamente dois campos por item: id da variação e
 * quantidade. O schema é .strict(), então qualquer campo extra — um
 * "valor_centavos" esperançoso, por exemplo — faz a requisição ser
 * recusada antes de tocar em qualquer lógica.
 */
pedidosRouter.post("/", async (c) => {
  const corpo = criarPedidoSchema.parse(await c.req.json());
  const { numero, acesso_token } = await criarPedido(c.env.DB, c.env, corpo);
  return c.json({ numero, acesso_token }, 201);
});

pedidosRouter.post("/consultar-cpf", async (c) => {
  const { cpf } = consultarCpfSchema.parse(await c.req.json());
  const cpfHash = await hmacSha256(c.env.CPF_PEPPER, cpf);
  const cliente = await c.env.DB.prepare(`SELECT id FROM clientes WHERE cpf_hash = ?1 LIMIT 1`)
    .bind(cpfHash)
    .first<{ id: string }>();

  c.header("Cache-Control", "no-store");
  if (!cliente) return c.json({ pedidos: [] as PedidoConsultadoCpf[] });

  const { results: linhas } = await c.env.DB.prepare(
    `SELECT p.id, p.numero,
            CASE WHEN pg.status = 'APPROVED'
                 THEN p.codigo_retirada ELSE NULL END AS codigo_retirada,
            p.status, p.valor_total_centavos,
            p.created_at, r.data_hora AS retirado_em
       FROM pedidos p
       LEFT JOIN pagamentos pg ON pg.pedido_id = p.id
       LEFT JOIN retiradas r ON r.pedido_id = p.id
      WHERE p.cliente_id = ?1 AND p.codigo_retirada IS NOT NULL
      ORDER BY p.created_at DESC
      LIMIT 30`,
  ).bind(cliente.id).all<{
    id: string; numero: string; codigo_retirada: string | null; status: StatusPedido;
    valor_total_centavos: number; created_at: string; retirado_em: string | null;
  }>();

  const pedidos: PedidoConsultadoCpf[] = [];
  for (const linha of linhas) {
    const { results: itens } = await c.env.DB.prepare(
      `SELECT produto_nome_snapshot, variacao_nome_snapshot, quantidade
         FROM pedido_itens WHERE pedido_id = ?1 ORDER BY created_at`,
    ).bind(linha.id).all<PedidoConsultadoCpf["itens"][number]>();
    pedidos.push({ ...linha, itens });
  }
  return c.json({ pedidos });
});

async function carregarPorToken(db: D1Database, token: string): Promise<PedidoPublico> {
  const hash = await sha256(token.trim());

  const pedido = await db
    .prepare(
      `SELECT p.id, p.numero, p.codigo_retirada, p.status, p.valor_total_centavos, p.expires_at, p.created_at,
              c.nome AS cliente_nome,
              t.id   AS token_id,
              r.data_hora AS retirado_em
         FROM pedidos p
         JOIN clientes c ON c.id = p.cliente_id
         LEFT JOIN retirada_tokens t ON t.pedido_id = p.id AND t.revoked_at IS NULL
         LEFT JOIN retiradas r       ON r.pedido_id = p.id
        WHERE p.acesso_token_hash = ?1
        LIMIT 1`,
    )
    .bind(hash)
    .first<{
      id: string;
      numero: string;
      codigo_retirada: string | null;
      status: StatusPedido;
      valor_total_centavos: number;
      expires_at: string | null;
      created_at: string;
      cliente_nome: string;
      token_id: string | null;
      retirado_em: string | null;
    }>();

  if (!pedido) throw erro(404, "PEDIDO_NAO_ENCONTRADO", "Pedido não encontrado.");

  const { results: itens } = await db
    .prepare(
      `SELECT produto_variacao_id, produto_nome_snapshot, variacao_nome_snapshot,
              quantidade, valor_unitario_centavos, subtotal_centavos
         FROM pedido_itens WHERE pedido_id = ?1`,
    )
    .bind(pedido.id)
    .all<PedidoPublico["itens"][number]>();

  const pagamento = await db
    .prepare(
      `SELECT provider, status, pix_copia_cola, expires_at
         FROM pagamentos WHERE pedido_id = ?1 LIMIT 1`,
    )
    .bind(pedido.id)
    .first<NonNullable<PedidoPublico["pagamento"]>>();

  return {
    numero: pedido.numero,
    codigo_retirada: pagamento?.status === "APPROVED" ? pedido.codigo_retirada : null,
    status: pedido.status,
    valor_total_centavos: pedido.valor_total_centavos,
    expires_at: pedido.expires_at,
    created_at: pedido.created_at,
    cliente_nome: pedido.cliente_nome,
    itens,
    retirado_em: pedido.retirado_em,
    pagamento: pagamento ?? null,
  };
}

/**
 * O acesso ao pedido é pelo token secreto do link, não pelo número.
 * O número público (PED-000184) é para as pessoas conversarem, e nunca
 * serve como mecanismo de segurança — por isso não abre nada.
 */
pedidosRouter.get("/:token", async (c) => {
  const pedido = await carregarPorToken(c.env.DB, c.req.param("token"));
  return c.json({ pedido });
});

/** Cria (ou recupera de forma idempotente) o Pix deste pedido. */
pedidosRouter.post("/:token/pix", async (c) => {
  const pagamento = await criarPix(c.env.DB, c.env, c.req.param("token"));
  return c.json({ pagamento });
});

pedidosRouter.post("/:token/cartao", async (c) => {
  const corpo = pagamentoCartaoSchema.parse(await c.req.json());
  const resultado = await pagarComCartao(c.env.DB, c.env, c.req.param("token"), corpo);
  return c.json(resultado);
});

/**
 * O QR de retirada só é entregue ao dono do link, e só depois de pago.
 * Antes disso ele nem existe no banco.
 */
pedidosRouter.get("/:token/retirada", async (c) => {
  const hash = await sha256(c.req.param("token").trim());

  const linha = await c.env.DB.prepare(
    `SELECT p.id, p.status, p.numero, t.nonce, pg.status AS pagamento_status
       FROM pedidos p
       LEFT JOIN retirada_tokens t ON t.pedido_id = p.id AND t.revoked_at IS NULL
       LEFT JOIN pagamentos pg ON pg.pedido_id = p.id
      WHERE p.acesso_token_hash = ?1
      LIMIT 1`,
  )
    .bind(hash)
    .first<{ id: string; status: StatusPedido; numero: string; nonce: string | null; pagamento_status: string | null }>();

  if (!linha) throw erro(404, "PEDIDO_NAO_ENCONTRADO", "Pedido não encontrado.");

  if (linha.pagamento_status !== "APPROVED") {
    throw erro(409, "NAO_PAGO", "O QR de retirada aparece assim que o pagamento for confirmado.");
  }
  if (!linha.nonce) {
    throw erro(404, "SEM_TOKEN", "Este pedido não tem QR de retirada ativo.");
  }

  // O token é recalculado a partir da chave do Worker. Só quem tem o link
  // secreto do pedido chega até aqui, e o banco nunca guardou o segredo.
  const token = await derivarTokenRetirada(c.env.QR_TOKEN_SECRET, linha.id, linha.nonce);

  return c.json({ numero: linha.numero, status: linha.status, token });
});

/** Desistir antes de pagar devolve a peça ao estoque na hora. */
pedidosRouter.post("/:token/cancelar", async (c) => {
  const hash = await sha256(c.req.param("token").trim());
  const pedido = await c.env.DB.prepare(`SELECT id FROM pedidos WHERE acesso_token_hash = ?1`)
    .bind(hash)
    .first<{ id: string }>();

  if (!pedido) throw erro(404, "PEDIDO_NAO_ENCONTRADO", "Pedido não encontrado.");

  await cancelarPedidoGerenciado(c.env.DB, c.env, pedido.id, "CLIENTE", "comprador");

  return c.json({ ok: true });
});
