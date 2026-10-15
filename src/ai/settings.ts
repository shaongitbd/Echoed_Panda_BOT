// AI moderation settings: per server (the key, the model, the caps) and per
// channel (the rules, the history window, the allowed actions). Written by the
// dashboard (and `!panda context`); read on the message hot path, so both are
// cached for a short TTL — a dashboard change is live within CACHE_MS.

import { pool } from '../db/pool.js';
import { registerTtlCache } from '../util/ttlCache.js';
import { openApiKey } from './secretBox.js';

/** Least to most severe. An action allows nothing above itself. */
export const AI_ACTIONS = ['flag', 'delete', 'warn', 'timeout', 'kick', 'ban'] as const;
export type AiAction = (typeof AI_ACTIONS)[number];

export function isAiAction(v: unknown): v is AiAction {
  return typeof v === 'string' && (AI_ACTIONS as readonly string[]).includes(v);
}

export const SEVERITY: Record<AiAction | 'none', number> = {
  none: 0, flag: 1, delete: 2, warn: 3, timeout: 4, kick: 5, ban: 6,
};

export interface AiServerSettings {
  serverId: string;
  enabled: boolean;
  /** Last 4 characters of the saved key, or null when none is saved. */
  keyHint: string | null;
  model: string | null;
  dailyCheckCap: number;
  maxKickbanPerHour: number;
}

export interface AiChannelRule {
  serverId: string;
  channelId: string;
  enabled: boolean;
  context: string;
  historySize: number;
  allowedActions: AiAction[];
  timeoutMaxMinutes: number;
  minConfidence: number;
  kickbanMinConfidence: number;
  /** True when this channel has no row of its own and uses the every-channel rule. */
  inherited?: boolean;
}

/** Hard limit on owner-written channel rules (matches the column CHECK). */
export const MAX_CONTEXT_CHARS = 2000;

const CACHE_MS = 30_000;

interface ServerEntry { value: { settings: AiServerSettings; sealedKey: string | null } | null; expiresAt: number }
interface ChannelsEntry { value: Map<string, AiChannelRule>; expiresAt: number }

const serverCache = new Map<string, ServerEntry>();
const channelCache = new Map<string, ChannelsEntry>();
registerTtlCache('ai.settings', serverCache, 20_000);
registerTtlCache('ai.channels', channelCache, 20_000);

async function loadServer(serverId: string): Promise<ServerEntry['value']> {
  const cached = serverCache.get(serverId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const res = await pool.query<{
    enabled: boolean;
    api_key_sealed: string | null;
    api_key_hint: string | null;
    model: string | null;
    daily_check_cap: number;
    max_kickban_per_hour: number;
  }>(
    `SELECT enabled, api_key_sealed, api_key_hint, model, daily_check_cap, max_kickban_per_hour
       FROM panda.ai_mod_settings WHERE server_id = $1`,
    [serverId],
  );
  const row = res.rows[0];
  const value = row
    ? {
        settings: {
          serverId,
          enabled: row.enabled,
          keyHint: row.api_key_hint,
          model: row.model,
          dailyCheckCap: row.daily_check_cap,
          maxKickbanPerHour: row.max_kickban_per_hour,
        },
        sealedKey: row.api_key_sealed,
      }
    : null;
  serverCache.set(serverId, { value, expiresAt: Date.now() + CACHE_MS });
  return value;
}

export async function getAiSettings(serverId: string): Promise<AiServerSettings | null> {
  return (await loadServer(serverId))?.settings ?? null;
}

/**
 * The server's OpenRouter key and model, ready to use — or null when AI
 * moderation is off, unconfigured, or the key can't be opened. Never cached
 * in plaintext beyond the call.
 */
export async function getAiCredentials(serverId: string): Promise<{ apiKey: string; model: string } | null> {
  const entry = await loadServer(serverId);
  if (!entry || !entry.settings.enabled || !entry.sealedKey || !entry.settings.model) return null;
  const apiKey = openApiKey(serverId, entry.sealedKey);
  if (!apiKey) return null;
  return { apiKey, model: entry.settings.model };
}

async function loadChannels(serverId: string): Promise<Map<string, AiChannelRule>> {
  const cached = channelCache.get(serverId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const res = await pool.query<{
    channel_id: string;
    enabled: boolean;
    context: string;
    history_size: number;
    allowed_actions: string[];
    timeout_max_minutes: number;
    min_confidence: number;
    kickban_min_confidence: number;
  }>(
    `SELECT channel_id, enabled, context, history_size, allowed_actions, timeout_max_minutes,
            min_confidence, kickban_min_confidence
       FROM panda.ai_mod_channels WHERE server_id = $1`,
    [serverId],
  );
  const map = new Map<string, AiChannelRule>();
  for (const r of res.rows) {
    map.set(r.channel_id, {
      serverId,
      channelId: r.channel_id,
      enabled: r.enabled,
      context: r.context,
      historySize: r.history_size,
      // Anything the column holds that isn't a known action is dropped, not
      // trusted — the executor only ever sees the vocabulary above.
      allowedActions: r.allowed_actions.filter(isAiAction),
      timeoutMaxMinutes: r.timeout_max_minutes,
      minConfidence: r.min_confidence,
      kickbanMinConfidence: r.kickban_min_confidence,
    });
  }
  channelCache.set(serverId, { value: map, expiresAt: Date.now() + CACHE_MS });
  return map;
}

/**
 * The "every channel" rule: a row with this channel id applies to every text
 * channel that has no row of its own. A channel's own row always wins —
 * including one that's switched off, which is how a channel is left out.
 */
export const ALL_CHANNELS = '*';

/** A channel's rule: its own row, else the every-channel rule (marked `inherited`). */
export async function getAiChannelRule(serverId: string, channelId: string): Promise<AiChannelRule | null> {
  const rules = await loadChannels(serverId);
  const own = rules.get(channelId);
  if (own) return own;
  const all = rules.get(ALL_CHANNELS);
  return all?.enabled ? { ...all, channelId, inherited: true } : null;
}

/** Which channels have AI moderation on — the only ones whose messages may go to the model. */
export interface AiChannelScope {
  /** The every-channel rule is on. */
  all: boolean;
  /** Any channel at all is on. */
  any: boolean;
  has(channelId: string): boolean;
}

/**
 * The channels whose messages may be sent to the model (the dashboard
 * promises the owner exactly that): each channel switched on by its own
 * row, or — with the every-channel rule on — every channel not switched off.
 */
export async function getAiChannelScope(serverId: string): Promise<AiChannelScope> {
  const rules = await loadChannels(serverId);
  const all = rules.get(ALL_CHANNELS)?.enabled === true;
  const on = new Set<string>();
  const off = new Set<string>();
  for (const [id, rule] of rules) {
    if (id === ALL_CHANNELS) continue;
    (rule.enabled ? on : off).add(id);
  }
  return {
    all,
    any: all || on.size > 0,
    has: (channelId) => channelId !== ALL_CHANNELS && (on.has(channelId) || (all && !off.has(channelId))),
  };
}

// A channel's first row copies the every-channel rule when there is one, so
// `!panda context` or `!panda on` in a channel never quietly drops the
// server's chosen actions and thresholds back to the bare defaults.
// `$1` server, `$2` channel; the caller supplies the enabled and context
// expressions. The every-channel row itself never copies from itself.
const insertFromDefaults = (enabled: string, context: string) => `
  INSERT INTO panda.ai_mod_channels
    (server_id, channel_id, enabled, context, history_size, allowed_actions,
     timeout_max_minutes, min_confidence, kickban_min_confidence)
  SELECT $1::text, $2::text, ${enabled}, ${context},
         COALESCE(a.history_size, 8), COALESCE(a.allowed_actions, ARRAY['flag', 'delete']::TEXT[]),
         COALESCE(a.timeout_max_minutes, 60), COALESCE(a.min_confidence, 80), COALESCE(a.kickban_min_confidence, 95)
    FROM (SELECT 1) AS one
    LEFT JOIN panda.ai_mod_channels a
      ON a.server_id = $1::text AND a.channel_id = '${ALL_CHANNELS}' AND $2::text <> '${ALL_CHANNELS}'`;

/**
 * Set a channel's rules text (the `!panda context` command). Creates the
 * channel's row (switched on) when it has none — copying the every-channel
 * rule's settings, else the safe defaults (flag + delete only).
 */
export async function setAiChannelContext(serverId: string, channelId: string, context: string): Promise<void> {
  await pool.query(
    `${insertFromDefaults('TRUE', '$3::text')}
     ON CONFLICT (server_id, channel_id)
     DO UPDATE SET context = EXCLUDED.context, updated_at = NOW()`,
    [serverId, channelId, context.slice(0, MAX_CONTEXT_CHARS)],
  );
  channelCache.delete(serverId);
}

/** `!panda on|off` — this channel, or ALL_CHANNELS for the every-channel rule. */
export async function setAiChannelEnabled(serverId: string, channelId: string, enabled: boolean): Promise<void> {
  await pool.query(
    `${insertFromDefaults('$3::boolean', "COALESCE(a.context, '')")}
     ON CONFLICT (server_id, channel_id)
     DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
    [serverId, channelId, enabled],
  );
  channelCache.delete(serverId);
}
