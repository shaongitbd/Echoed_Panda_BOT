import pg from 'pg';
import { config } from '../config.js';
import { log } from '../log.js';

const { Pool } = pg;

// One process-wide pool. node-postgres handles per-call checkout/release;
// callers should prefer `pool.query(...)` for one-shot statements and
// `pool.connect()` only when they need a transaction or LISTEN/NOTIFY.
export const pool = new Pool({
  connectionString: config.databaseUrl,
  // Every inbound message fans out into several independent pipelines that
  // each touch the database, so the pool has to accommodate the message
  // rate of the whole fleet rather than one server's. Note this bounds the
  // wait for a free client as well as for a new connection: when the pool
  // saturates, callers throw rather than queue.
  max: 24,
  idleTimeoutMillis: 30_000,
  // Ten-second connect timeout — enough for a slow handshake on a cold
  // pooler, short enough that we surface "DB unreachable" within bounds.
  connectionTimeoutMillis: 10_000,
  // Set the search path so we don't have to qualify every table with
  // `panda.*`. Falls back to public for anything we accidentally don't
  // own — that'll surface as a clear "permission denied" rather than a
  // mystery write to the wrong schema.
  //
  // The timeouts matter more than they look: without them a handful of
  // wedged statements hold their clients forever, and since saturation
  // throws rather than queues, every database-backed feature fails with no
  // path back short of a restart. UTC keeps date arithmetic stable
  // regardless of the host's timezone.
  options:
    '-c search_path=panda,public -c TimeZone=UTC -c statement_timeout=15000 -c idle_in_transaction_session_timeout=30000',
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
