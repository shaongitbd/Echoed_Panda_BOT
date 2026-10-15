// Spend and blast-radius limits for AI moderation.
//
// - Daily check cap: every AI request first claims one unit of the server's
//   daily budget. Claim and check are one statement, so messages arriving
//   together can't each see "one left" and all go through.
// - Kick/ban circuit breaker: the AI's own kicks and bans per server per hour
//   are counted from the action log; past the server's limit, a kick or ban
//   the model asks for is downgraded and flagged for a human instead. A model
//   that misreads a channel can't empty a server.

import { pool } from '../db/pool.js';
import { log } from '../log.js';

/** Claim one AI check for today. False when the server's daily cap is spent. */
export async function claimDailyCheck(serverId: string, cap: number): Promise<boolean> {
  if (cap <= 0) return false;
  // Insert-or-increment only while under the cap; no row back means the cap
  // was already reached (the WHERE kept the update from happening).
  const res = await pool.query(
    `INSERT INTO panda.ai_mod_usage (server_id, day, checks)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (server_id, day)
     DO UPDATE SET checks = panda.ai_mod_usage.checks + 1
       WHERE panda.ai_mod_usage.checks < $2
     RETURNING checks`,
    [serverId, cap],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function checksToday(serverId: string): Promise<number> {
  const res = await pool.query<{ checks: number }>(
    `SELECT checks FROM panda.ai_mod_usage WHERE server_id = $1 AND day = CURRENT_DATE`,
    [serverId],
  );
  return res.rows[0]?.checks ?? 0;
}

/** The AI's own kicks + bans on this server in the last hour. */
export async function recentAiKickbans(serverId: string): Promise<number> {
  const res = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::TEXT AS n FROM panda.ai_mod_actions
      WHERE server_id = $1 AND action IN ('kick', 'ban') AND created_at > NOW() - INTERVAL '1 hour'`,
    [serverId],
  );
  return Number(res.rows[0]?.n ?? 0);
}

export async function recordAiAction(input: {
  serverId: string;
  channelId: string;
  messageId: string | null;
  targetId: string;
  action: string;
  confidence: number | null;
  reason: string | null;
  model: string | null;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO panda.ai_mod_actions (server_id, channel_id, message_id, target_id, action, confidence, reason, model)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.serverId, input.channelId, input.messageId, input.targetId, input.action,
        input.confidence, input.reason?.slice(0, 1000) ?? null, input.model,
      ],
    );
  } catch (err) {
    log.warn({ err, serverId: input.serverId }, 'AI action record failed');
  }
}
