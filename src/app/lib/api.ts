import type { ProdutoPublico, PedidoPublico, PedidoConsultadoCpf } from "../../shared/types";

export class ErroApi extends Error {
  constructor(readonly status: number, readonly codigo: string, mensagem: string) {
    super(mensagem);
  }
}

const TOKEN_ADMIN = "igreja-loja:admin-token";

export const adminToken = {
  ler: () => {
    try {
      return sessionStorage.getItem(TOKEN_ADMIN) ?? "";
    } catch {
      return "";
    }
  },
  gravar: (v: string) => {
    try {
      sessionStorage.setItem(TOKEN_ADMIN, v);
    } catch {
      /* navegação privada: segue sem lembrar */
    }
  },
  limpar: () => {
    try {
      sessionStorage.removeItem(TOKEN_ADMIN);
    } catch {
      /* idem */
    }
  },
};

async function pedir<T>(caminho: string, opcoes: RequestInit & { admin?: boolean } = {}): Promise<T> {
  const { admin, ...resto } = opcoes;
  const cabecalhos = new Headers(resto.headers);
  // FormData define o próprio Content-Type, com o boundary. Definir na mão
  // quebra o upload de forma difícil de diagnosticar.
  if (resto.body && !(resto.body instanceof FormData)) {
    cabecalhos.set("Content-Type", "application/json");
  }
  if (admin) cabecalhos.set("Authorization", `Bearer ${adminToken.ler()}`);

  let resposta: Response;
  try {
    resposta = await fetch(`/api${caminho}`, { ...resto, headers: cabecalhos });
  } catch (erro) {
    if (erro instanceof TypeError) {
      throw new ErroApi(
        0,
        "SEM_CONEXAO",
        "Sem conexão. Verifique a internet e tente novamente.",
      );
    }
    throw erro;
  }
  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : {};

  if (!resposta.ok) {
    throw new ErroApi(
      resposta.status,
      dados.erro ?? "ERRO",
      dados.mensagem ?? "Não foi possível completar a operação.",
    );
  }
  return dados as T;
}

export const api = {
  catalogo: () => pedir<{ produtos: ProdutoPublico[] }>("/produtos"),
  produto: (slug: string) => pedir<{ produto: ProdutoPublico }>(`/produtos/${slug}`),

  criarPedido: (corpo: unknown) =>
    pedir<{ numero: string; acesso_token: string; codigo_retirada: string }>("/pedidos", {
      method: "POST",
      body: JSON.stringify(corpo),
    }),
  consultarPedidosCpf: (cpf: string) =>
    pedir<{ pedidos: PedidoConsultadoCpf[] }>("/pedidos/consultar-cpf", {
      method: "POST",
      body: JSON.stringify({ cpf }),
    }),

  pedido: (token: string) => pedir<{ pedido: PedidoPublico }>(`/pedidos/${token}`),
  criarPix: (token: string) =>
    pedir<{ pagamento: NonNullable<PedidoPublico["pagamento"]> }>(`/pedidos/${token}/pix`, {
      method: "POST",
    }),
  configuracaoPagamentos: () =>
    pedir<{ mercado_pago_public_key: string | null }>("/pagamentos/config"),
  pagarCartao: (token: string, corpo: unknown) =>
    pedir<{ status: "PAGO" | "PROCESSANDO" | "RECUSADO"; status_detail: string | null }>(
      `/pedidos/${token}/cartao`,
      { method: "POST", body: JSON.stringify(corpo) },
    ),
  qrRetirada: (token: string) =>
    pedir<{ numero: string; status: string; token: string }>(`/pedidos/${token}/retirada`),
  cancelarPedido: (token: string) => pedir<{ ok: true }>(`/pedidos/${token}/cancelar`, { method: "POST" }),

  admin: {
    sessao: () => pedir<{ ok: true; email: string }>("/admin/sessao", { admin: true }),
    dashboard: () => pedir<any>("/admin/dashboard", { admin: true }),
    pedidos: (params: Record<string, string>) =>
      pedir<any>(`/admin/pedidos?${new URLSearchParams(params)}`, { admin: true }),
    pedido: (id: string) => pedir<any>(`/admin/pedidos/${id}`, { admin: true }),
    marcarPago: (id: string) =>
      pedir<any>(`/admin/pedidos/${id}/marcar-pago`, { method: "POST", admin: true }),
    cancelar: (id: string) =>
      pedir<any>(`/admin/pedidos/${id}/cancelar`, { method: "POST", admin: true }),
    ajustarEstoque: (corpo: unknown) =>
      pedir<any>("/admin/estoque/ajuste", { method: "POST", body: JSON.stringify(corpo), admin: true }),
    consultarRetirada: (token: string) =>
      pedir<any>("/admin/retirada/consultar", {
        method: "POST",
        body: JSON.stringify({ token }),
        admin: true,
      }),
    produtos: () => pedir<any>("/admin/produtos", { admin: true }),
    criarProduto: (corpo: unknown) =>
      pedir<any>("/admin/produtos", { method: "POST", body: JSON.stringify(corpo), admin: true }),
    editarProduto: (id: string, corpo: unknown) =>
      pedir<any>(`/admin/produtos/${id}`, { method: "PATCH", body: JSON.stringify(corpo), admin: true }),
    criarVariacao: (produtoId: string, corpo: unknown) =>
      pedir<any>(`/admin/produtos/${produtoId}/variacoes`, {
        method: "POST",
        body: JSON.stringify(corpo),
        admin: true,
      }),
    editarVariacao: (id: string, corpo: unknown) =>
      pedir<any>(`/admin/variacoes/${id}`, { method: "PATCH", body: JSON.stringify(corpo), admin: true }),
    enviarImagem: (produtoId: string, arquivo: File) => {
      const dados = new FormData();
      dados.append("arquivo", arquivo);
      return pedir<any>(`/admin/produtos/${produtoId}/imagens`, {
        method: "POST",
        body: dados,
        admin: true,
      });
    },
    removerImagem: (id: string) =>
      pedir<any>(`/admin/imagens/${id}`, { method: "DELETE", admin: true }),

    confirmarRetirada: (token: string, observacao?: string) =>
      pedir<any>("/admin/retirada/confirmar", {
        method: "POST",
        body: JSON.stringify(observacao ? { token, observacao } : { token }),
        admin: true,
      }),
  },
};
