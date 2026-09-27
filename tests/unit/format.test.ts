import { describe, it, expect } from "vitest";
import { formatarBRL, formatarTelefone, mascararTelefone } from "../../src/shared/format";
import { criarPedidoSchema } from "../../src/shared/schemas";

describe("dinheiro", () => {
  it("formata centavos sem passar por float", () => {
    expect(formatarBRL(4500)).toContain("45,00");
    expect(formatarBRL(4900)).toContain("49,00");
    expect(formatarBRL(0)).toContain("0,00");
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
    cliente: { nome: "Fulano de Tal", telefone: "(47) 99988-7766", cpf: "529.982.247-25" },
    itens: [{ produto_variacao_id: "var_m", quantidade: 1 }],
  };

  it("aceita o corpo mínimo e normaliza o telefone", () => {
    expect(criarPedidoSchema.parse(base).cliente.telefone).toBe("47999887766");
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
