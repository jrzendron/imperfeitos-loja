import { describe, it, expect } from "vitest";
import { formatarBRL, formatarTelefone, mascararTelefone } from "../../src/shared/format";
import { criarPedidoSchema, pagamentoCartaoSchema } from "../../src/shared/schemas";

describe("dinheiro", () => {
  it("formata centavos sem passar por float", () => {
    expect(formatarBRL(4500)).toContain("45,00");
    expect(formatarBRL(4900)).toContain("49,00");
    expect(formatarBRL(0)).toContain("0,00");
  });
});

describe("schema de pagamento com cartão", () => {
  it("aceita o identificador de dispositivo gerado pelo Mercado Pago", () => {
    const entrada = {
      attempt_id: "c4ee2948-6062-4f3d-bd30-3d42b9f85079",
      token: "token-de-teste-12345",
      payment_method_id: "visa",
      payment_type_id: "credit_card",
      installments: 1,
      payer: { email: "test@testuser.com", identification: { type: "CPF", number: "12345678909" } },
      device_id: "d".repeat(512),
    };
    expect(pagamentoCartaoSchema.parse(entrada).device_id).toHaveLength(512);
  });

  it("aceita débito à vista e recusa parcelas no débito", () => {
    const entrada = {
      attempt_id: "c4ee2948-6062-4f3d-bd30-3d42b9f85079",
      token: "token-de-teste-12345",
      payment_method_id: "visa",
      payment_type_id: "debit_card",
      installments: 1,
      payer: { email: "test@testuser.com", identification: { type: "CPF", number: "12345678909" } },
    };
    expect(pagamentoCartaoSchema.parse(entrada).payment_type_id).toBe("debit_card");
    expect(() => pagamentoCartaoSchema.parse({ ...entrada, installments: 2 })).toThrow();
  });
});

describe("telefone", () => {
  it("formata celular e fixo", () => {
    expect(formatarTelefone("47999887766")).toBe("(47) 99988-7766");
    expect(formatarTelefone("4733445566")).toBe("(47) 3344-5566");
  });

  it("mascara mantendo só os quatro últimos", () => {
    const m = mascararTelefone("47999887766");
    expect(m).toContain("(47)");
    expect(m).toContain("7766");
    expect(m).not.toContain("99988");
  });
});

describe("schema de criação de pedido", () => {
  const base = {
    cliente: { nome: "Fulano de Tal", telefone: "(47) 99988-7766", cpf: "529.982.247-25", cidade: "Blumenau" },
    itens: [{ produto_variacao_id: "var_m", quantidade: 1 }],
  };

  it("aceita o corpo mínimo e normaliza o telefone", () => {
    expect(criarPedidoSchema.parse(base).cliente.telefone).toBe("47999887766");
  });

  it("exige a cidade e remove espaços extras", () => {
    expect(criarPedidoSchema.parse({ ...base, cliente: { ...base.cliente, cidade: "  Blumenau  " } }).cliente.cidade).toBe("Blumenau");
    expect(() => criarPedidoSchema.parse({ ...base, cliente: { ...base.cliente, cidade: " " } })).toThrow();
  });

  it("RECUSA qualquer tentativa de mandar preço", () => {
    expect(() =>
      criarPedidoSchema.parse({
        ...base,
        itens: [{ produto_variacao_id: "var_m", quantidade: 1, valor_centavos: 1 }],
      }),
    ).toThrow();
  });

  it("recusa campo extra no cliente", () => {
    expect(() =>
      criarPedidoSchema.parse({ ...base, cliente: { ...base.cliente, admin: true } }),
    ).toThrow();
  });

  it("recusa carrinho vazio e quantidade inválida", () => {
    expect(() => criarPedidoSchema.parse({ ...base, itens: [] })).toThrow();
    expect(() =>
      criarPedidoSchema.parse({ ...base, itens: [{ produto_variacao_id: "var_m", quantidade: 0 }] }),
    ).toThrow();
    expect(() =>
      criarPedidoSchema.parse({ ...base, itens: [{ produto_variacao_id: "var_m", quantidade: 1.5 }] }),
    ).toThrow();
  });

  it("recusa telefone incompleto", () => {
    expect(() =>
      criarPedidoSchema.parse({ ...base, cliente: { ...base.cliente, telefone: "99887766" } }),
    ).toThrow();
  });
});
