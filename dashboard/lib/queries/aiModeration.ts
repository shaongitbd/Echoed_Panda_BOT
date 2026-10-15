import 'server-only';
import { pool } from '../db';
import { sealApiKey } from '../secretBox';

// Mirror of the bot's src/ai/settings.ts tables (panda.ai_mod_settings,
// panda.ai_mod_channels). The bot reads them with a 30 s cache, so a save
// here is live within half a minute.

export const AI_ACTIONS = ['flag', 'delete', 'warn', 'timeout', 'kick', 'ban'] as const;
export type AiAction = (typeof AI_ACTIONS)[number];

export interface AiSettingsView {
  enabled: boolean;
  /** Last 4 characters of the saved key; the key itself is never read back. */
  keyHint: string | null;
  model: string | null;
  dailyCheckCap: number;
  maxKickbanPerHour: number;
}

export interface AiChannelView {
  channelId: string;
  enabled: boolean;
  context: string;
  historySize: number;
  allowedActions: AiAction[];
  timeoutMaxMinutes: number;
  minConfidence: number;
  kickbanMinConfidence: number;
}

const DEFAULTS: AiSettingsView = {
  enabled: false,
  keyHint: null,
  model: null,
  dailyCheckCap: 2000,
  maxKickbanPerHour: 5,
};

export async function getAiSettings(serverId: string): Promise<AiSettingsView> {
  const res = await pool.query<{
    enabled: boolean;
    api_key_hint: string | null;
    model: string | null;
    daily_check_cap: number;
    max_kickban_per_hour: number;
  }>(
    `SELECT enabled, api_key_hint, model, daily_check_cap, max_kickban_per_hour
       FROM ai_mod_settings WHERE server_id = $1`,
    [serverId],
  );
  const r = res.rows[0];
  if (!r) return DEFAULTS;
  return {
    enabled: r.enabled,
    keyHint: r.api_key_hint,
    model: r.model,
    dailyCheckCap: r.daily_check_cap,
    maxKickbanPerHour: r.max_kickban_per_hour,
  };
}

export async function checksToday(serverId: string): Promise<number> {
  const res = await pool.query<{ checks: number }>(
    `SELECT checks FROM ai_mod_usage WHERE server_id = $1 AND day = CURRENT_DATE`,
    [serverId],
  );
  return res.rows[0]?.checks ?? 0;
}

/**
 * Save the server settings. `apiKey`: a new key to seal and store, `null` to
 * remove the saved one, `undefined` to keep it untouched.
 */
export async function saveAiSettings(
  serverId: string,
  input: { enabled: boolean; model: string | null; dailyCheckCap: number; maxKickbanPerHour: number },
  apiKey: string | null | undefined,
): Promise<void> {
  const keyCols =
    apiKey === undefined
      ? { sealed: null, hint: null, touch: false }
      : apiKey === null
        ? { sealed: null, hint: null, touch: true }
        : { sealed: sealApiKey(serverId, apiKey), hint: apiKey.slice(-4), touch: true };

  await pool.query(
    `INSERT INTO ai_mod_settings (server_id, enabled, model, daily_check_cap, max_kickban_per_hour,
                                  api_key_sealed, api_key_hint, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (server_id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       model = EXCLUDED.model,
       daily_check_cap = EXCLUDED.daily_check_cap,
       max_kickban_per_hour = EXCLUDED.max_kickban_per_hour,
       api_key_sealed = CASE WHEN $8 THEN EXCLUDED.api_key_sealed ELSE ai_mod_settings.api_key_sealed END,
       api_key_hint   = CASE WHEN $8 THEN EXCLUDED.api_key_hint   ELSE ai_mod_settings.api_key_hint END,
       updated_at = NOW()`,
    [serverId, input.enabled, input.model, input.dailyCheckCap, input.maxKickbanPerHour, keyCols.sealed, keyCols.hint, keyCols.touch],
  );
}

export async function listAiChannels(serverId: string): Promise<AiChannelView[]> {
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
       FROM ai_mod_channels WHERE server_id = $1
      ORDER BY (channel_id = '${ALL_CHANNELS}') DESC, updated_at`,
    [serverId],
  );
  return res.rows.map((r) => ({
    channelId: r.channel_id,
    enabled: r.enabled,
    context: r.context,
    historySize: r.history_size,
    allowedActions: r.allowed_actions.filter((a): a is AiAction => (AI_ACTIONS as readonly string[]).includes(a)),
    timeoutMaxMinutes: r.timeout_max_minutes,
    minConfidence: r.min_confidence,
    kickbanMinConfidence: r.kickban_min_confidence,
  }));
}

/**
 * The "every channel" rule's channel id (the bot's src/ai/settings.ts uses
 * the same). It applies to every text channel without a row of its own; a
 * channel's own row wins, including one switched off.
 */
export const ALL_CHANNELS = '*';

export async function addAiChannel(serverId: string, channelId: string): Promise<void> {
  // A channel added while the every-channel rule exists starts as a copy of
  // it (so adding a channel to give it its own rules never drops the server's
  // chosen actions); otherwise on the safe end: flag and delete, nothing more.
  await pool.query(
    `INSERT INTO ai_mod_channels
       (server_id, channel_id, context, history_size, allowed_actions,
        timeout_max_minutes, min_confidence, kickban_min_confidence)
     SELECT $1::text, $2::text, COALESCE(a.context, ''), COALESCE(a.history_size, 8),
            COALESCE(a.allowed_actions, ARRAY['flag', 'delete']::TEXT[]), COALESCE(a.timeout_max_minutes, 60),
            COALESCE(a.min_confidence, 80), COALESCE(a.kickban_min_confidence, 95)
       FROM (SELECT 1) AS one
       LEFT JOIN ai_mod_channels a
         ON a.server_id = $1::text AND a.channel_id = '${ALL_CHANNELS}' AND $2::text <> '${ALL_CHANNELS}'
     ON CONFLICT DO NOTHING`,
    [serverId, channelId],
  );
}

export async function saveAiChannel(serverId: string, rule: AiChannelView): Promise<void> {
  await pool.query(
    `UPDATE ai_mod_channels SET
       enabled = $3, context = $4, history_size = $5, allowed_actions = $6::TEXT[],
       timeout_max_minutes = $7, min_confidence = $8, kickban_min_confidence = $9, updated_at = NOW()
     WHERE server_id = $1 AND channel_id = $2`,
    [
      serverId, rule.channelId, rule.enabled, rule.context, rule.historySize, rule.allowedActions,
      rule.timeoutMaxMinutes, rule.minConfidence, rule.kickbanMinConfidence,
    ],
  );
}

export async function removeAiChannel(serverId: string, channelId: string): Promise<void> {
  await pool.query(`DELETE FROM ai_mod_channels WHERE server_id = $1 AND channel_id = $2`, [serverId, channelId]);
}
