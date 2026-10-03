import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelarPedidoGerenciado } from "../../src/server/services/cancelamento-pedido.service";

const env = { MERCADO_PAGO_ACCESS_TOKEN: "token-falso-local" } as Env;
const pedido = {
  id: "ped-1", numero: "PED-000001", status: "PAGO", valor_total_centavos: 9000,
  pagamento_provider: "MERCADO_PAGO", pagamento_status: "APPROVED", pagamento_valor: 9000,
  external_id: "ORD-1", conta_pagamento_id: null,
};

function banco() {
  const batch = vi.fn().mockResolvedValue([{ meta: { changes: 1 } }]);
  const db = {
    prepare: (sql: string) => ({
      bind: (..._valores: unknown[]) => ({
        first: async () => sql.includes("FROM pedidos p LEFT JOIN pagamentos") ? pedido
          : sql.includes("FROM estoque_movimentos") ? { total: 2 } : null,
        all: async () => ({ results: [{ produto_variacao_id: "var-p", quantidade: 2 }] }),
        run: async () => ({ meta: { changes: 1 } }),
      }),
    }),
    batch,
  } as unknown as D1Database;
  return { db, batch };
}

afterEach(() => vi.unstubAllGlobals());

describe("cancelamento de pedido pago pelo Mercado Pago", () => {
  it("só atualiza caixa e estoque após ordem integralmente reembolsada", async () => {
    let consultas = 0;
    const chamada = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/refund")) return new Response(JSON.stringify({ id: "ORD-1", status: "refunded" }), { status: 200 });
      consultas++;
      return new Response(JSON.stringify({
        id: "ORD-1", external_reference: "ped-1", total_amount: "90.00",
        status: consultas === 1 ? "processed" : "refunded",
        status_detail: consultas === 1 ? "accredited" : "refunded",
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", chamada);
    const { db, batch } = banco();
    const resultado = await cancelarPedidoGerenciado(db, env, "ped-1", "ADMIN", "admin@teste.local");
    expect(resultado).toEqual({ status: "REEMBOLSADO", reembolso_centavos: 9000 });
    expect(chamada).toHaveBeenCalledTimes(3);
    expect(batch).toHaveBeenCalledOnce();
  });

  it("mantém caixa e estoque e bloqueia entrega se o Mercado Pago negar o reembolso", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) =>
      url.endsWith("/refund")
        ? new Response("{}", { status: 409 })
        : new Response(JSON.stringify({
          id: "ORD-1", external_reference: "ped-1", total_amount: "90.00",
          status: "processed", status_detail: "accredited",
        }), { status: 200 }),
    ));
    const { db, batch } = banco();
    await expect(cancelarPedidoGerenciado(db, env, "ped-1", "ADMIN", "admin@teste.local"))
      .rejects.toMatchObject({ codigo: "REEMBOLSO_RECUSADO" });
    expect(batch).not.toHaveBeenCalled();
  });
});
