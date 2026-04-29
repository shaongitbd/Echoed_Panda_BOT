import pg from 'pg';
import { config } from '../config.js';
import { log } from '../log.js';

const { Pool } = pg;

// One process-wide pool. node-postgres handles per-call checkout/release;
// callers should prefer `pool.query(...)` for one-shot statements and
// `pool.connect()` only when they need a transaction or LISTEN/NOTIFY.
export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  // Ten-second connect timeout — enough for a slow handshake on a cold
  // pooler, short enough that we surface "DB unreachable" within bounds.
  connectionTimeoutMillis: 10_000,
  // Set the search path so we don't have to qualify every table with
  // `panda.*`. Falls back to public for anything we accidentally don't
  // own — that'll surface as a clear "permission denied" rather than a
  // mystery write to the wrong schema.
  options: '-c search_path=panda,public',
});

pool.on('error', (err) => {
  log.error({ err }, 'Unexpected error on idle Postgres client');
});

export async function pingDb(): Promise<void> {
  const res = await pool.query<{ ok: number }>('SELECT 1 AS ok');
  if (res.rows[0]?.ok !== 1) {
    throw new Error('Postgres ping returned unexpected result');
  }
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
