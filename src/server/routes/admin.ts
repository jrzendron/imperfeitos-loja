import { Hono } from "hono";
import { exigirAdmin } from "../middleware/admin";
import { registrarPagamento, cancelarPedido } from "../services/pedido.service";
import { consultarPorToken, confirmarRetirada } from "../services/retirada.service";
import { ajustarEstoque } from "../services/estoque.service";
import {
  ajusteEstoqueSchema,
  tokenRetiradaSchema,
  confirmarRetiradaSchema,
  produtoSchema,
  variacaoSchema,
  variacaoEdicaoSchema,
} from "../../shared/schemas";
import {
  criarProduto,
  editarProduto,
  criarVariacao,
  editarVariacao,
  enviarImagem,
  removerImagem,
} from "../services/produto.service";
import { erro } from "../utils/http";
import { resumoContaPagamento, trocarContaPagamento } from "../services/conta-pagamento.service";
import { z } from "zod";
import type { StatusPedido } from "../../shared/types";

type Ambiente = { Bindings: Env; Variables: { adminEmail: string } };

export const adminRouter = new Hono<Ambiente>();
adminRouter.use("*", exigirAdmin);

adminRouter.get("/sessao", (c) => c.json({ ok: true, email: c.get("adminEmail") }));

const contaPagamentoSchema = z.object({
  nome: z.string().trim().min(2).max(80),
  public_key: z.string().trim().min(15).max(300),
  access_token: z.string().trim().min(20).max(500),
  webhook_secret: z.string().trim().min(16).max(500),
  senha_admin: z.string().min(1).max(500),
}).strict();

adminRouter.get("/conta-pagamento", async (c) =>
  c.json({ conta: await resumoContaPagamento(c.env.DB, c.env) }),
);

adminRouter.put("/conta-pagamento", async (c) => {
  const entrada = contaPagamentoSchema.parse(await c.req.json());
  const conta = await trocarContaPagamento(c.env.DB, c.env, entrada, c.get("adminEmail"));
  return c.json({ conta });
});

adminRouter.get("/dashboard", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT status, COUNT(*) AS total, COALESCE(SUM(valor_total_centavos), 0) AS valor
       FROM pedidos GROUP BY status`,
  ).all<{ status: StatusPedido; total: number; valor: number }>();

  const faturamento = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(p.valor_total_centavos), 0) AS total
       FROM pedidos p
       JOIN pagamentos pg ON pg.pedido_id = p.id AND pg.status = 'APPROVED'`,
  ).first<{ total: number }>();

  const { results: estoque } = await c.env.DB.prepare(
    `SELECT v.id, v.nome, v.sku, v.valor_centavos,
            p.id AS produto_id, p.nome AS produto_nome,
            e.quantidade_fisica, e.quantidade_reservada,
            MAX(0, e.quantidade_fisica - e.quantidade_reservada) AS disponivel
       FROM produto_variacoes v
       JOIN produtos p ON p.id = v.produto_id
       JOIN estoque  e ON e.produto_variacao_id = v.id
      ORDER BY p.nome, v.ordem`,
  ).all();

  return c.json({
    por_status: results,
    faturamento_centavos: faturamento?.total ?? 0,
    estoque,
  });
});

/**
 * Listagem SEMPRE paginada. Não é preferência de estilo: desde 01/09/2026
 * o D1 derruba as queries da conta quando o limite diário de linhas lidas
 * estoura, e só volta à meia-noite UTC. Uma listagem sem LIMIT é um jeito
 * de tirar a loja do ar no dia da venda.
 */
adminRouter.get("/pedidos", async (c) => {
  const limite = Math.min(Number(c.req.query("limite") ?? 25) || 25, 100);
  const pagina = Math.max(Number(c.req.query("pagina") ?? 1) || 1, 1);
  const status = c.req.query("status");
  const busca = (c.req.query("busca") ?? "").trim();

  const condicoes: string[] = [];
  const valores: unknown[] = [];

  if (status) {
    valores.push(status);
    condicoes.push(`p.status = ?${valores.length}`);
  }
  if (busca) {
    valores.push(`%${busca}%`, `%${busca}%`, `%${busca.replace(/\D/g, "")}%`);
    condicoes.push(
      `(p.numero LIKE ?${valores.length - 2} OR c.nome LIKE ?${valores.length - 1} OR c.telefone LIKE ?${valores.length})`,
    );
  }

  const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const valoresFiltro = [...valores];
  let consultaTotal = c.env.DB.prepare(
    `SELECT COUNT(*) AS total FROM pedidos p JOIN clientes c ON c.id = p.cliente_id ${onde}`,
  );
  if (valoresFiltro.length) consultaTotal = consultaTotal.bind(...valoresFiltro);
  const contagem = await consultaTotal.first<{ total: number }>();
  valores.push(limite, (pagina - 1) * limite);

  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.numero,
            CASE WHEN pg.status = 'APPROVED'
                 THEN p.codigo_retirada ELSE NULL END AS codigo_retirada,
            p.status, p.valor_total_centavos, p.created_at, p.expires_at,
            c.nome AS cliente_nome, c.telefone AS cliente_telefone,
            pg.status AS pagamento_status, pg.provider AS pagamento_provider, pg.paid_at,
            r.data_hora AS retirado_em, r.admin_email AS retirado_por,
            (SELECT COUNT(*) FROM pedido_itens i WHERE i.pedido_id = p.id) AS itens,
            (SELECT GROUP_CONCAT(i.quantidade || '× ' || i.produto_nome_snapshot || ' — ' || i.variacao_nome_snapshot, ' | ')
               FROM pedido_itens i WHERE i.pedido_id = p.id) AS itens_resumo,
            CASE WHEN r.id IS NULL THEN 0 ELSE 1 END AS retirado
       FROM pedidos p
       JOIN clientes c ON c.id = p.cliente_id
       LEFT JOIN pagamentos pg ON pg.pedido_id = p.id
       LEFT JOIN retiradas r ON r.pedido_id = p.id
       ${onde}
      ORDER BY p.created_at DESC
      LIMIT ?${valores.length - 1} OFFSET ?${valores.length}`,
  )
    .bind(...valores)
    .all();

  return c.json({ pedidos: results, pagina, limite, total: contagem?.total ?? 0 });
});

adminRouter.get("/pedidos/:id", async (c) => {
  const id = c.req.param("id");
  const pedido = await c.env.DB.prepare(
    `SELECT p.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.email AS cliente_email,
            pg.status AS pagamento_status, pg.provider AS pagamento_provider, pg.paid_at,
            r.data_hora AS retirado_em, r.admin_email AS retirado_por
       FROM pedidos p
       JOIN clientes c ON c.id = p.cliente_id
       LEFT JOIN pagamentos pg ON pg.pedido_id = p.id
       LEFT JOIN retiradas  r  ON r.pedido_id  = p.id
      WHERE p.id = ?1`,
  )
    .bind(id)
    .first();

  if (!pedido) throw erro(404, "PEDIDO_NAO_ENCONTRADO", "Pedido não encontrado.");

  const { results: itens } = await c.env.DB.prepare(
    `SELECT * FROM pedido_itens WHERE pedido_id = ?1`,
  )
    .bind(id)
    .all();

  return c.json({ pedido, itens });
});

/**
 * Substitui o webhook do Mercado Pago enquanto ele não existe.
 * A função chamada é a mesma que o webhook vai chamar — inclusive a
 * proteção contra pagamento duplicado, que é o UNIQUE do banco.
 */
adminRouter.post("/pedidos/:id/marcar-pago", async (c) => {
  const resultado = await registrarPagamento(c.env.DB, c.env, c.req.param("id"), {
    provider: "MANUAL",
    adminEmail: c.get("adminEmail"),
  });
  return c.json({ ok: true, ...resultado });
});

adminRouter.post("/pedidos/:id/cancelar", async (c) => {
  const ok = await cancelarPedido(
    c.env.DB,
    c.req.param("id"),
    "ADMIN",
    "Cancelado pelo administrador",
  );
  if (!ok) throw erro(409, "NAO_CANCELAVEL", "Este pedido não pode mais ser cancelado.");
  return c.json({ ok: true });
});

adminRouter.post("/estoque/ajuste", async (c) => {
  const corpo = ajusteEstoqueSchema.parse(await c.req.json());
  const resultado = await ajustarEstoque(c.env.DB, corpo, c.get("adminEmail"));
  return c.json({ ok: true, estoque: resultado });
});

adminRouter.post("/retirada/consultar", async (c) => {
  const { token } = tokenRetiradaSchema.parse(await c.req.json());
  return c.json({ retirada: await consultarPorToken(c.env.DB, token) });
});

adminRouter.post("/retirada/confirmar", async (c) => {
  const { token, observacao } = confirmarRetiradaSchema.parse(await c.req.json());
  const retirada = await confirmarRetirada(c.env.DB, token, c.get("adminEmail"), observacao);
  return c.json({ ok: true, retirada });
});

adminRouter.get("/auditoria", async (c) => {
  const limite = Math.min(Number(c.req.query("limite") ?? 50) || 50, 200);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM auditoria ORDER BY created_at DESC LIMIT ?1`,
  )
    .bind(limite)
    .all();
  return c.json({ eventos: results });
});

// ─── Produtos ──────────────────────────────────────────────────

/**
 * Lista TUDO, inclusive inativos — o painel precisa enxergar o que a loja
 * esconde. Vem com tamanhos, estoque e fotos numa consulta só, porque são
 * poucos produtos e a alternativa seria uma consulta por linha.
 */
adminRouter.get("/produtos", async (c) => {
  const { results: produtos } = await c.env.DB.prepare(
    `SELECT id, slug, nome, descricao, ativo, created_at
       FROM produtos ORDER BY ativo DESC, nome LIMIT 200`,
  ).all<Record<string, unknown>>();

  const { results: variacoes } = await c.env.DB.prepare(
    `SELECT v.id, v.produto_id, v.sku, v.nome, v.valor_centavos, v.ativo, v.ordem,
            COALESCE(e.quantidade_fisica, 0)    AS quantidade_fisica,
            COALESCE(e.quantidade_reservada, 0) AS quantidade_reservada,
            MAX(0, COALESCE(e.quantidade_fisica, 0) - COALESCE(e.quantidade_reservada, 0)) AS disponivel,
            (SELECT COUNT(*) FROM pedido_itens i WHERE i.produto_variacao_id = v.id) AS em_pedidos
       FROM produto_variacoes v
       LEFT JOIN estoque e ON e.produto_variacao_id = v.id
      ORDER BY v.ordem, v.nome LIMIT 500`,
  ).all<Record<string, unknown>>();

  const { results: imagens } = await c.env.DB.prepare(
    `SELECT id, produto_id, r2_key, alt_text, ordem FROM produto_imagens
      ORDER BY ordem LIMIT 500`,
  ).all<Record<string, unknown>>();

  return c.json({
    produtos: produtos.map((p) => ({
      ...p,
      variacoes: variacoes.filter((v) => v.produto_id === p.id),
      imagens: imagens
        .filter((i) => i.produto_id === p.id)
        .map((i) => ({ ...i, url: `/api/midia/${i.r2_key}` })),
    })),
  });
});

adminRouter.post("/produtos", async (c) => {
  const corpo = produtoSchema.parse(await c.req.json());
  const criado = await criarProduto(c.env.DB, corpo, c.get("adminEmail"));
  return c.json({ ok: true, ...criado }, 201);
});

adminRouter.patch("/produtos/:id", async (c) => {
  const corpo = produtoSchema.partial().strict().parse(await c.req.json());
  await editarProduto(c.env.DB, c.req.param("id"), corpo, c.get("adminEmail"));
  return c.json({ ok: true });
});

adminRouter.post("/produtos/:id/variacoes", async (c) => {
  const corpo = variacaoSchema.parse(await c.req.json());
  const criada = await criarVariacao(c.env.DB, c.req.param("id"), corpo, c.get("adminEmail"));
  return c.json({ ok: true, ...criada }, 201);
});

adminRouter.patch("/variacoes/:id", async (c) => {
  const corpo = variacaoEdicaoSchema.parse(await c.req.json());
  await editarVariacao(c.env.DB, c.req.param("id"), corpo, c.get("adminEmail"));
  return c.json({ ok: true });
});

adminRouter.post("/produtos/:id/imagens", async (c) => {
  const formulario = await c.req.formData();
  const arquivo = formulario.get("arquivo");
  if (!(arquivo instanceof File)) {
    throw erro(400, "SEM_ARQUIVO", "Nenhuma imagem foi enviada.");
  }
  const imagem = await enviarImagem(c.env.DB, c.env.MEDIA, c.req.param("id"), arquivo, c.get("adminEmail"));
  return c.json({ ok: true, imagem }, 201);
});

adminRouter.delete("/imagens/:id", async (c) => {
  await removerImagem(c.env.DB, c.env.MEDIA, c.req.param("id"), c.get("adminEmail"));
  return c.json({ ok: true });
});
