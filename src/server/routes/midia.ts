import { Hono } from "hono";

export const midiaRouter = new Hono<{ Bindings: Env }>();

/**
 * Serve as fotos do R2.
 *
 * É a única rota pública que devolve um arquivo, e ela é agressivamente
 * cacheável: a chave do objeto tem um trecho aleatório, então uma foto
 * nunca muda de conteúdo sem mudar de endereço. Em produção o cache da
 * Cloudflare absorve quase tudo e o Worker quase não é chamado.
 */
midiaRouter.get("/*", async (c) => {
  const chave = decodeURIComponent(c.req.path.replace(/^\/api\/midia\//, ""));
  if (!chave || chave.includes("..")) return c.notFound();

  const objeto = await c.env.MEDIA.get(chave);
  if (!objeto) return c.notFound();

  return new Response(objeto.body, {
    headers: {
      "Content-Type": objeto.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      ETag: objeto.httpEtag,
    },
  });
});
