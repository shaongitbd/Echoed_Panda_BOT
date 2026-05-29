import { pool } from '../db/pool.js';

export interface StarboardConfig {
  serverId: string;
  channelId: string | null;
  emoji: string;
  threshold: number;
  enabled: boolean;
}

interface ConfigRow {
  server_id: string;
  channel_id: string | null;
  emoji: string;
  threshold: number;
  enabled: boolean;
}

function rowToConfig(row: ConfigRow): StarboardConfig {
  return {
    serverId: row.server_id,
    channelId: row.channel_id,
    emoji: row.emoji,
    threshold: row.threshold,
    enabled: row.enabled,
  };
}

const DEFAULT_CONFIG = (serverId: string): StarboardConfig => ({
  serverId,
  channelId: null,
  emoji: '⭐',
  threshold: 3,
  enabled: false,
});

export async function getStarboardConfig(serverId: string): Promise<StarboardConfig> {
  const res = await pool.query<ConfigRow>(
    `SELECT server_id, channel_id, emoji, threshold, enabled
       FROM panda.starboard_config WHERE server_id = $1`,
    [serverId],
  );
  const row = res.rows[0];
  return row ? rowToConfig(row) : DEFAULT_CONFIG(serverId);
}

export interface StarboardConfigPatch {
  channelId?: string;
  emoji?: string;
  threshold?: number;
  enabled?: boolean;
}

const FIELD_TO_COLUMN: Record<keyof StarboardConfigPatch, string> = {
  channelId: 'channel_id',
  emoji: 'emoji',
  threshold: 'threshold',
  enabled: 'enabled',
};

export async function setStarboardConfig(
  serverId: string,
  patch: StarboardConfigPatch,
): Promise<StarboardConfig> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined) as [
    keyof StarboardConfigPatch,
    unknown,
  ][];
  if (entries.length === 0) return getStarboardConfig(serverId);

  const cols = entries.map(([k]) => FIELD_TO_COLUMN[k]);
  const placeholders = entries.map((_, i) => `$${i + 2}`);
  const values = entries.map(([, v]) => v);
  const updates = cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ');

  const res = await pool.query<ConfigRow>(
    `INSERT INTO panda.starboard_config (server_id, ${cols.join(', ')}, updated_at)
     VALUES ($1, ${placeholders.join(', ')}, now())
     ON CONFLICT (server_id) DO UPDATE SET ${updates}, updated_at = now()
     RETURNING server_id, channel_id, emoji, threshold, enabled`,
    [serverId, ...values],
  );
  return rowToConfig(res.rows[0]!);
}

export interface StarboardPost {
  starboardMessageId: string;
  starCount: number;
}

export async function getStarboardPost(
  serverId: string,
  sourceMessageId: string,
): Promise<StarboardPost | null> {
  const res = await pool.query<{ starboard_message_id: string; star_count: number }>(
    `SELECT starboard_message_id, star_count FROM panda.starboard_posts
      WHERE server_id = $1 AND source_message_id = $2`,
    [serverId, sourceMessageId],
  );
  const row = res.rows[0];
  return row ? { starboardMessageId: row.starboard_message_id, starCount: row.star_count } : null;
}

export async function insertStarboardPost(input: {
  serverId: string;
  sourceMessageId: string;
  sourceChannelId: string;
  starboardMessageId: string;
  starCount: number;
}): Promise<void> {
  await pool.query(
    `INSERT INTO panda.starboard_posts
       (server_id, source_message_id, source_channel_id, starboard_message_id, star_count)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (server_id, source_message_id) DO UPDATE
       SET starboard_message_id = EXCLUDED.starboard_message_id,
           star_count = EXCLUDED.star_count`,
    [input.serverId, input.sourceMessageId, input.sourceChannelId, input.starboardMessageId, input.starCount],
  );
}

export async function updateStarCount(
  serverId: string,
  sourceMessageId: string,
  starCount: number,
): Promise<void> {
  await pool.query(
    `UPDATE panda.starboard_posts SET star_count = $3
      WHERE server_id = $1 AND source_message_id = $2`,
    [serverId, sourceMessageId, starCount],
  );
}
