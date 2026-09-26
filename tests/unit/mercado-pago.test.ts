import { describe, expect, it } from "vitest";
import { validarAssinaturaMercadoPago } from "../../src/server/routes/webhook";
import { ordemFoiPaga, valorPagoEmCentavos } from "../../src/server/services/mercado-pago.service";

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
});

