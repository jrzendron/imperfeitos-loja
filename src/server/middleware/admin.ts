import type { MiddlewareHandler } from "hono";
import { comparaSeguro } from "../utils/crypto";
import { erro } from "../utils/http";

/**
 * Autenticação do admin — versão de DESENVOLVIMENTO.
 *
 * Em produção quem responde "quem é essa pessoa" é o Cloudflare Access,
 * e o Worker apenas lê e valida o JWT que ele injeta no cabeçalho
 * Cf-Access-Jwt-Assertion. Este middleware é o andaime até a Fase 11:
 * um token compartilhado vindo do .dev.vars.
 *
 * Ele existe para o /admin não ficar aberto enquanto o Access não está
 * configurado — e é deliberadamente simples, para ninguém se enganar e
 * achar que é suficiente para produção.
 */
export const exigirAdmin: MiddlewareHandler<{ Bindings: Env; Variables: { adminEmail: string } }> =
  async (c, next) => {
    const esperado = c.env.ADMIN_TOKEN;

    if (!esperado) {
      throw erro(
        403,
        "ADMIN_NAO_CONFIGURADO",
        "ADMIN_TOKEN não está definido. Copie .dev.vars.example para .dev.vars.",
      );
    }

    const cabecalho = c.req.header("Authorization") ?? "";
    const recebido = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : "";

    if (!recebido || !comparaSeguro(recebido, esperado)) {
      throw erro(401, "NAO_AUTORIZADO", "Informe o token do painel administrativo.");
    }

    // Em produção este valor virá do e-mail autenticado pelo Access,
    // e é ele que aparece na auditoria e no registro de retirada.
    c.set("adminEmail", c.req.header("X-Admin-Email") || "admin@local");
    await next();
  };
