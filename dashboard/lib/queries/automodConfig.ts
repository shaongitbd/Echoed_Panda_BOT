import { pool } from '../db';

// Mirror of the bot's AutomodConfig. Same dynamic-upsert pattern as
// guildConfig + levelSettings — only writes the fields the form
// changed, never clobbers state the bot owns (e.g. running spam
// counters, though those are in-memory).

export type FilterKind =
  | 'spam'
  | 'bad_words'
  | 'caps'
  | 'mentions'
  | 'emoji'
  | 'zalgo'
  | 'links'
  | 'invites';

export const ALL_FILTERS: readonly FilterKind[] = [
  'invites',
  'bad_words',
  'mentions',
  'links',
  'caps',
  'emoji',
  'zalgo',
  'spam',
];

export interface AutomodConfig {
  serverId: string;
  enabled: boolean;
  spamEnabled: boolean;
  spamThreshold: number;
  spamWindowSeconds: number;
  badWordsEnabled: boolean;
  badWords: string[];
  capsEnabled: boolean;
  capsThresholdPct: number;
  capsMinLength: number;
  mentionsEnabled: boolean;
  mentionsThreshold: number;
  emojiEnabled: boolean;
  emojiThreshold: number;
  zalgoEnabled: boolean;
  linksEnabled: boolean;
  linkWhitelist: string[];
  invitesEnabled: boolean;
  exemptChannelIds: string[];
  exemptRoleIds: string[];
}

interface Row {
  server_id: string;
  enabled: boolean;
  spam_enabled: boolean;
  spam_threshold: number;
  spam_window_seconds: number;
  bad_words_enabled: boolean;
  bad_words: string[];
  caps_enabled: boolean;
  caps_threshold_pct: number;
  caps_min_length: number;
  mentions_enabled: boolean;
  mentions_threshold: number;
  emoji_enabled: boolean;
  emoji_threshold: number;
  zalgo_enabled: boolean;
  links_enabled: boolean;
  link_whitelist: string[];
  invites_enabled: boolean;
  exempt_channel_ids: string[];
  exempt_role_ids: string[];
}

const DEFAULTS = (serverId: string): AutomodConfig => ({
  serverId,
  enabled: false,
  spamEnabled: false,
  spamThreshold: 5,
  spamWindowSeconds: 5,
  badWordsEnabled: false,
  badWords: [],
  capsEnabled: false,
  capsThresholdPct: 70,
  capsMinLength: 10,
  mentionsEnabled: false,
  mentionsThreshold: 5,
  emojiEnabled: false,
  emojiThreshold: 10,
  zalgoEnabled: false,
  linksEnabled: false,
  linkWhitelist: [],
  invitesEnabled: false,
  exemptChannelIds: [],
  exemptRoleIds: [],
});

function rowToConfig(row: Row): AutomodConfig {
  return {
    serverId: row.server_id,
    enabled: row.enabled,
    spamEnabled: row.spam_enabled,
    spamThreshold: row.spam_threshold,
    spamWindowSeconds: row.spam_window_seconds,
    badWordsEnabled: row.bad_words_enabled,
    badWords: row.bad_words,
    capsEnabled: row.caps_enabled,
    capsThresholdPct: row.caps_threshold_pct,
    capsMinLength: row.caps_min_length,
    mentionsEnabled: row.mentions_enabled,
    mentionsThreshold: row.mentions_threshold,
    emojiEnabled: row.emoji_enabled,
    emojiThreshold: row.emoji_threshold,
    zalgoEnabled: row.zalgo_enabled,
    linksEnabled: row.links_enabled,
    linkWhitelist: row.link_whitelist,
    invitesEnabled: row.invites_enabled,
    exemptChannelIds: row.exempt_channel_ids,
    exemptRoleIds: row.exempt_role_ids,
  };
}

const SELECT = `
  server_id, enabled,
  spam_enabled, spam_threshold, spam_window_seconds,
  bad_words_enabled, bad_words,
  caps_enabled, caps_threshold_pct, caps_min_length,
  mentions_enabled, mentions_threshold,
  emoji_enabled, emoji_threshold,
  zalgo_enabled,
  links_enabled, link_whitelist,
  invites_enabled,
  exempt_channel_ids, exempt_role_ids
`;

export async function getAutomodConfig(serverId: string): Promise<AutomodConfig> {
  const res = await pool.query<Row>(
    `SELECT ${SELECT} FROM automod_config WHERE server_id = $1`,
    [serverId],
  );
  return res.rows[0] ? rowToConfig(res.rows[0]) : DEFAULTS(serverId);
}

type UpsertableFields = Partial<Omit<AutomodConfig, 'serverId'>>;

const FIELD_TO_COLUMN: Record<keyof UpsertableFields, string> = {
  enabled: 'enabled',
  spamEnabled: 'spam_enabled',
  spamThreshold: 'spam_threshold',
  spamWindowSeconds: 'spam_window_seconds',
  badWordsEnabled: 'bad_words_enabled',
  badWords: 'bad_words',
  capsEnabled: 'caps_enabled',
  capsThresholdPct: 'caps_threshold_pct',
  capsMinLength: 'caps_min_length',
  mentionsEnabled: 'mentions_enabled',
  mentionsThreshold: 'mentions_threshold',
  emojiEnabled: 'emoji_enabled',
  emojiThreshold: 'emoji_threshold',
  zalgoEnabled: 'zalgo_enabled',
  linksEnabled: 'links_enabled',
  linkWhitelist: 'link_whitelist',
  invitesEnabled: 'invites_enabled',
  exemptChannelIds: 'exempt_channel_ids',
  exemptRoleIds: 'exempt_role_ids',
};

export async function setAutomodConfig(
  serverId: string,
  fields: UpsertableFields,
): Promise<AutomodConfig> {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined) as [
    keyof UpsertableFields,
    AutomodConfig[keyof UpsertableFields],
  ][];
  if (entries.length === 0) return getAutomodConfig(serverId);

  const cols = entries.map(([k]) => FIELD_TO_COLUMN[k]);
  const placeholders = entries.map((_, i) => `$${i + 2}`);
  const values = entries.map(([, v]) => v);
  const updates = cols.map((col) => `${col} = EXCLUDED.${col}`).join(', ');

  const res = await pool.query<Row>(
    `INSERT INTO automod_config (server_id, ${cols.join(', ')})
     VALUES ($1, ${placeholders.join(', ')})
     ON CONFLICT (server_id) DO UPDATE SET ${updates}
     RETURNING ${SELECT}`,
    [serverId, ...values],
  );

  const row = res.rows[0];
  if (!row) {
    throw new Error(`automod_config upsert returned no row for server ${serverId}`);
  }
  return rowToConfig(row);
}
