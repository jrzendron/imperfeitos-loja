import { useSyncExternalStore } from "react";

export interface ItemCarrinho {
  produto_variacao_id: string;
  produto_nome: string;
  variacao_nome: string;
  valor_centavos: number;
  quantidade: number;
}

const CHAVE = "igreja-loja:carrinho";
let itens: ItemCarrinho[] = ler();
const ouvintes = new Set<() => void>();

function ler(): ItemCarrinho[] {
  try {
    const bruto = localStorage.getItem(CHAVE);
    return bruto ? (JSON.parse(bruto) as ItemCarrinho[]) : [];
  } catch {
    // Navegação privada ou storage bloqueado: o carrinho vive só na memória.
    return [];
  }
}

function gravar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(itens));
  } catch {
    /* segue sem persistir */
  }
  ouvintes.forEach((f) => f());
}

export const carrinho = {
  adicionar(item: ItemCarrinho) {
    const existente = itens.find((i) => i.produto_variacao_id === item.produto_variacao_id);
    if (existente) existente.quantidade += item.quantidade;
    else itens = [...itens, item];
    gravar();
  },
  adicionarVarios(novos: ItemCarrinho[]) {
    const atualizados = itens.map((item) => ({ ...item }));
    for (const novo of novos) {
      const existente = atualizados.find(
        (item) => item.produto_variacao_id === novo.produto_variacao_id,
      );
      if (existente) existente.quantidade += novo.quantidade;
      else atualizados.push(novo);
    }
    itens = atualizados;
    gravar();
  },
  definirQuantidade(id: string, quantidade: number) {
    itens = quantidade <= 0
      ? itens.filter((i) => i.produto_variacao_id !== id)
      : itens.map((i) => (i.produto_variacao_id === id ? { ...i, quantidade } : i));
    gravar();
  },
  remover(id: string) {
    itens = itens.filter((i) => i.produto_variacao_id !== id);
    gravar();
  },
  limpar() {
    itens = [];
    gravar();
  },
  /** O total aqui é só para a tela. O que vale é o que o servidor calcula. */
  total: () => itens.reduce((s, i) => s + i.valor_centavos * i.quantidade, 0),
  itens: () => itens,
};

export function useCarrinho() {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => itens,
    () => itens,
  );
}
