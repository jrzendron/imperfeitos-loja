export type StatusPedido =
  | "AGUARDANDO_PAGAMENTO"
  | "PAGO"
  | "PRONTO_PARA_RETIRADA"
  | "RETIRADO"
  | "CANCELADO"
  | "EXPIRADO"
  | "REEMBOLSADO"
  | "PAGO_REVISAR";

export const STATUS_LABEL: Record<StatusPedido, string> = {
  AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
  PAGO: "Pago",
  PRONTO_PARA_RETIRADA: "Pronto para retirada",
  RETIRADO: "Retirado",
  CANCELADO: "Cancelado",
  EXPIRADO: "Expirado",
  REEMBOLSADO: "Reembolsado",
  PAGO_REVISAR: "Pago — revisar",
};

/** Status em que o QR de retirada é válido. */
export const STATUS_RETIRAVEL: StatusPedido[] = ["PAGO", "PRONTO_PARA_RETIRADA"];

export interface VariacaoPublica {
  id: string;
  sku: string;
  nome: string;
  valor_centavos: number;
  ordem: number;
  disponivel: number;
}

export interface ImagemPublica {
  url: string;
  alt: string | null;
}

export interface ProdutoPublico {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  variacoes: VariacaoPublica[];
  imagens: ImagemPublica[];
}

export interface ItemPedido {
  produto_variacao_id: string;
  produto_nome_snapshot: string;
  variacao_nome_snapshot: string;
  quantidade: number;
  valor_unitario_centavos: number;
  subtotal_centavos: number;
}

export interface PedidoPublico {
  numero: string;
  status: StatusPedido;
  valor_total_centavos: number;
  expires_at: string | null;
  created_at: string;
  cliente_nome: string;
  itens: ItemPedido[];
  retirada_token?: string | null;
  retirado_em?: string | null;
}

export interface ApiErro {
  erro: string;
  mensagem: string;
  detalhes?: unknown;
}
