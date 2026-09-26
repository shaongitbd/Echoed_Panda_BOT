import { pool } from '../db/pool.js';
import { registerTtlCache } from '../util/ttlCache.js';

// Server logs: where each half goes and what is switched off. See
// db/migrate.ts 'log_config table' for the storage rules.

// Every event the logger can post. Stored by these names in
// disabled_events, and spelled the same on the dashboard.
export const LOG_EVENTS = [
  'message_edit',
  'message_delete',
  'message_bulk_delete',
  'member_join',
  'member_leave',
  'member_kick',
  'member_ban',
  'member_nickname',
] as const;

export type LogEvent = (typeof LOG_EVENTS)[number];

// Which channel an event posts to.
export const MESSAGE_EVENTS: ReadonlySet<LogEvent> = new Set<LogEvent>([
  'message_edit',
  'message_delete',
  'message_bulk_delete',
]);

export function isLogEvent(name: string): name is LogEvent {
  return (LOG_EVENTS as readonly string[]).includes(name);
}

export interface LogConfig {
  serverId: string;
  messageChannel: string | null;
  memberChannel: string | null;
  disabledEvents: LogEvent[];
  ignoredChannelIds: string[];
  ignoreBots: boolean;
}

interface Row {
  server_id: string;
  message_channel: string | null;
  member_channel: string | null;
  disabled_events: string[] | null;
  ignored_channel_ids: string[] | null;
  ignore_bots: boolean | null;
}

const COLS = `server_id, message_channel, member_channel, disabled_events,
              ignored_channel_ids, ignore_bots`;

function rowToConfig(row: Row): LogConfig {
  return {
    serverId: row.server_id,
    messageChannel: row.message_channel,
    memberChannel: row.member_channel,
    // An unknown name (an event removed in a later version) is dropped
    // rather than trusted.
    disabledEvents: (row.disabled_events ?? []).filter(isLogEvent),
    ignoredChannelIds: row.ignored_channel_ids ?? [],
    ignoreBots: row.ignore_bots ?? true,
  };
}

const EMPTY = (serverId: string): LogConfig => ({
  serverId,
  messageChannel: null,
  memberChannel: null,
  disabledEvents: [],
  ignoredChannelIds: [],
  ignoreBots: true,
});

// Every logged event reads this, and most servers have no logging at all —
// so the miss is cached too. 60s matches guildConfig: the dashboard writes
// Postgres directly, and a longer TTL would leave its changes unapplied for
// longer than an admin will wait before assuming they failed.
const TTL_MS = 60 * 1000;
const cache = new Map<string, { config: LogConfig; expiresAt: number }>();
registerTtlCache('logConfig', cache, 5_000);

export async function getLogConfig(serverId: string): Promise<LogConfig> {
  const cached = cache.get(serverId);
  if (cached && cached.expiresAt > Date.now()) return cached.config;

  const res = await pool.query<Row>(
    `SELECT ${COLS} FROM panda.log_config WHERE server_id = $1`,
    [serverId],
  );
  const config = res.rows[0] ? rowToConfig(res.rows[0]) : EMPTY(serverId);
  cache.set(serverId, { config, expiresAt: Date.now() + TTL_MS });
  return config;
}

type Settable = Partial<Omit<LogConfig, 'serverId'>>;

const FIELD_TO_COLUMN: Record<keyof Settable, string> = {
  messageChannel: 'message_channel',
  memberChannel: 'member_channel',
  disabledEvents: 'disabled_events',
  ignoredChannelIds: 'ignored_channel_ids',
  ignoreBots: 'ignore_bots',
};

export async function setLogConfig(serverId: string, fields: Settable): Promise<LogConfig> {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined) as [
    keyof Settable,
    string | boolean | string[] | null,
  ][];
  if (entries.length === 0) return getLogConfig(serverId);

  const cols = entries.map(([k]) => FIELD_TO_COLUMN[k]);
  const placeholders = entries.map((_, i) => `$${i + 2}`);
  const updates = [...cols.map((col) => `${col} = EXCLUDED.${col}`), 'updated_at = now()'].join(', ');

  const res = await pool.query<Row>(
    `INSERT INTO panda.log_config (server_id, ${cols.join(', ')})
     VALUES ($1, ${placeholders.join(', ')})
     ON CONFLICT (server_id) DO UPDATE SET ${updates}
     RETURNING ${COLS}`,
    [serverId, ...entries.map(([, v]) => v)],
  );
  const row = res.rows[0];
  if (!row) throw new Error(`log_config upsert returned no row for server ${serverId}`);
  const next = rowToConfig(row);
  cache.set(serverId, { config: next, expiresAt: Date.now() + TTL_MS });
  return next;
}

// Where this event goes for this server, or null when it isn't logged.
export function logChannelFor(cfg: LogConfig, event: LogEvent): string | null {
  if (cfg.disabledEvents.includes(event)) return null;
  return MESSAGE_EVENTS.has(event) ? cfg.messageChannel : cfg.memberChannel;
}
