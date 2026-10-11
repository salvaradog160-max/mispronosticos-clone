/**
 * Carga el "cable del telefono": la serie temporal de cada cuota, de
 * apertura a cierre, como se fue moviendo lectura a lectura.
 *
 * Analogia del usuario: emisor = cuota de apertura, el cable = como se
 * mueve la linea (lectura a lectura), receptor = cuota de cierre. La
 * serie sale de la tabla line_series (UN append por corrida, cada 30').
 *
 * Postgres es opcional: si no responde (maquina arrancando, docker
 * caido) se devuelve null y la app muestra la linea sin cable.
 */
import { Client } from 'pg';

const PG_URL = process.env.DATABASE_URL
  ?? 'postgresql://lineas:lineas_dev_2026@localhost:55432/lineas';

/**
 * Series de una lista de eventos (ESPN event ids).
 * @returns {Map<string, Array<{market, side, line, opened, current,
 *   closed, movePct, capturedAt}>>}
 */
export const cargarSeries = async (eventIds, { limite = 30 } = {}) => {
  if (!eventIds?.length) return new Map();
  const client = new Client({ connectionString: PG_URL });
  try {
    await client.connect();
    const { rows } = await client.query(
      `SELECT event_id, market, side, line_val, opened, current, closed, move_pct, captured_at
         FROM line_series
        WHERE event_id = ANY($1::text[])
        ORDER BY event_id, market, side, captured_at
        LIMIT $2`,
      [eventIds.map(String), limite * 40],
    );
    const porEvento = new Map();
    for (const r of rows) {
      const evs = porEvento.get(r.event_id) ?? [];
      evs.push({
        market: r.market,
        side: r.side,
        line: r.line_val == null ? null : Number(r.line_val),
        opened: r.opened == null ? null : Number(r.opened),
        current: r.current == null ? null : Number(r.current),
        closed: r.closed == null ? null : Number(r.closed),
        movePct: r.move_pct == null ? null : Number(r.move_pct),
        capturedAt: r.captured_at,
      });
      porEvento.set(r.event_id, evs);
    }
    return porEvento;
  } catch (e) {
    console.warn(`[series] postgres no disponible: ${e.message}`);
    return new Map();
  } finally {
    await client.end().catch(() => {});
  }
};