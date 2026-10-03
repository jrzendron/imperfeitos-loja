import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelarOrdemMercadoPago, reembolsarOrdemMercadoPago } from "../../src/server/services/mercado-pago.service";
import { testarContaPagamento } from "../../src/server/services/conta-pagamento.service";

const env = {
  MERCADO_PAGO_ACCESS_TOKEN: "token-falso-local",
  MERCADO_PAGO_PUBLIC_KEY: "chave-publica-falsa-local",
  MERCADO_PAGO_WEBHOOK_SECRET: "segredo-falso-local",
} as Env;
const db = {
  prepare: () => ({ first: async () => null }),
} as unknown as D1Database;

afterEach(() => vi.unstubAllGlobals());

describe("conexões simuladas com Mercado Pago", () => {
  it("valida a conta sem criar cobrança e sem devolver credenciais", async () => {
    const chamada = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 12345 }), { status: 200 }));
    vi.stubGlobal("fetch", chamada);
    const resultado = await testarContaPagamento(db, env);
    expect(resultado).toMatchObject({ ok: true, user_id: "12345" });
    expect(chamada).toHaveBeenCalledOnce();
    expect(chamada.mock.calls.at(0)?.[0]).toBe("https://api.mercadolibre.com/users/me");
    expect(JSON.stringify(resultado)).not.toContain("token-falso-local");
  });

  it("reembolsa a ordem inteira com chave idempotente e bloqueia resposta divergente", async () => {
    const chamada = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "ORD-1", status: "refunded", status_detail: "refunded",
    }), { status: 200 }));
    vi.stubGlobal("fetch", chamada);
    await reembolsarOrdemMercadoPago(db, env, "ORD-1", null, "ped-1");
    const [url, init] = chamada.mock.calls.at(0)!;
    expect(url).toBe("https://api.mercadopago.com/v1/orders/ORD-1/refund");
    expect(init.headers["X-Idempotency-Key"]).toBe("refund-ped-1");
    expect(init.body).toBe("{}");
    chamada.mockResolvedValue(new Response(JSON.stringify({ id: "OUTRA-ORDEM" }), { status: 200 }));
    await expect(reembolsarOrdemMercadoPago(db, env, "ORD-1", null, "ped-1"))
      .rejects.toMatchObject({ codigo: "RESPOSTA_MP_INVALIDA" });
  });

  it("não registra cancelamento quando o provedor não confirmou", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "ORD-2", status: "processing",
    }), { status: 200 })));
    await expect(cancelarOrdemMercadoPago(db, env, "ORD-2", null, "ped-2"))
      .rejects.toMatchObject({ codigo: "CANCELAMENTO_MP_NAO_CONFIRMADO" });
  });
});
