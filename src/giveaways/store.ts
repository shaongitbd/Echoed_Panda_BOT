import { pool } from '../db/pool.js';

export interface Giveaway {
  id: number;
  serverId: string;
  channelId: string;
  messageId: string;
  prize: string;
  winnerCount: number;
  endAt: Date;
  ended: boolean;
  winners: string[];
  createdBy: string;
  createdAt: Date;
}

interface Row {
  id: string;
  server_id: string;
  channel_id: string;
  message_id: string;
  prize: string;
  winner_count: number;
  end_at: Date;
  ended: boolean;
  winners_json: string | null;
  created_by: string;
  created_at: Date;
}

function rowToGiveaway(row: Row): Giveaway {
  let winners: string[] = [];
  if (row.winners_json) {
    try {
      const parsed: unknown = JSON.parse(row.winners_json);
      if (Array.isArray(parsed)) {
        winners = parsed.filter((v): v is string => typeof v === 'string');
      }
    } catch {
      // fall through with empty winners
    }
  }
  return {
    id: Number(row.id),
    serverId: row.server_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    prize: row.prize,
    winnerCount: row.winner_count,
    endAt: row.end_at,
    ended: row.ended,
    winners,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function createGiveaway(input: {
  serverId: string;
  channelId: string;
  messageId: string;
  prize: string;
  winnerCount: number;
  endAt: Date;
  createdBy: string;
}): Promise<Giveaway> {
  const res = await pool.query<Row>(
    `INSERT INTO panda.giveaways (server_id, channel_id, message_id, prize, winner_count, end_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, server_id, channel_id, message_id, prize, winner_count, end_at, ended, winners_json, created_by, created_at`,
    [
      input.serverId,
      input.channelId,
      input.messageId,
      input.prize,
      input.winnerCount,
      input.endAt,
      input.createdBy,
    ],
  );
  const row = res.rows[0];
  if (!row) throw new Error('giveaway insert returned no row');
  return rowToGiveaway(row);
}

// Scoped to the server the command came from. A message ID is globally
// unique but not secret, so without this an admin of their own server
// could act on a giveaway belonging to any server they can see.
export async function getByMessage(
  serverId: string,
  messageId: string,
): Promise<Giveaway | null> {
  const res = await pool.query<Row>(
    `SELECT id, server_id, channel_id, message_id, prize, winner_count, end_at, ended, winners_json, created_by, created_at
       FROM panda.giveaways
      WHERE message_id = $1 AND server_id = $2`,
    [messageId, serverId],
  );
  return res.rows[0] ? rowToGiveaway(res.rows[0]) : null;
}

export async function listActive(serverId: string): Promise<Giveaway[]> {
  const res = await pool.query<Row>(
    `SELECT id, server_id, channel_id, message_id, prize, winner_count, end_at, ended, winners_json, created_by, created_at
       FROM panda.giveaways
      WHERE server_id = $1 AND ended = FALSE
      ORDER BY end_at ASC`,
    [serverId],
  );
  return res.rows.map(rowToGiveaway);
}

const LEASE_SECONDS = 180;
const MAX_ATTEMPTS = 5;

// Tick query: lease every giveaway whose end_at has passed and that isn't
// already ended, so a concurrent tick skips it. The giveaway is NOT marked
// ended here — that happens in `markEnded()` once winners have actually
// been drawn and announced. Marking it up front meant any failure during
// the draw left it ended with no winners and no way to redo it.
export async function claimDueGiveaways(now: Date, limit = 25): Promise<Giveaway[]> {
  const res = await pool.query<Row>(
    `UPDATE panda.giveaways g
        SET claimed_at = $1,
            attempts   = g.attempts + 1
      WHERE g.id IN (
        SELECT id FROM panda.giveaways
         WHERE ended = FALSE
           AND end_at <= $1
           AND attempts < $3
           AND (claimed_at IS NULL OR claimed_at < $1 - ($4 || ' seconds')::interval)
         ORDER BY end_at ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
      )
      RETURNING g.id, g.server_id, g.channel_id, g.message_id, g.prize, g.winner_count, g.end_at, g.ended, g.winners_json, g.created_by, g.created_at`,
    [now, limit, MAX_ATTEMPTS, LEASE_SECONDS],
  );
  return res.rows.map(rowToGiveaway);
}

// The draw completed — winners are recorded and announced.
export async function markEnded(id: number): Promise<void> {
  await pool.query(`UPDATE panda.giveaways SET ended = TRUE, claimed_at = NULL WHERE id = $1`, [
    id,
  ]);
}

// The draw failed in a way that might succeed later. Release the lease so
// a later tick retries it; the giveaway stays un-ended.
export async function releaseGiveaway(id: number): Promise<void> {
  await pool.query(`UPDATE panda.giveaways SET claimed_at = NULL WHERE id = $1`, [id]);
}

// End a giveaway early: marks it ended without going through the tick
// scheduler. Returns null if already ended or doesn't exist.
export async function endNow(serverId: string, messageId: string): Promise<Giveaway | null> {
  const res = await pool.query<Row>(
    `UPDATE panda.giveaways
        SET ended = TRUE, end_at = LEAST(end_at, now())
      WHERE message_id = $1 AND server_id = $2 AND ended = FALSE
      RETURNING id, server_id, channel_id, message_id, prize, winner_count, end_at, ended, winners_json, created_by, created_at`,
    [messageId, serverId],
  );
  return res.rows[0] ? rowToGiveaway(res.rows[0]) : null;
}

export async function recordWinners(id: number, winners: string[]): Promise<void> {
  await pool.query(
    `UPDATE panda.giveaways SET winners_json = $1 WHERE id = $2`,
    [JSON.stringify(winners), id],
  );
}
