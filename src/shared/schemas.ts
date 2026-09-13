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
        email: z.string().trim().email().max(160).optional().or(z.literal("")),
      })
      .strict(),
    itens: z.array(itemPedidoSchema).min(1, "O carrinho está vazio.").max(20),
  })
  .strict();

export const ajusteEstoqueSchema = z
  .object({
    produto_variacao_id: z.string().min(1),
    // positivo = entrada, negativo = baixa
    delta: z.number().int().refine((v) => v !== 0, "Informe uma quantidade."),
    motivo: z.string().trim().min(3, "O motivo é obrigatório.").max(240),
  })
  .strict();

export const tokenRetiradaSchema = z
  .object({ token: z.string().trim().min(10).max(200) })
  .strict();

export const confirmarRetiradaSchema = z
  .object({
    token: z.string().trim().min(10).max(200),
    observacao: z.string().trim().max(240).optional(),
  })
  .strict();

export type CriarPedidoInput = z.infer<typeof criarPedidoSchema>;
export type AjusteEstoqueInput = z.infer<typeof ajusteEstoqueSchema>;

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
