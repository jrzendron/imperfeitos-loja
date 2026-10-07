import { novoId, agora } from "../utils/ids";
import { erro, violouUnique } from "../utils/http";
import { auditar } from "./auditoria.service";
import { gerarSlug, type ProdutoInput, type VariacaoInput } from "../../shared/schemas";

/** Tipos que o navegador consegue exibir e que fazem sentido num catálogo. */
const TIPOS_ACEITOS = ["image/webp", "image/jpeg", "image/png", "image/avif"];
const TAMANHO_MAXIMO = 3 * 1024 * 1024; // 3 MB por foto, já redimensionada pela tela

export async function criarProduto(db: D1Database, entrada: ProdutoInput, adminEmail: string) {
  const existente = await db.prepare("SELECT id FROM produtos LIMIT 1").first();
  if (existente) throw erro(409, "PRODUTO_UNICO", "A loja permite apenas uma camiseta. Edite o produto existente.");
  const ts = agora();
  const id = novoId("prod");
  const slug = entrada.slug?.trim() || gerarSlug(entrada.nome);

  if (!slug) throw erro(400, "SLUG_INVALIDO", "Não consegui gerar um endereço a partir desse nome.");

  try {
    await db
      .prepare(
        `INSERT INTO produtos (id, slug, nome, descricao, ativo, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`,
      )
      .bind(id, slug, entrada.nome, entrada.descricao || null, entrada.ativo === false ? 0 : 1, ts)
      .run();
  } catch (e) {
    if (violouUnique(e)) throw erro(409, "PRODUTO_UNICO", "A loja permite apenas uma camiseta.");
    throw e;
  }

  await auditar(db, {
    actor_type: "ADMIN",
    actor_identifier: adminEmail,
    action: "PRODUTO_CRIADO",
    entity_type: "produto",
    entity_id: id,
    metadata: { nome: entrada.nome, slug },
  });

  return { id, slug };
}

export async function editarProduto(
  db: D1Database,
  id: string,
  entrada: Partial<ProdutoInput>,
  adminEmail: string,
) {
  const atual = await db.prepare(`SELECT id FROM produtos WHERE id = ?1`).bind(id).first();
  if (!atual) throw erro(404, "PRODUTO_NAO_ENCONTRADO", "Produto não encontrado.");

  const campos: string[] = [];
  const valores: unknown[] = [];
  const set = (coluna: string, valor: unknown) => {
    valores.push(valor);
    campos.push(`${coluna} = ?${valores.length}`);
  };

  if (entrada.nome !== undefined) set("nome", entrada.nome);
  if (entrada.descricao !== undefined) set("descricao", entrada.descricao || null);
  if (entrada.slug !== undefined) set("slug", entrada.slug);
  if (entrada.ativo !== undefined) set("ativo", entrada.ativo ? 1 : 0);
  if (campos.length === 0) return;

  set("updated_at", agora());
  valores.push(id);

  try {
    await db
      .prepare(`UPDATE produtos SET ${campos.join(", ")} WHERE id = ?${valores.length}`)
      .bind(...valores)
      .run();
  } catch (e) {
    if (violouUnique(e)) throw erro(409, "SLUG_EM_USO", "Já existe um produto nesse endereço.");
    throw e;
  }

  await auditar(db, {
    actor_type: "ADMIN",
    actor_identifier: adminEmail,
    action: "PRODUTO_ALTERADO",
    entity_type: "produto",
    entity_id: id,
    metadata: entrada as Record<string, unknown>,
  });
}

/**
 * Cria um tamanho e, opcionalmente, já lança a carga inicial de estoque.
 *
 * A linha em `estoque` nasce junto com a variação — sem ela, o catálogo
 * mostraria o tamanho como esgotado e a reserva não teria o que atualizar.
 */
export async function criarVariacao(
  db: D1Database,
  produtoId: string,
  entrada: VariacaoInput,
  adminEmail: string,
) {
  const produto = await db.prepare(`SELECT id FROM produtos WHERE id = ?1`).bind(produtoId).first();
  if (!produto) throw erro(404, "PRODUTO_NAO_ENCONTRADO", "Produto não encontrado.");

  const ts = agora();
  const id = novoId("var");
  const inicial = entrada.estoque_inicial ?? 0;
  const sku = entrada.sku?.trim() || `${produtoId.slice(-6)}-${entrada.categoria}-${gerarSlug(entrada.nome) || "x"}`.toUpperCase();

  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO produto_variacoes
           (id, produto_id, sku, nome, categoria, altura_cm, largura_cm,
            valor_centavos, ativo, ordem, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)`,
      )
      .bind(
        id,
        produtoId,
        sku,
        entrada.nome,
        entrada.categoria,
        entrada.altura_cm ?? null,
        entrada.largura_cm ?? null,
        entrada.valor_centavos,
        entrada.ativo === false ? 0 : 1,
        entrada.ordem ?? 0,
        ts,
      ),
    db
      .prepare(
        `INSERT INTO estoque (produto_variacao_id, quantidade_fisica, quantidade_reservada, updated_at)
         VALUES (?1, ?2, 0, ?3)`,
      )
      .bind(id, inicial, ts),
  ];

  if (inicial > 0) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO estoque_movimentos
             (id, produto_variacao_id, tipo, quantidade, motivo, admin_email, created_at)
           VALUES (?1, ?2, 'ENTRADA', ?3, 'Carga inicial do tamanho', ?4, ?5)`,
        )
        .bind(novoId("mov"), id, inicial, adminEmail, ts),
    );
  }

  try {
    await db.batch(stmts);
  } catch (e) {
    if (violouUnique(e)) throw erro(409, "TAMANHO_EM_USO", "Esse tamanho ou SKU já existe nessa categoria.");
    throw e;
  }

  await auditar(db, {
    actor_type: "ADMIN",
    actor_identifier: adminEmail,
    action: "VARIACAO_CRIADA",
    entity_type: "produto_variacao",
    entity_id: id,
    metadata: { produto_id: produtoId, nome: entrada.nome, categoria: entrada.categoria, valor_centavos: entrada.valor_centavos },
  });

  return { id, sku };
}

export async function editarVariacao(
  db: D1Database,
  id: string,
  entrada: Partial<VariacaoInput>,
  adminEmail: string,
) {
  const atual = await db
    .prepare(`SELECT id, valor_centavos FROM produto_variacoes WHERE id = ?1`)
    .bind(id)
    .first<{ id: string; valor_centavos: number }>();
  if (!atual) throw erro(404, "VARIACAO_NAO_ENCONTRADA", "Tamanho não encontrado.");

  const campos: string[] = [];
  const valores: unknown[] = [];
  const set = (coluna: string, valor: unknown) => {
    valores.push(valor);
    campos.push(`${coluna} = ?${valores.length}`);
  };

  if (entrada.nome !== undefined) set("nome", entrada.nome);
  if (entrada.categoria !== undefined) set("categoria", entrada.categoria);
  if (entrada.altura_cm !== undefined) set("altura_cm", entrada.altura_cm);
  if (entrada.largura_cm !== undefined) set("largura_cm", entrada.largura_cm);
  if (entrada.sku !== undefined) set("sku", entrada.sku);
  if (entrada.valor_centavos !== undefined) {
    set("valor_centavos", entrada.valor_centavos);
    set("preco_definido", 1);
  }
  if (entrada.ordem !== undefined) set("ordem", entrada.ordem);
  if (entrada.ativo !== undefined) set("ativo", entrada.ativo ? 1 : 0);
  if (campos.length === 0) return;

  set("updated_at", agora());
  valores.push(id);

  try {
    await db
      .prepare(`UPDATE produto_variacoes SET ${campos.join(", ")} WHERE id = ?${valores.length}`)
      .bind(...valores)
      .run();
  } catch (e) {
    if (violouUnique(e)) throw erro(409, "TAMANHO_EM_USO", "Esse tamanho ou SKU já existe nessa categoria.");
    throw e;
  }

  // Mudar preço é a alteração mais sensível do painel: pedidos antigos
  // guardam o valor em snapshot, então o histórico não muda — mas quem
  // alterou e de quanto para quanto precisa ficar registrado.
  await auditar(db, {
    actor_type: "ADMIN",
    actor_identifier: adminEmail,
    action: entrada.valor_centavos !== undefined ? "PRECO_ALTERADO" : "VARIACAO_ALTERADA",
    entity_type: "produto_variacao",
    entity_id: id,
    metadata:
      entrada.valor_centavos !== undefined
        ? { de: atual.valor_centavos, para: entrada.valor_centavos }
        : (entrada as Record<string, unknown>),
  });
}

// ─── Imagens ───────────────────────────────────────────────────

export async function enviarImagem(
  db: D1Database,
  media: R2Bucket,
  produtoId: string,
  arquivo: File,
  adminEmail: string,
) {
  const produto = await db
    .prepare(`SELECT id, slug FROM produtos WHERE id = ?1`)
    .bind(produtoId)
    .first<{ id: string; slug: string }>();
  if (!produto) throw erro(404, "PRODUTO_NAO_ENCONTRADO", "Produto não encontrado.");

  if (!TIPOS_ACEITOS.includes(arquivo.type)) {
    throw erro(400, "TIPO_INVALIDO", "Envie uma imagem JPG, PNG, WebP ou AVIF.");
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    throw erro(400, "ARQUIVO_GRANDE", "A imagem passou de 3 MB mesmo depois de redimensionada.");
  }

  const extensao = arquivo.type.split("/")[1] ?? "webp";
  const chave = `produto/${produto.slug}/${crypto.randomUUID().slice(0, 8)}.${extensao}`;

  await media.put(chave, await arquivo.arrayBuffer(), {
    httpMetadata: { contentType: arquivo.type, cacheControl: "public, max-age=31536000, immutable" },
  });

  const proxima = await db
    .prepare(`SELECT COALESCE(MAX(ordem), -1) + 1 AS n FROM produto_imagens WHERE produto_id = ?1`)
    .bind(produtoId)
    .first<{ n: number }>();

  const id = novoId("img");
  await db
    .prepare(
      `INSERT INTO produto_imagens
         (id, produto_id, r2_key, alt_text, ordem, content_type, bytes, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(id, produtoId, chave, null, proxima?.n ?? 0, arquivo.type, arquivo.size, agora())
    .run();

  await auditar(db, {
    actor_type: "ADMIN",
    actor_identifier: adminEmail,
    action: "IMAGEM_ENVIADA",
    entity_type: "produto",
    entity_id: produtoId,
    metadata: { chave, bytes: arquivo.size },
  });

  return { id, r2_key: chave, url: `/api/midia/${chave}` };
}

export async function removerImagem(
  db: D1Database,
  media: R2Bucket,
  imagemId: string,
  adminEmail: string,
) {
  const imagem = await db
    .prepare(`SELECT id, produto_id, r2_key FROM produto_imagens WHERE id = ?1`)
    .bind(imagemId)
    .first<{ id: string; produto_id: string; r2_key: string }>();
  if (!imagem) throw erro(404, "IMAGEM_NAO_ENCONTRADA", "Imagem não encontrada.");

  // A linha sai primeiro. Se o R2 falhar depois, sobra um objeto órfão —
  // que custa alguns KB e some numa limpeza. A ordem inversa deixaria a
  // loja apontando para uma foto que não existe mais, o que é pior.
  await db.prepare(`DELETE FROM produto_imagens WHERE id = ?1`).bind(imagemId).run();
  await media.delete(imagem.r2_key).catch((e) => console.error("Falha ao apagar no R2:", e));

  await auditar(db, {
    actor_type: "ADMIN",
    actor_identifier: adminEmail,
    action: "IMAGEM_REMOVIDA",
    entity_type: "produto",
    entity_id: imagem.produto_id,
    metadata: { chave: imagem.r2_key },
  });
}
