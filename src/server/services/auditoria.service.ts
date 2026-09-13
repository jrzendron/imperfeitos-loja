import { novoId, agora } from "../utils/ids";

type Ator = "CLIENTE" | "ADMIN" | "SISTEMA";

/**
 * Auditoria é gravada DEPOIS da ação, fora do batch, e de propósito.
 * Uma linha de auditoria perdida numa queda é menos grave do que uma
 * linha de auditoria que afirma algo que não aconteceu.
 */
export async function auditar(
  db: D1Database,
  dados: {
    actor_type: Ator;
    actor_identifier?: string | null;
    action: string;
    entity_type?: string;
    entity_id?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO auditoria
           (id, actor_type, actor_identifier, action, entity_type, entity_id, metadata_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
      .bind(
        novoId("aud"),
        dados.actor_type,
        dados.actor_identifier ?? null,
        dados.action,
        dados.entity_type ?? null,
        dados.entity_id ?? null,
        dados.metadata ? JSON.stringify(dados.metadata) : null,
        agora(),
      )
      .run();
  } catch (e) {
    console.error("Falha ao auditar (ação seguiu normalmente):", e);
  }
}
