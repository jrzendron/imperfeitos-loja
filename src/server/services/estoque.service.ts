import { novoId, agora } from "../utils/ids";
import { erro, violouCheck } from "../utils/http";
import { auditar } from "./auditoria.service";
import type { AjusteEstoqueInput } from "../../shared/schemas";

/**
 * Ajuste manual de estoque. Entrada é delta positivo, baixa é negativo.
 * O motivo é obrigatório no schema, e a CHECK do banco impede que uma
 * baixa deixe o físico abaixo do que já está reservado.
 */
export async function ajustarEstoque(
  db: D1Database,
  entrada: AjusteEstoqueInput,
  adminEmail: string,
): Promise<{ quantidade_fisica: number; quantidade_reservada: number }> {
  const ts = agora();
  const tipo = entrada.delta > 0 ? "ENTRADA" : "AJUSTE";

  try {
    await db.batch([
      db
        .prepare(
          `UPDATE estoque SET quantidade_fisica = quantidade_fisica + ?1, updated_at = ?2
            WHERE produto_variacao_id = ?3`,
        )
        .bind(entrada.delta, ts, entrada.produto_variacao_id),
      db
        .prepare(
          `INSERT INTO estoque_movimentos
             (id, produto_variacao_id, tipo, quantidade, motivo, admin_email, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
        )
        .bind(novoId("mov"), entrada.produto_variacao_id, tipo, entrada.delta, entrada.motivo, adminEmail, ts),
    ]);
  } catch (e) {
    if (violouCheck(e)) {
      throw erro(
        409,
        "AJUSTE_INVALIDO",
        "A baixa deixaria o estoque menor do que o já reservado em pedidos abertos.",
      );
    }
    throw e;
  }

  const atual = await db
    .prepare(
      `SELECT quantidade_fisica, quantidade_reservada FROM estoque WHERE produto_variacao_id = ?1`,
    )
    .bind(entrada.produto_variacao_id)
    .first<{ quantidade_fisica: number; quantidade_reservada: number }>();

  if (!atual) throw erro(404, "VARIACAO_NAO_ENCONTRADA", "Tamanho não encontrado.");

  await auditar(db, {
    actor_type: "ADMIN",
    actor_identifier: adminEmail,
    action: "ESTOQUE_AJUSTADO",
    entity_type: "produto_variacao",
    entity_id: entrada.produto_variacao_id,
    metadata: { delta: entrada.delta, motivo: entrada.motivo, resultado: atual },
  });

  return atual;
}
