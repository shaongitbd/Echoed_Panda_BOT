import { pool } from '../db/pool.js';

export interface KeywordRule {
  id: number;
  serverId: string;
  phrase: string;
  response: string;
  channelId: string | null;
  createdBy: string;
}

interface Row {
  id: string;
  server_id: string;
  phrase: string;
  response: string;
  channel_id: string | null;
  created_by: string;
}

function rowToRule(row: Row): KeywordRule {
  return {
    id: Number(row.id),
    serverId: row.server_id,
    phrase: row.phrase,
    response: row.response,
    channelId: row.channel_id,
    createdBy: row.created_by,
  };
}

// Per-server cache. Read on every message — short TTL keeps it fresh
// without thrashing the DB.
const TTL_MS = 60 * 1000;
const cacheByServer = new Map<string, { rules: KeywordRule[]; expiresAt: number }>();

export async function getRulesForServer(serverId: string): Promise<KeywordRule[]> {
  const cached = cacheByServer.get(serverId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.rules;
  }
  const res = await pool.query<Row>(
    `SELECT id, server_id, phrase, response, channel_id, created_by
       FROM panda.keyword_responses
      WHERE server_id = $1`,
    [serverId],
  );
  const rules = res.rows.map(rowToRule);
  cacheByServer.set(serverId, { rules, expiresAt: Date.now() + TTL_MS });
  return rules;
}

export async function addRule(input: {
  serverId: string;
  phrase: string;
  response: string;
  channelId: string | null;
  createdBy: string;
}): Promise<KeywordRule> {
  const res = await pool.query<Row>(
    `INSERT INTO panda.keyword_responses (server_id, phrase, response, channel_id, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, server_id, phrase, response, channel_id, created_by`,
    [input.serverId, input.phrase, input.response, input.channelId, input.createdBy],
  );
  cacheByServer.delete(input.serverId);
  const row = res.rows[0];
  if (!row) throw new Error('keyword_responses insert returned no row');
  return rowToRule(row);
}

export async function removeRule(serverId: string, id: number): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM panda.keyword_responses WHERE server_id = $1 AND id = $2`,
    [serverId, id],
  );
  cacheByServer.delete(serverId);
  return (res.rowCount ?? 0) > 0;
}

export async function listForServer(serverId: string): Promise<KeywordRule[]> {
  return getRulesForServer(serverId);
}
