import { pool } from '../db/pool.js';

export interface DailyResult {
  alreadyClaimed: boolean;
  streak: number;
  bestStreak: number;
  totalClaims: number;
  // True when this claim continued an existing streak (yesterday → today).
  continued: boolean;
}

// YYYY-MM-DD for a Date in UTC.
export function utcDateString(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Claim today's check-in. `today`/`yesterday` are UTC YYYY-MM-DD strings passed
// in by the caller so the day boundary matches the rest of the bot (UTC),
// independent of the Postgres server timezone. Read-then-write: a user
// double-tapping `!daily` in the same second is harmless and rare enough not to
// warrant a transaction.
export async function claimDaily(
  serverId: string,
  userId: string,
  today: string,
  yesterday: string,
): Promise<DailyResult> {
  const sel = await pool.query<{
    last_claim_date: string | null;
    streak: number;
    best_streak: number;
    total_claims: number;
  }>(
    `SELECT to_char(last_claim_date, 'YYYY-MM-DD') AS last_claim_date,
            streak, best_streak, total_claims
       FROM panda.daily_checkins
      WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );

  const row = sel.rows[0];
  if (row && row.last_claim_date === today) {
    return {
      alreadyClaimed: true,
      streak: row.streak,
      bestStreak: row.best_streak,
      totalClaims: row.total_claims,
      continued: false,
    };
  }

  const continued = !!row && row.last_claim_date === yesterday;
  const streak = continued ? row!.streak + 1 : 1;
  const bestStreak = Math.max(row?.best_streak ?? 0, streak);
  const totalClaims = (row?.total_claims ?? 0) + 1;

  await pool.query(
    `INSERT INTO panda.daily_checkins
       (server_id, user_id, last_claim_date, streak, best_streak, total_claims, updated_at)
     VALUES ($1, $2, $3::date, $4, $5, $6, now())
     ON CONFLICT (server_id, user_id) DO UPDATE
       SET last_claim_date = EXCLUDED.last_claim_date,
           streak          = EXCLUDED.streak,
           best_streak     = EXCLUDED.best_streak,
           total_claims    = EXCLUDED.total_claims,
           updated_at      = now()`,
    [serverId, userId, today, streak, bestStreak, totalClaims],
  );

  return { alreadyClaimed: false, streak, bestStreak, totalClaims, continued };
}
