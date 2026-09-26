import { pool } from '../db/pool.js';

// Numbered moderation cases — see migrate.ts 'mod_cases table'.

export type CaseAction =
  | 'kick'
  | 'ban'
  | 'unban'
  | 'timeout'
  | 'untimeout'
  | 'warn'
  | 'purge'
  | 'lock'
  | 'unlock'
  | 'note';

export interface ModCase {
  serverId: string;
  caseNumber: number;
  action: CaseAction;
  targetId: string | null;
  targetChannelId: string | null;
  actorId: string;
  reason: string | null;
  extra: string | null;
  modlogChannelId: string | null;
  modlogMessageId: string | null;
  createdAt: Date;
}

interface Row {
  server_id: string;
  case_number: number;
  action: CaseAction;
  target_id: string | null;
  target_channel_id: string | null;
  actor_id: string;
  reason: string | null;
  extra: string | null;
  modlog_channel_id: string | null;
  modlog_message_id: string | null;
  created_at: Date;
}

const COLS = `server_id, case_number, action, target_id, target_channel_id, actor_id,
              reason, extra, modlog_channel_id, modlog_message_id, created_at`;

function rowToCase(row: Row): ModCase {
  return {
    serverId: row.server_id,
    caseNumber: row.case_number,
    action: row.action,
    targetId: row.target_id,
    targetChannelId: row.target_channel_id,
    actorId: row.actor_id,
    reason: row.reason,
    extra: row.extra,
    modlogChannelId: row.modlog_channel_id,
    modlogMessageId: row.modlog_message_id,
    createdAt: row.created_at,
  };
}

// Reasons are free text; keep a runaway paste out of the table and the embed.
export const MAX_REASON = 1_000;

export async function createCase(input: {
  serverId: string;
  action: CaseAction;
  targetId: string | null;
  targetChannelId?: string | null;
  actorId: string;
  reason?: string | null;
  extra?: string | null;
}): Promise<ModCase> {
  // The counter bump and the insert share one statement, so a case number
  // is never handed out without its row (or twice).
  const res = await pool.query<Row>(
    `WITH n AS (
       INSERT INTO panda.mod_case_counters (server_id, last_case)
       VALUES ($1, 1)
       ON CONFLICT (server_id) DO UPDATE SET last_case = panda.mod_case_counters.last_case + 1
       RETURNING last_case
     )
     INSERT INTO panda.mod_cases (server_id, case_number, action, target_id, target_channel_id,
                                  actor_id, reason, extra)
     SELECT $1, n.last_case, $2, $3, $4, $5, $6, $7 FROM n
     RETURNING ${COLS}`,
    [
      input.serverId,
      input.action,
      input.targetId,
      input.targetChannelId ?? null,
      input.actorId,
      input.reason ? input.reason.slice(0, MAX_REASON) : null,
      input.extra ?? null,
    ],
  );
  const row = res.rows[0];
  if (!row) throw new Error('case insert returned no row');
  return rowToCase(row);
}

export async function getCase(serverId: string, caseNumber: number): Promise<ModCase | null> {
  const res = await pool.query<Row>(
    `SELECT ${COLS} FROM panda.mod_cases WHERE server_id = $1 AND case_number = $2`,
    [serverId, caseNumber],
  );
  return res.rows[0] ? rowToCase(res.rows[0]) : null;
}

export async function setCaseReason(
  serverId: string,
  caseNumber: number,
  reason: string,
): Promise<ModCase | null> {
  const res = await pool.query<Row>(
    `UPDATE panda.mod_cases SET reason = $3, updated_at = now()
      WHERE server_id = $1 AND case_number = $2
      RETURNING ${COLS}`,
    [serverId, caseNumber, reason.slice(0, MAX_REASON)],
  );
  return res.rows[0] ? rowToCase(res.rows[0]) : null;
}

export async function setCaseModlogMessage(
  serverId: string,
  caseNumber: number,
  channelId: string,
  messageId: string,
): Promise<void> {
  await pool.query(
    `UPDATE panda.mod_cases SET modlog_channel_id = $3, modlog_message_id = $4
      WHERE server_id = $1 AND case_number = $2`,
    [serverId, caseNumber, channelId, messageId],
  );
}

export async function listCasesForUser(
  serverId: string,
  targetId: string,
  limit = 15,
): Promise<{ cases: ModCase[]; total: number }> {
  const cap = Math.min(Math.max(1, limit), 50);
  const [rows, count] = await Promise.all([
    pool.query<Row>(
      `SELECT ${COLS} FROM panda.mod_cases
        WHERE server_id = $1 AND target_id = $2
        ORDER BY created_at DESC, case_number DESC
        LIMIT $3`,
      [serverId, targetId, cap],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM panda.mod_cases WHERE server_id = $1 AND target_id = $2`,
      [serverId, targetId],
    ),
  ]);
  return { cases: rows.rows.map(rowToCase), total: Number(count.rows[0]?.count ?? 0) };
}
