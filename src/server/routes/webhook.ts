import { Hono } from "hono";
import { comparaSeguro, sha256 } from "../utils/crypto";
import { erro, violouUnique } from "../utils/http";
import { agora, novoId } from "../utils/ids";
import {
  obterOrdemMercadoPago,
  ordemFoiPaga,
  valorPagoEmCentavos,
} from "../services/mercado-pago.service";
import { registrarPagamento } from "../services/pedido.service";

export const webhookMercadoPago = new Hono<{ Bindings: Env }>();

function componentesAssinatura(cabecalho: string) {
  const componentes = new Map(
    cabecalho.split(",").map((parte) => {
      const [chave, ...valor] = parte.trim().split("=");
      return [chave, valor.join("=")] as const;
    }),
  );
  return { ts: componentes.get("ts") ?? "", v1: componentes.get("v1") ?? "" };
}

async function hmacHex(segredo: string, mensagem: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(mensagem));
  return [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function validarAssinaturaMercadoPago(
  assinatura: string,
  requestId: string,
  dataId: string,
  segredo: string,
): Promise<boolean> {
  if (!assinatura || !requestId || !dataId || !segredo) return false;
  const { ts, v1 } = componentesAssinatura(assinatura);
  if (!ts || !/^[a-f0-9]{64}$/i.test(v1)) return false;
  const esperado = await hmacHex(segredo, `id:${dataId};request-id:${requestId};ts:${ts};`);
  return comparaSeguro(esperado.toLowerCase(), v1.toLowerCase());
}

webhookMercadoPago.post("/mercado-pago", async (c) => {
  const corpoTexto = await c.req.text();
  let corpo: {
    id?: string | number;
    action?: string;
    type?: string;
    date_created?: string;
    data?: { id?: string; external_reference?: string };
  };
  try {
    corpo = JSON.parse(corpoTexto);
  } catch {
    throw erro(400, "WEBHOOK_INVALIDO", "Notificação inválida.");
  }

  const dataId = c.req.query("data.id") ?? corpo.data?.id ?? "";
  const requestId = c.req.header("x-request-id") ?? "";
  const assinatura = c.req.header("x-signature") ?? "";
  const valida = await validarAssinaturaMercadoPago(
    assinatura,
    requestId,
    dataId,
    c.env.MERCADO_PAGO_WEBHOOK_SECRET,
  );
  if (!valida) throw erro(401, "ASSINATURA_INVALIDA", "Assinatura do webhook inválida.");

  const eventoId = String(corpo.id ?? `${corpo.action ?? "order"}:${dataId}:${corpo.date_created ?? requestId}`);
  const ts = agora();
  const eventoExistente = await c.env.DB.prepare(
    `SELECT processed_at FROM webhook_events
      WHERE provider = 'MERCADO_PAGO' AND external_event_id = ?1 LIMIT 1`,
  )
    .bind(eventoId)
    .first<{ processed_at: string | null }>();
  if (eventoExistente?.processed_at) return c.json({ ok: true, duplicado: true });

  if (!eventoExistente) {
    try {
      await c.env.DB.prepare(
        `INSERT INTO webhook_events
           (id, provider, external_event_id, event_type, payload_hash, payload_raw, created_at)
         VALUES (?1, 'MERCADO_PAGO', ?2, ?3, ?4, ?5, ?6)`,
      )
        .bind(
          novoId("wh"),
          eventoId,
          corpo.type ?? corpo.action ?? "order",
          await sha256(corpoTexto),
          corpoTexto.slice(0, 20_000),
          ts,
        )
        .run();
    } catch (e) {
      if (!violouUnique(e)) throw e;
    }
  }

  const ordem = await obterOrdemMercadoPago(c.env, dataId);
  if (ordemFoiPaga(ordem)) {
    const pagamento = await c.env.DB.prepare(
      `SELECT pg.pedido_id, pg.valor_centavos
         FROM pagamentos pg
        WHERE pg.provider = 'MERCADO_PAGO' AND pg.external_id = ?1 LIMIT 1`,
    )
      .bind(dataId)
      .first<{ pedido_id: string; valor_centavos: number }>();

    if (!pagamento) {
      console.error("Webhook de order sem pagamento local", dataId);
      throw erro(404, "PAGAMENTO_NAO_ENCONTRADO", "Pagamento local não encontrado.");
    }
    if (valorPagoEmCentavos(ordem) !== pagamento.valor_centavos) {
      console.error("Valor divergente no webhook", dataId);
      throw erro(409, "VALOR_DIVERGENTE", "O valor recebido não corresponde ao pedido.");
    }

    await registrarPagamento(c.env.DB, c.env, pagamento.pedido_id, {
      provider: "MERCADO_PAGO",
      adminEmail: "webhook@mercadopago",
      externalId: dataId,
    });
  }

  await c.env.DB.prepare(
    `UPDATE webhook_events SET processed_at = ?1
      WHERE provider = 'MERCADO_PAGO' AND external_event_id = ?2`,
  )
    .bind(agora(), eventoId)
    .run();

  return c.json({ ok: true });
});
