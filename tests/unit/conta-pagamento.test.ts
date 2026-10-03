import { describe, expect, it } from "vitest";
import { cifrar, decifrar } from "../../src/server/services/conta-pagamento.service";

function ambiente(chave: Uint8Array): Env {
  return { PAYMENT_CONFIG_KEY: btoa(String.fromCharCode(...chave)) } as Env;
}

describe("cofre da conta de pagamentos", () => {
  it("cifra os segredos com nonce único e só abre com a chave correta", async () => {
    const env = ambiente(crypto.getRandomValues(new Uint8Array(32)));
    const outro = ambiente(crypto.getRandomValues(new Uint8Array(32)));
    const token = "APP_USR-segredo-de-exemplo";
    const primeiro = await cifrar(env, token);
    const segundo = await cifrar(env, token);

    expect(primeiro).not.toContain(token);
    expect(primeiro).not.toBe(segundo);
    await expect(decifrar(env, primeiro)).resolves.toBe(token);
    await expect(decifrar(outro, primeiro)).rejects.toThrow();
  });
});
