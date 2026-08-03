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
// How far back a previous claim can be and still continue the streak.
//
// The day boundary is UTC, but members are not. For someone at UTC-8 the
// date rolls at 16:00 local, so checking in one morning and the next
// evening lands on D and D+2 — an exact "yesterday" test called that a
// broken streak and reset it to 1. A guild spans many timezones so there
// is no single correct offset to apply, and no real timezone is more than
// a day out, which makes one day of slack the right shape: it can't
// manufacture a streak nobody earned, and it stops zeroing real ones.
const STREAK_GRACE_DAYS = 2;

export async function claimDaily(
  serverId: string,
  userId: string,
  today: string,
  _yesterday: string,
): Promise<DailyResult> {
  // One statement, so two `!daily` calls racing in different channels
  // can't both award. The old read-then-write let that happen, and the
  // command cooldown didn't stop it — that was keyed on the channel.
  //
  // The WHERE on DO UPDATE means a same-day repeat matches nothing and
  // returns no rows, which is how the already-claimed case is detected.
  const upsert = await pool.query<{
    streak: number;
    best_streak: number;
    total_claims: number;
    continued: boolean;
  }>(
    `INSERT INTO panda.daily_checkins
       (server_id, user_id, last_claim_date, streak, best_streak, total_claims, updated_at)
     VALUES ($1, $2, $3::date, 1, 1, 1, now())
     ON CONFLICT (server_id, user_id) DO UPDATE
       SET last_claim_date = EXCLUDED.last_claim_date,
           streak = CASE
             WHEN panda.daily_checkins.last_claim_date
                  >= EXCLUDED.last_claim_date - $4::int
             THEN panda.daily_checkins.streak + 1
             ELSE 1
           END,
           best_streak = GREATEST(
             panda.daily_checkins.best_streak,
             CASE
               WHEN panda.daily_checkins.last_claim_date
                    >= EXCLUDED.last_claim_date - $4::int
               THEN panda.daily_checkins.streak + 1
               ELSE 1
             END
           ),
           total_claims = panda.daily_checkins.total_claims + 1,
           updated_at = now()
       WHERE panda.daily_checkins.last_claim_date < EXCLUDED.last_claim_date
     RETURNING streak, best_streak, total_claims, streak > 1 AS continued`,
    [serverId, userId, today, STREAK_GRACE_DAYS],
  );

  const claimed = upsert.rows[0];
  if (claimed) {
    return {
      alreadyClaimed: false,
      streak: claimed.streak,
      bestStreak: claimed.best_streak,
      totalClaims: claimed.total_claims,
      continued: claimed.continued,
    };
  }

  // No row updated — already checked in today. Report current standing.
  const sel = await pool.query<{ streak: number; best_streak: number; total_claims: number }>(
    `SELECT streak, best_streak, total_claims
       FROM panda.daily_checkins
      WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  const row = sel.rows[0];
  return {
    alreadyClaimed: true,
    streak: row?.streak ?? 0,
    bestStreak: row?.best_streak ?? 0,
    totalClaims: row?.total_claims ?? 0,
    continued: false,
  };
}
