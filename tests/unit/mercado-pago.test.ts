import { afterEach, describe, expect, it, vi } from "vitest";
import { validarAssinaturaMercadoPago } from "../../src/server/routes/webhook";
import { criarPix, ordemFoiPaga, pagarComCartao, reconciliarPagamentoPendente, valorPagoEmCentavos } from "../../src/server/services/mercado-pago.service";
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
      cliente: { nome: "Comprador", telefone: "47999999999", cpf: "10213307952", cidade: "Blumenau", email: "comprador@example.com" },
      itens: [{ produto_variacao_id: "pp", quantidade: 1 }],
    })).rejects.toMatchObject({ codigo: "PAGAMENTOS_INDISPONIVEIS" });
    expect(consultas).toEqual(["SELECT * FROM contas_pagamento WHERE ativo = 1 LIMIT 1"]);
  });

  it("aceita uma assinatura HMAC legítima e recusa uma adulterada", async () => {
    const segredo = "segredo-de-teste";
    const dataId = "ORD01ABC";
    const requestId = "req-123";
    const ts = "1742505638683";
    const v1 = await assinatura(segredo, `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`);

    await expect(
      validarAssinaturaMercadoPago(`ts=${ts},v1=${v1}`, requestId, dataId, segredo),
    ).resolves.toBe(true);
    await expect(
      validarAssinaturaMercadoPago(`ts=${ts},v1=${v1}`, requestId, `${dataId}X`, segredo),
    ).resolves.toBe(false);
  });

  it("valida IDs de order em maiúsculas usando o manifest em minúsculas do Mercado Pago", async () => {
    const segredo = "segredo-de-teste";
    const id = "ORDTST01ABCDEF";
    const requestId = "req-ord-1";
    const ts = "1742505638683";
    const v1 = await assinatura(segredo, `id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`);
    await expect(validarAssinaturaMercadoPago(`ts=${ts},v1=${v1}`, requestId, id, segredo))
      .resolves.toBe(true);
    await expect(validarAssinaturaMercadoPago(`ts=${ts},v1=${v1}`, requestId, `${id}X`, segredo))
      .resolves.toBe(false);
  });

  it("aceita também a assinatura em maiúsculas usada pelo simulador do painel", async () => {
    const segredo = "segredo-de-teste";
    const id = "ORDTST01ABCDEF";
    const requestId = "req-simulador";
    const ts = "1742505638683";
    const v1 = await assinatura(segredo, `id:${id};request-id:${requestId};ts:${ts};`);
    await expect(validarAssinaturaMercadoPago(`ts=${ts},v1=${v1}`, requestId, id, segredo))
      .resolves.toBe(true);
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

  it("limita consultas repetidas ao provedor enquanto o pagamento está pendente", async () => {
    const db = {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () => sql.includes("FROM pagamentos pg")
            ? { external_id: "ORD-1", valor_centavos: 4500, conta_pagamento_id: null }
            : null,
          run: async () => ({ meta: { changes: 0 } }),
        }),
      }),
    } as unknown as D1Database;
    const consulta = vi.fn();
    vi.stubGlobal("fetch", consulta);

    await expect(reconciliarPagamentoPendente(db, {} as Env, "ped-1")).resolves.toBe(false);
    expect(consulta).not.toHaveBeenCalled();
  });

  it("não aprova cobrança com referência ou valor divergente", async () => {
    const comandos: string[] = [];
    const db = {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () => sql.includes("FROM pagamentos pg")
            ? { external_id: "ORD-1", valor_centavos: 4500, conta_pagamento_id: null }
            : null,
          run: async () => {
            comandos.push(sql);
            return { meta: { changes: 1 } };
          },
        }),
      }),
    } as unknown as D1Database;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "ORD-1",
      external_reference: "outro-pedido",
      total_amount: "45.00",
      total_paid_amount: "45.00",
      status: "processed",
      status_detail: "accredited",
    }), { status: 200 })));

    await expect(reconciliarPagamentoPendente(db, { MERCADO_PAGO_ACCESS_TOKEN: "token-teste" } as Env, "ped-1"))
      .rejects.toMatchObject({ codigo: "ORDER_DIVERGENTE" });
    expect(comandos).toHaveLength(1);
    expect(comandos[0]).toContain("UPDATE pagamentos SET updated_at");
  });

  it("não publica nem salva Pix de sandbox na loja de produção", async () => {
    const comandos: string[] = [];
    const batch = vi.fn();
    const db = {
      prepare: (sql: string) => ({
        bind: (..._valores: unknown[]) => ({
          first: async () => sql.includes("FROM pedidos p")
            ? { id: "ped-1", numero: "PED-000001", status: "AGUARDANDO_PAGAMENTO", valor_total_centavos: 100, expires_at: null, email: "comprador@teste.local", nome: "Comprador Teste" }
            : sql.includes("SELECT conta_pagamento_id, idempotency_key FROM pagamentos") ? { conta_pagamento_id: null, idempotency_key: "pix-ped-1" } : null,
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
    const requisicao = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(requisicao.body as string).payer.first_name).toBe("Comprador");
    expect(comandos.some((sql) => sql.includes("status = 'REJECTED'") && sql.includes("pix_copia_cola = NULL"))).toBe(true);
    expect(batch).not.toHaveBeenCalled();
  });

  it("registra como recusada uma order Pix que o Mercado Pago devolveu como failed", async () => {
    const comandos: Array<{ sql: string; valores: unknown[] }> = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (...valores: unknown[]) => ({
          first: async () => sql.includes("FROM pedidos p")
            ? { id: "ped-1", numero: "PED-000001", status: "AGUARDANDO_PAGAMENTO", valor_total_centavos: 100, expires_at: null, email: "comprador@example.com", nome: "Comprador Teste" }
            : sql.includes("SELECT conta_pagamento_id, idempotency_key FROM pagamentos") ? { conta_pagamento_id: null, idempotency_key: "pix-ped-1" } : null,
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

  it("libera nova tentativa quando uma order de cartão é recusada com HTTP 402", async () => {
    const comandos: Array<{ sql: string; valores: unknown[] }> = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (...valores: unknown[]) => ({
          first: async () => sql.includes("FROM pedidos p")
            ? { id: "ped-1", numero: "TEST-000001", status: "AGUARDANDO_PAGAMENTO", valor_total_centavos: 4500, expires_at: null, email: "test@testuser.com", nome: "Teste" }
            : null,
          run: async () => { comandos.push({ sql, valores }); return { meta: { changes: 1 } }; },
        }),
        first: async () => null,
      }),
    } as unknown as D1Database;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      errors: [{ code: "failed", details: ["card_declined"] }],
      data: {
        id: "ORD-CARD-FAILED", status: "failed", status_detail: "cc_rejected_other_reason",
        transactions: { payments: [{ status: "failed", status_detail: "cc_rejected_other_reason" }] },
      },
    }), { status: 402 })));

    const resultado = await pagarComCartao(db, {
      APP_ENV: "staging", MERCADO_PAGO_PUBLIC_KEY: "chave-de-teste", MERCADO_PAGO_ACCESS_TOKEN: "token-de-teste",
    } as Env, "acesso-de-teste", {
      attempt_id: "123e4567-e89b-42d3-a456-426614174000",
      payment_method_id: "visa", payment_type_id: "credit_card", token: "token-ficticio", installments: 1,
      payer: { email: "test@testuser.com", identification: { type: "CPF", number: "12345678909" } },
    });
    expect(resultado).toMatchObject({ status: "RECUSADO", status_detail: "cc_rejected_other_reason" });
    expect(comandos).toContainEqual(expect.objectContaining({
      sql: expect.stringContaining("status = 'REJECTED'"),
      valores: ["ORD-CARD-FAILED", expect.any(String), "ped-1", "card-ped-1-123e4567-e89b-42d3-a456-426614174000"],
    }));
  });
});

