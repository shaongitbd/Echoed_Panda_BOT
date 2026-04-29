import { pool } from '../db';

export interface KeywordRule {
  id: number;
  phrase: string;
  response: string;
  channelId: string | null;
}

interface Row {
  id: string;
  phrase: string;
  response: string;
  channel_id: string | null;
}

function rowToRule(row: Row): KeywordRule {
  return {
    id: Number(row.id),
    phrase: row.phrase,
    response: row.response,
    channelId: row.channel_id,
  };
}

export async function listForServer(serverId: string): Promise<KeywordRule[]> {
  const res = await pool.query<Row>(
    `SELECT id, phrase, response, channel_id
       FROM keyword_responses
      WHERE server_id = $1
      ORDER BY id ASC`,
    [serverId],
  );
  return res.rows.map(rowToRule);
}

export async function addRule(input: {
  serverId: string;
  phrase: string;
  response: string;
  channelId: string | null;
  createdBy: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO keyword_responses (server_id, phrase, response, channel_id, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.serverId, input.phrase, input.response, input.channelId, input.createdBy],
  );
}

export async function removeRule(serverId: string, id: number): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM keyword_responses WHERE server_id = $1 AND id = $2`,
    [serverId, id],
  );
  return (res.rowCount ?? 0) > 0;
}
