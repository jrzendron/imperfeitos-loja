import type { Context } from "hono";
import { ZodError } from "zod";

export class ErroDeNegocio extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 410 | 422 | 502 | 503,
    readonly codigo: string,
    mensagem: string,
    readonly detalhes?: unknown,
  ) {
    super(mensagem);
  }
}

export const erro = (
  status: 400 | 401 | 403 | 404 | 409 | 410 | 422 | 502 | 503,
  codigo: string,
  mensagem: string,
  detalhes?: unknown,
) => new ErroDeNegocio(status, codigo, mensagem, detalhes);

/**
 * O SQLite não tem código de erro estruturado para constraint: o que volta
 * é texto. Como as invariantes do sistema SÃO constraints (ver
 * 0001_initial.sql), precisamos reconhecê-las de forma confiável.
 */
export function violouCheck(e: unknown): boolean {
  const m = String((e as Error)?.message ?? e).toUpperCase();
  return m.includes("CHECK CONSTRAINT") || m.includes("CHECK FAILED");
}

export function violouUnique(e: unknown): boolean {
  const m = String((e as Error)?.message ?? e).toUpperCase();
  return m.includes("UNIQUE CONSTRAINT") || m.includes("UNIQUE FAILED") || m.includes("2067");
}

export async function tratarErro(e: unknown, c: Context) {
  if (e instanceof ErroDeNegocio) {
    return c.json({ erro: e.codigo, mensagem: e.message, detalhes: e.detalhes }, e.status);
  }
  if (e instanceof ZodError) {
    return c.json(
      {
        erro: "DADOS_INVALIDOS",
        mensagem: e.issues[0]?.message ?? "Dados inválidos.",
        detalhes: e.issues.map((i) => ({ campo: i.path.join("."), mensagem: i.message })),
      },
      400,
    );
  }
  console.error("Erro não tratado:", e);
  return c.json(
    { erro: "ERRO_INTERNO", mensagem: "Algo deu errado. Tente novamente." },
    500,
  );
}
