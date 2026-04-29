import { pool } from '../db';

// Mirror of the bot's Giveaway shape (kept local — see guildConfig.ts
// for the same self-contained-build rationale).

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

const SELECT = `
  id, server_id, channel_id, message_id, prize, winner_count,
  end_at, ended, winners_json, created_by, created_at
`;

function rowToGiveaway(row: Row): Giveaway {
  let winners: string[] = [];
  if (row.winners_json) {
    try {
      const parsed: unknown = JSON.parse(row.winners_json);
      if (Array.isArray(parsed)) {
        winners = parsed.filter((v): v is string => typeof v === 'string');
      }
    } catch {
      /* fall through */
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

export async function listActive(serverId: string): Promise<Giveaway[]> {
  const res = await pool.query<Row>(
    `SELECT ${SELECT}
       FROM panda.giveaways
      WHERE server_id = $1 AND ended = FALSE
      ORDER BY end_at ASC`,
    [serverId],
  );
  return res.rows.map(rowToGiveaway);
}

// Recent completed giveaways. Limited because history isn't paginated
// here — the page stays light, deeper history goes to a future view.
export async function listRecentEnded(serverId: string, limit = 20): Promise<Giveaway[]> {
  const res = await pool.query<Row>(
    `SELECT ${SELECT}
       FROM panda.giveaways
      WHERE server_id = $1 AND ended = TRUE
      ORDER BY end_at DESC
      LIMIT $2`,
    [serverId, limit],
  );
  return res.rows.map(rowToGiveaway);
}

// "End early": bump end_at to now() and let the bot's 15s tick claim
// the row, fetch reactions, pick winners, and post the announcement.
// We deliberately don't flip `ended = TRUE` ourselves — the tick's
// claim query only matches ended=FALSE, so flipping it here would
// strand the row with no winners ever announced.
export async function nudgeEndNow(serverId: string, id: number): Promise<Giveaway | null> {
  const res = await pool.query<Row>(
    `UPDATE panda.giveaways
        SET end_at = LEAST(end_at, now())
      WHERE id = $1 AND server_id = $2 AND ended = FALSE
      RETURNING ${SELECT}`,
    [id, serverId],
  );
  return res.rows[0] ? rowToGiveaway(res.rows[0]) : null;
}

export async function insertGiveaway(input: {
  serverId: string;
  channelId: string;
  messageId: string;
  prize: string;
  winnerCount: number;
  endAt: Date;
  createdBy: string;
}): Promise<Giveaway> {
  const res = await pool.query<Row>(
    `INSERT INTO panda.giveaways
       (server_id, channel_id, message_id, prize, winner_count, end_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${SELECT}`,
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
