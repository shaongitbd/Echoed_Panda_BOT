import { pool } from '../db/pool.js';

export interface CustomCommand {
  serverId: string;
  name: string;
  response: string;
  createdBy: string;
  usesCount: number;
  createdAt: Date;
}

interface Row {
  server_id: string;
  name: string;
  response: string;
  created_by: string;
  uses_count: string;
  created_at: Date;
}

function rowToCommand(row: Row): CustomCommand {
  return {
    serverId: row.server_id,
    name: row.name,
    response: row.response,
    createdBy: row.created_by,
    usesCount: Number(row.uses_count),
    createdAt: row.created_at,
  };
}

export const NAME_MAX_LENGTH = 32;
export const RESPONSE_MAX_LENGTH = 1900;

const VALID_NAME_RE = /^[a-z0-9_-]{1,32}$/;

export function isValidName(name: string): boolean {
  return VALID_NAME_RE.test(name);
}

// Hot-path lookup, fired on every command-prefixed message that misses
// the built-in registry. Returns null on miss; cache in-process below.
const cache = new Map<string, { command: CustomCommand | null; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 1000;

function cacheKey(serverId: string, name: string): string {
  return `${serverId}:${name}`;
}

export async function getCommand(
  serverId: string,
  name: string,
): Promise<CustomCommand | null> {
  const key = cacheKey(serverId, name);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.command;
  }
  const res = await pool.query<Row>(
    `SELECT server_id, name, response, created_by, uses_count, created_at
       FROM panda.custom_commands
      WHERE server_id = $1 AND name = $2`,
    [serverId, name],
  );
  const command = res.rows[0] ? rowToCommand(res.rows[0]) : null;
  cache.set(key, { command, expiresAt: Date.now() + CACHE_TTL_MS });
  return command;
}

export async function addCommand(input: {
  serverId: string;
  name: string;
  response: string;
  createdBy: string;
}): Promise<CustomCommand> {
  const res = await pool.query<Row>(
    `INSERT INTO panda.custom_commands (server_id, name, response, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (server_id, name) DO UPDATE
       SET response = EXCLUDED.response,
           created_by = EXCLUDED.created_by,
           updated_at = now()
     RETURNING server_id, name, response, created_by, uses_count, created_at`,
    [input.serverId, input.name, input.response, input.createdBy],
  );
  const row = res.rows[0];
  if (!row) throw new Error('custom_commands upsert returned no row');
  cache.delete(cacheKey(input.serverId, input.name));
  return rowToCommand(row);
}

export async function removeCommand(serverId: string, name: string): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM panda.custom_commands WHERE server_id = $1 AND name = $2`,
    [serverId, name],
  );
  cache.delete(cacheKey(serverId, name));
  return (res.rowCount ?? 0) > 0;
}

export async function listCommands(serverId: string, limit = 100): Promise<CustomCommand[]> {
  const cap = Math.min(Math.max(1, limit), 200);
  const res = await pool.query<Row>(
    `SELECT server_id, name, response, created_by, uses_count, created_at
       FROM panda.custom_commands
      WHERE server_id = $1
      ORDER BY name ASC
      LIMIT $2`,
    [serverId, cap],
  );
  return res.rows.map(rowToCommand);
}

// Async fire-and-forget — we don't block command rendering on a stats
// bump. The DB write is small but it's still a round-trip we don't
// want on the hot path.
export function bumpUses(serverId: string, name: string): void {
  pool
    .query(
      `UPDATE panda.custom_commands
          SET uses_count = uses_count + 1
        WHERE server_id = $1 AND name = $2`,
      [serverId, name],
    )
    .catch(() => {
      /* silent — stats are nice-to-have */
    });
}
