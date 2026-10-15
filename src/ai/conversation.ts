// A moderator's recent exchanges with `!panda`, in Postgres
// (panda.ai_panda_turns), so a follow-up can refer back to what Panda just
// said: "ban #1", "time him out", "warn the top two".
//
// Scope: one conversation = one server + one channel + one moderator (the
// backend's senderId). Another moderator, another channel or another server
// never sees it.
//
// Shape follows the common chat-history design (LangChain's Postgres
// history, Vercel's chatbot template): append-only rows, one per exchange,
// read back newest-first by an index on the conversation key. Nothing is
// held in process memory, so it survives restarts and scales with the
// fleet. Retention is short on purpose — the window a follow-up makes sense
// in — and the prune deletes in small batches with SKIP LOCKED, so a backlog
// never holds a long lock and two bot instances never wait on each other.

import { pool } from '../db/pool.js';
import { log } from '../log.js';

/** How far back a follow-up can refer. */
const WINDOW_MINUTES = 30;
/** Turns handed to the planner. */
const TURNS = 4;
/** Rows are kept a little past the window, then deleted. */
const RETAIN_HOURS = 2;
const PRUNE_BATCH = 5_000;
/** Per prune run — the rest waits for the next run instead of hogging the DB. */
const PRUNE_MAX_BATCHES = 20;

const MAX_REQUEST = 1_000;
const MAX_ANSWER = 1_500;
const MAX_PEOPLE = 25;

export interface Turn {
  /** The moderator's own words. */
  request: string;
  /** What Panda said, written by Panda's code (quoted member text left out). */
  answer: string;
  /** People that answer named: exact id → how it named them ("#1 in your report: kai_77"). */
  people: Map<string, string>;
}

export interface ConversationKey {
  serverId: string;
  channelId: string;
  userId: string;
}

/** This moderator's turns in this channel from the last 30 minutes, oldest first. Never throws. */
export async function recallTurns(key: ConversationKey): Promise<Turn[]> {
  try {
    const res = await pool.query<{ request: string; answer: string; people: unknown }>(
      `SELECT request, answer, people
         FROM panda.ai_panda_turns
        WHERE server_id = $1 AND channel_id = $2 AND user_id = $3
          AND created_at > NOW() - make_interval(mins => $4)
        ORDER BY created_at DESC
        LIMIT $5`,
      [key.serverId, key.channelId, key.userId, WINDOW_MINUTES, TURNS],
    );
    return res.rows.reverse().map((r) => ({ request: r.request, answer: r.answer, people: readPeople(r.people) }));
  } catch (err) {
    // A follow-up without context just asks who they mean; never fail the command.
    log.warn({ err, serverId: key.serverId }, '!panda: recalling the conversation failed');
    return [];
  }
}

/** Keep one exchange. Never throws. */
export async function rememberTurn(
  key: ConversationKey & { userName: string },
  turn: Turn,
): Promise<void> {
  const people = [...turn.people].slice(0, MAX_PEOPLE).map(([id, how]) => ({ id, how: how.slice(0, 120) }));
  try {
    await pool.query(
      `INSERT INTO panda.ai_panda_turns (server_id, channel_id, user_id, user_name, request, answer, people)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        key.serverId,
        key.channelId,
        key.userId,
        key.userName.slice(0, 100),
        turn.request.slice(0, MAX_REQUEST),
        turn.answer.slice(0, MAX_ANSWER),
        JSON.stringify(people),
      ],
    );
  } catch (err) {
    log.warn({ err, serverId: key.serverId }, '!panda: saving the conversation failed');
  }
}

/**
 * Delete turns past retention, oldest first, in batches. Scheduler branch.
 * SKIP LOCKED: rows another instance is already deleting are passed over,
 * not waited on.
 */
export async function pruneTurns(): Promise<void> {
  let total = 0;
  for (let i = 0; i < PRUNE_MAX_BATCHES; i++) {
    const res = await pool.query(
      `DELETE FROM panda.ai_panda_turns
        WHERE id IN (
          SELECT id FROM panda.ai_panda_turns
           WHERE created_at < NOW() - make_interval(hours => $1)
           ORDER BY created_at
           LIMIT $2
           FOR UPDATE SKIP LOCKED
        )`,
      [RETAIN_HOURS, PRUNE_BATCH],
    );
    const n = res.rowCount ?? 0;
    total += n;
    if (n < PRUNE_BATCH) break;
  }
  if (total > 0) log.debug({ deleted: total }, '!panda: pruned old conversation turns');
}

function readPeople(raw: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!Array.isArray(raw)) return out;
  for (const p of raw.slice(0, MAX_PEOPLE)) {
    if (p && typeof p === 'object' && typeof (p as { id?: unknown }).id === 'string') {
      const { id, how } = p as { id: string; how?: unknown };
      out.set(id, typeof how === 'string' ? how : 'named earlier');
    }
  }
  return out;
}
