import { z } from "zod";

/**
 * O contrato do que o navegador PODE enviar.
 *
 * `.strict()` não é detalhe: ele faz a requisição ser rejeitada se vier
 * qualquer campo a mais. É o que garante que um `valor_centavos` enviado
 * pelo cliente nunca chegue perto da lógica de preço — nem por acidente,
 * nem de propósito. O preço vem do banco, sempre (ARQUITETURA §24).
 */

export const telefoneSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length === 10 || v.length === 11, {
    message: "Telefone deve ter DDD + número (10 ou 11 dígitos).",
  });

export function cpfValido(valor: string): boolean {
  const cpf = valor.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calcularDigito = (tamanho: number) => {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return calcularDigito(9) === Number(cpf[9]) && calcularDigito(10) === Number(cpf[10]);
}

export const cpfSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine(cpfValido, { message: "Informe um CPF válido." });

export const itemPedidoSchema = z
  .object({
    produto_variacao_id: z.string().min(1).max(64),
    quantidade: z.number().int().min(1).max(20),
  })
  .strict();

export const criarPedidoSchema = z
  .object({
    cliente: z
      .object({
        nome: z.string().trim().min(3, "Informe o nome completo.").max(120),
        telefone: telefoneSchema,
        cpf: cpfSchema,
        email: z.string().trim().email().max(160).optional().or(z.literal("")),
      })
      .strict(),
    itens: z.array(itemPedidoSchema).min(1, "O carrinho está vazio.").max(20),
  })
  .strict();

export const consultarCpfSchema = z.object({ cpf: cpfSchema }).strict();

export const ajusteEstoqueSchema = z
  .object({
    produto_variacao_id: z.string().min(1),
    // positivo = entrada, negativo = baixa
    delta: z.number().int().refine((v) => v !== 0, "Informe uma quantidade."),
    motivo: z.string().trim().min(3, "O motivo é obrigatório.").max(240),
  })
  .strict();

export const tokenRetiradaSchema = z
  .object({ token: z.string().trim().min(8).max(300) })
  .strict();

export const confirmarRetiradaSchema = z
  .object({
    token: z.string().trim().min(8).max(300),
    observacao: z.string().trim().max(240).optional(),
  })
  .strict();

export type CriarPedidoInput = z.infer<typeof criarPedidoSchema>;
export type AjusteEstoqueInput = z.infer<typeof ajusteEstoqueSchema>;

export const pagamentoCartaoSchema = z
  .object({
    attempt_id: z.string().uuid(),
    token: z.string().min(10).max(300),
    payment_method_id: z.string().min(1).max(40),
    payment_type_id: z.enum(["credit_card", "debit_card", "prepaid_card"]),
    installments: z.number().int().min(1).max(24),
    payer: z
      .object({
        email: z.string().email().max(160),
        identification: z
          .object({ type: z.string().min(1).max(10), number: z.string().min(5).max(30) })
          .strict(),
      })
      .strict(),
    device_id: z.string().max(200).optional(),
  })
  .strict();

export type PagamentoCartaoInput = z.infer<typeof pagamentoCartaoSchema>;

// ─── Produtos (painel administrativo) ────────────────────────────

/** "Camiseta do Encontro 2026" -> "camiseta-do-encontro-2026" */
export function gerarSlug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const produtoSchema = z
  .object({
    nome: z.string().trim().min(3, "O nome precisa de pelo menos 3 letras.").max(120),
    descricao: z.string().trim().max(2000).optional().or(z.literal("")),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]+$/, "O endereço só aceita letras minúsculas, números e hífen.")
      .min(3)
      .max(60)
      .optional(),
    ativo: z.boolean().optional(),
  })
  .strict();

export const variacaoSchema = z
  .object({
    nome: z.string().trim().min(1, "Informe o tamanho.").max(20),
    sku: z.string().trim().min(1).max(60).optional(),
    // Em CENTAVOS. A tela converte; o servidor nunca vê "45,90".
    valor_centavos: z
      .number()
      .int("O valor precisa ser em centavos, sem vírgula.")
      .min(1, "O valor precisa ser maior que zero.")
      .max(100_000_00),
    ordem: z.number().int().min(0).max(999).optional(),
    ativo: z.boolean().optional(),
    /** Só na criação: já lança a carga inicial de estoque. */
    estoque_inicial: z.number().int().min(0).max(100_000).optional(),
  })
  .strict();

export const variacaoEdicaoSchema = variacaoSchema.partial().strict();

export const imagemMetaSchema = z
  .object({
    alt_text: z.string().trim().max(160).optional(),
    ordem: z.number().int().min(0).max(999).optional(),
  })
  .strict();

export type ProdutoInput = z.infer<typeof produtoSchema>;
export type VariacaoInput = z.infer<typeof variacaoSchema>;
