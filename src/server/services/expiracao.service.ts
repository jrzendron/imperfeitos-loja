import { agora } from "../utils/ids";
import { cancelarPedidoGerenciado } from "./cancelamento-pedido.service";

/** O cron consulta cobranças externas antes de devolver reservas ao estoque. */
export async function expirarPedidosVencidosComConciliacao(db: D1Database, env: Env): Promise<number> {
  const { results } = await db.prepare(
    `SELECT id FROM pedidos
      WHERE status = 'AGUARDANDO_PAGAMENTO' AND expires_at < ?1
      ORDER BY expires_at LIMIT 50`,
  ).bind(agora()).all<{ id: string }>();
  let expirados = 0;
  for (const pedido of results) {
    try {
      const resultado = await cancelarPedidoGerenciado(db, env, pedido.id, "SISTEMA", "cron");
      if (resultado.status === "EXPIRADO") expirados++;
    } catch (e) {
      // Falha do provedor mantém a reserva. A próxima execução tenta de novo.
      console.warn("Pedido vencido não foi liberado sem confirmação externa", pedido.id, (e as Error).message);
    }
  }
  return expirados;
}
