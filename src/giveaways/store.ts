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

export async function getByMessage(messageId: string): Promise<Giveaway | null> {
  const res = await pool.query<Row>(
    `SELECT id, server_id, channel_id, message_id, prize, winner_count, end_at, ended, winners_json, created_by, created_at
       FROM panda.giveaways
      WHERE message_id = $1`,
    [messageId],
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

// Tick query: claim every giveaway whose end_at has passed AND that
// isn't already marked ended. We mark them ended in the same query
// (and return the rows) so a concurrent tick can't double-pick the
// winners.
export async function claimDueGiveaways(now: Date, limit = 25): Promise<Giveaway[]> {
  const res = await pool.query<Row>(
    `UPDATE panda.giveaways
        SET ended = TRUE
      WHERE id IN (
        SELECT id FROM panda.giveaways
         WHERE ended = FALSE AND end_at <= $1
         ORDER BY end_at ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id, server_id, channel_id, message_id, prize, winner_count, end_at, ended, winners_json, created_by, created_at`,
    [now, limit],
  );
  return res.rows.map(rowToGiveaway);
}

// End a giveaway early: marks it ended without going through the tick
// scheduler. Returns null if already ended or doesn't exist.
export async function endNow(messageId: string): Promise<Giveaway | null> {
  const res = await pool.query<Row>(
    `UPDATE panda.giveaways
        SET ended = TRUE, end_at = LEAST(end_at, now())
      WHERE message_id = $1 AND ended = FALSE
      RETURNING id, server_id, channel_id, message_id, prize, winner_count, end_at, ended, winners_json, created_by, created_at`,
    [messageId],
  );
  return res.rows[0] ? rowToGiveaway(res.rows[0]) : null;
}

export async function recordWinners(id: number, winners: string[]): Promise<void> {
  await pool.query(
    `UPDATE panda.giveaways SET winners_json = $1 WHERE id = $2`,
    [JSON.stringify(winners), id],
  );
}
