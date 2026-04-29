import { pool } from '../db/pool.js';

export interface RedditSub {
  id: number;
  serverId: string;
  channelId: string;
  subreddit: string;
  lastPostId: string | null;
  createdBy: string;
  createdAt: Date;
}

interface Row {
  id: string;
  server_id: string;
  channel_id: string;
  subreddit: string;
  last_post_id: string | null;
  created_by: string;
  created_at: Date;
}

function rowToSub(row: Row): RedditSub {
  return {
    id: Number(row.id),
    serverId: row.server_id,
    channelId: row.channel_id,
    subreddit: row.subreddit,
    lastPostId: row.last_post_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

// Add a subscription, idempotent on (server, channel, subreddit). The
// unique index handles dedup; the upsert just refreshes created_by /
// created_at on a re-add.
export async function addSub(input: {
  serverId: string;
  channelId: string;
  subreddit: string;
  createdBy: string;
}): Promise<RedditSub> {
  const sub = input.subreddit.toLowerCase();
  const res = await pool.query<Row>(
    `INSERT INTO panda.reddit_subs (server_id, channel_id, subreddit, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (server_id, channel_id, subreddit) DO UPDATE
       SET created_by = EXCLUDED.created_by
     RETURNING id, server_id, channel_id, subreddit, last_post_id, created_by, created_at`,
    [input.serverId, input.channelId, sub, input.createdBy],
  );
  const row = res.rows[0];
  if (!row) throw new Error('reddit_subs upsert returned no row');
  return rowToSub(row);
}

export async function removeSub(
  serverId: string,
  channelId: string,
  subreddit: string,
): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM panda.reddit_subs
       WHERE server_id = $1 AND channel_id = $2 AND subreddit = $3`,
    [serverId, channelId, subreddit.toLowerCase()],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function listForServer(serverId: string): Promise<RedditSub[]> {
  const res = await pool.query<Row>(
    `SELECT id, server_id, channel_id, subreddit, last_post_id, created_by, created_at
       FROM panda.reddit_subs
      WHERE server_id = $1
      ORDER BY subreddit ASC`,
    [serverId],
  );
  return res.rows.map(rowToSub);
}

export async function listAll(): Promise<RedditSub[]> {
  const res = await pool.query<Row>(
    `SELECT id, server_id, channel_id, subreddit, last_post_id, created_by, created_at
       FROM panda.reddit_subs`,
  );
  return res.rows.map(rowToSub);
}

export async function recordLastPost(id: number, postId: string): Promise<void> {
  await pool.query(
    `UPDATE panda.reddit_subs SET last_post_id = $2 WHERE id = $1`,
    [id, postId],
  );
}
