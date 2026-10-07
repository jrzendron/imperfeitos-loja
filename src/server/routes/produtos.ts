import { Hono } from "hono";
import type { ProdutoPublico, VariacaoPublica } from "../../shared/types";

export const produtosRouter = new Hono<{ Bindings: Env }>();

interface LinhaCatalogo {
  produto_id: string;
  slug: string;
  produto_nome: string;
  descricao: string | null;
  variacao_id: string;
  sku: string;
  variacao_nome: string;
  categoria: "ADULTO" | "INFANTIL";
  altura_cm: number | null;
  largura_cm: number | null;
  valor_centavos: number;
  ordem: number;
  disponivel: number;
}

/**
 * O catálogo já devolve a disponibilidade calculada. `disponivel` é
 * físico menos reservado: uma peça presa num pedido que ninguém pagou
 * ainda não está à venda.
 */
const SQL_CATALOGO = `
  SELECT p.id   AS produto_id,
         p.slug,
         p.nome AS produto_nome,
         p.descricao,
         v.id   AS variacao_id,
         v.sku,
         v.nome AS variacao_nome,
         v.categoria,
         v.altura_cm,
         v.largura_cm,
         v.valor_centavos,
         v.ordem,
         MAX(0, COALESCE(e.quantidade_fisica, 0) - COALESCE(e.quantidade_reservada, 0)) AS disponivel
    FROM produtos p
    JOIN produto_variacoes v ON v.produto_id = p.id AND v.ativo = 1
    LEFT JOIN estoque e      ON e.produto_variacao_id = v.id
   WHERE p.ativo = 1 %FILTRO%
   ORDER BY p.nome, CASE v.categoria WHEN 'ADULTO' THEN 0 ELSE 1 END, v.ordem, v.nome
`;

interface LinhaImagem {
  produto_id: string;
  r2_key: string;
  alt_text: string | null;
}

/**
 * As fotos vêm numa segunda consulta, e não num JOIN.
 *
 * Um JOIN multiplicaria cada variação por cada foto — cinco tamanhos e três
 * fotos viram quinze linhas para montar o mesmo produto. Com o D1 falhando
 * as queries ao estourar o limite diário de linhas lidas, isso importa.
 */
async function carregarImagens(db: D1Database, produtoIds: string[]): Promise<Map<string, LinhaImagem[]>> {
  const mapa = new Map<string, LinhaImagem[]>();
  if (produtoIds.length === 0) return mapa;

  const marcadores = produtoIds.map((_, i) => `?${i + 1}`).join(", ");
  const { results } = await db
    .prepare(
      `SELECT produto_id, r2_key, alt_text FROM produto_imagens
        WHERE produto_id IN (${marcadores}) ORDER BY ordem`,
    )
    .bind(...produtoIds)
    .all<LinhaImagem>();

  for (const linha of results) {
    const lista = mapa.get(linha.produto_id) ?? [];
    lista.push(linha);
    mapa.set(linha.produto_id, lista);
  }
  return mapa;
}

function agrupar(linhas: LinhaCatalogo[]): ProdutoPublico[] {
  const mapa = new Map<string, ProdutoPublico>();
  for (const l of linhas) {
    let produto = mapa.get(l.produto_id);
    if (!produto) {
      produto = {
        id: l.produto_id,
        slug: l.slug,
        nome: l.produto_nome,
        descricao: l.descricao,
        variacoes: [],
        imagens: [],
      };
      mapa.set(l.produto_id, produto);
    }
    const variacao: VariacaoPublica = {
      id: l.variacao_id,
      sku: l.sku,
      nome: l.variacao_nome,
      categoria: l.categoria,
      altura_cm: l.altura_cm,
      largura_cm: l.largura_cm,
      valor_centavos: l.valor_centavos,
      ordem: l.ordem,
      disponivel: l.disponivel,
    };
    produto.variacoes.push(variacao);
  }
  return [...mapa.values()];
}

async function comImagens(db: D1Database, produtos: ProdutoPublico[]): Promise<ProdutoPublico[]> {
  const imagens = await carregarImagens(db, produtos.map((p) => p.id));
  for (const produto of produtos) {
    produto.imagens = (imagens.get(produto.id) ?? []).map((i) => ({
      url: `/api/midia/${i.r2_key}`,
      alt: i.alt_text,
    }));
  }
  return produtos;
}

produtosRouter.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(SQL_CATALOGO.replace("%FILTRO%", "")).all<LinhaCatalogo>();
  return c.json({ produtos: await comImagens(c.env.DB, agrupar(results)) });
});

produtosRouter.get("/:slug", async (c) => {
  const { results } = await c.env.DB.prepare(SQL_CATALOGO.replace("%FILTRO%", "AND p.slug = ?1"))
    .bind(c.req.param("slug"))
    .all<LinhaCatalogo>();

  const produtos = agrupar(results);
  if (produtos.length === 0) {
    return c.json({ erro: "NAO_ENCONTRADO", mensagem: "Produto não encontrado." }, 404);
  }
  const [produto] = await comImagens(c.env.DB, produtos);
  return c.json({ produto });
});
