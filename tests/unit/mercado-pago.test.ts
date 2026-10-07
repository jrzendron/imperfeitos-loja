import { afterEach, describe, expect, it, vi } from "vitest";
import { validarAssinaturaMercadoPago } from "../../src/server/routes/webhook";
import { criarPix, ordemFoiPaga, valorPagoEmCentavos } from "../../src/server/services/mercado-pago.service";
import { criarPedido } from "../../src/server/services/pedido.service";

afterEach(() => vi.unstubAllGlobals());

async function assinatura(segredo: string, mensagem: string) {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(mensagem));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("Mercado Pago", () => {
  it("não cria pedido nem reserva estoque em produção sem conta recebedora no painel", async () => {
    const consultas: string[] = [];
    const db = {
      prepare: (sql: string) => {
        consultas.push(sql);
        return { first: async () => null };
      },
    } as unknown as D1Database;
    await expect(criarPedido(db, { APP_ENV: "production" } as Env, {
      cliente: { nome: "Comprador", telefone: "47999999999", cpf: "10213307952", email: "comprador@example.com" },
      itens: [{ produto_variacao_id: "pp", quantidade: 1 }],
    })).rejects.toMatchObject({ codigo: "PAGAMENTOS_INDISPONIVEIS" });
    expect(consultas).toEqual(["SELECT * FROM contas_pagamento WHERE ativo = 1 LIMIT 1"]);
  });

  it("aceita uma assinatura HMAC legítima e recusa uma adulterada", async () => {
    const segredo = "segredo-de-teste";
    const dataId = "ORD01ABC";
    const requestId = "req-123";
    const ts = "1742505638683";
    const v1 = await assinatura(segredo, `id:${dataId};request-id:${requestId};ts:${ts};`);

    await expect(
      validarAssinaturaMercadoPago(`ts=${ts},v1=${v1}`, requestId, dataId, segredo),
    ).resolves.toBe(true);
    await expect(
      validarAssinaturaMercadoPago(`ts=${ts},v1=${v1}`, requestId, `${dataId}X`, segredo),
    ).resolves.toBe(false);
  });

  it("só considera pago quando a order está processada e acreditada", () => {
    expect(
      ordemFoiPaga({ id: "ORD1", status: "processed", status_detail: "accredited" }),
    ).toBe(true);
    expect(
      ordemFoiPaga({ id: "ORD2", status: "action_required", status_detail: "waiting_transfer" }),
    ).toBe(false);
  });

  it("converte o valor pago para centavos", () => {
    expect(valorPagoEmCentavos({ id: "ORD1", total_paid_amount: "49.90" })).toBe(4990);
  });

  it("não publica nem salva Pix de sandbox na loja de produção", async () => {
    const comandos: string[] = [];
    const batch = vi.fn();
    const db = {
      prepare: (sql: string) => ({
        bind: (..._valores: unknown[]) => ({
          first: async () => sql.includes("FROM pedidos p")
            ? { id: "ped-1", numero: "PED-000001", status: "AGUARDANDO_PAGAMENTO", valor_total_centavos: 100, expires_at: null, email: "comprador@teste.local" }
            : sql.includes("SELECT conta_pagamento_id FROM pagamentos") ? { conta_pagamento_id: null } : null,
          run: async () => { comandos.push(sql); return { meta: { changes: 1 } }; },
        }),
        first: async () => null,
      }),
      batch,
    } as unknown as D1Database;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "ORD-TESTE",
      transactions: { payments: [{ payment_method: {
        qr_code: "00020159TESTUSER6304F6D8",
        ticket_url: "https://www.mercadopago.com.br/sandbox/payments/123/ticket",
      } }] },
    }), { status: 200 })));

    await expect(criarPix(db, { APP_ENV: "production", MERCADO_PAGO_ACCESS_TOKEN: "token-falso" } as Env, "token"))
      .rejects.toMatchObject({ codigo: "PIX_AMBIENTE_TESTE" });
    expect(comandos.some((sql) => sql.includes("status = 'REJECTED'") && sql.includes("pix_copia_cola = NULL"))).toBe(true);
    expect(batch).not.toHaveBeenCalled();
  });

  it("registra como recusada uma order Pix que o Mercado Pago devolveu como failed", async () => {
    const comandos: Array<{ sql: string; valores: unknown[] }> = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (...valores: unknown[]) => ({
          first: async () => sql.includes("FROM pedidos p")
            ? { id: "ped-1", numero: "PED-000001", status: "AGUARDANDO_PAGAMENTO", valor_total_centavos: 100, expires_at: null, email: "comprador@example.com" }
            : sql.includes("SELECT conta_pagamento_id FROM pagamentos") ? { conta_pagamento_id: null } : null,
          run: async () => { comandos.push({ sql, valores }); return { meta: { changes: 1 } }; },
        }),
        first: async () => null,
      }),
    } as unknown as D1Database;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      errors: [{ code: "failed", details: ["PAY-1: processing_error"] }],
      data: {
        id: "ORD-FAILED",
        status: "failed",
        transactions: { payments: [{ status: "failed", status_detail: "processing_error" }] },
      },
    }), { status: 402 })));

    await expect(criarPix(db, { APP_ENV: "production", MERCADO_PAGO_ACCESS_TOKEN: "token-falso" } as Env, "token"))
      .rejects.toMatchObject({ codigo: "ERRO_MERCADO_PAGO" });
    expect(comandos).toContainEqual(expect.objectContaining({
      sql: expect.stringContaining("status = 'REJECTED'"),
      valores: ["ORD-FAILED", expect.any(String), "ped-1", "pix-ped-1"],
    }));
  });
});

