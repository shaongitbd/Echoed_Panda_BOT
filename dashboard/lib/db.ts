import pg from 'pg';
import { config } from './config';

// One process-wide pool, shared by all server actions and route
// handlers. Next.js's per-request lifecycle is handled inside each
// query — the pool itself is reused across requests. In dev this
// also survives across hot-module reloads via the global cache below.
const { Pool } = pg;

declare global {
  // eslint-disable-next-line no-var
  var __pandaPgPool: pg.Pool | undefined;
}

function makePool(): pg.Pool {
  return new Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Match the bot's search_path so we never have to qualify table
    // names with `panda.` — the schema is the contract between the
    // two halves.
    options: '-c search_path=panda,public',
  });
}

export const pool: pg.Pool = global.__pandaPgPool ?? makePool();
if (process.env.NODE_ENV !== 'production') {
  global.__pandaPgPool = pool;
}

pool.on('error', (err) => {
  // Don't crash on transient DB hiccups — log and continue. Next.js
  // will surface a 500 on the affected request.
  console.error('[panda-dashboard] PG pool error', err);
});
