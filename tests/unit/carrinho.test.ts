import { beforeEach, describe, expect, it } from "vitest";
import { carrinho, type ItemCarrinho } from "../../src/app/lib/carrinho";

const item = (id: string, tamanho: string, quantidade: number): ItemCarrinho => ({
  produto_variacao_id: id,
  produto_nome: "Camiseta",
  variacao_nome: tamanho,
  valor_centavos: 4500,
  quantidade,
});

describe("carrinho com vários tamanhos", () => {
  beforeEach(() => carrinho.limpar());

  it("adiciona tamanhos diferentes em uma única operação", () => {
    carrinho.adicionarVarios([item("var_p", "P", 1), item("var_m", "M", 2)]);

    expect(carrinho.itens()).toEqual([
      expect.objectContaining({ produto_variacao_id: "var_p", quantidade: 1 }),
      expect.objectContaining({ produto_variacao_id: "var_m", quantidade: 2 }),
    ]);
  });

  it("soma a quantidade quando o tamanho já está no carrinho", () => {
    carrinho.adicionar(item("var_p", "P", 1));
    carrinho.adicionarVarios([item("var_p", "P", 2)]);

    expect(carrinho.itens()).toHaveLength(1);
    expect(carrinho.itens()[0]?.quantidade).toBe(3);
  });
});
