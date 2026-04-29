import { pool } from '../db';

// Combined queries for the three notification integrations. They
// share the same shape — sub list + add + remove — so colocating
// them keeps the import surface tiny on the page side.

// ─── Reddit ────────────────────────────────────────────────────────────

export interface RedditSub {
  id: number;
  channelId: string;
  subreddit: string;
  lastPostId: string | null;
}

export async function listRedditSubs(serverId: string): Promise<RedditSub[]> {
  const res = await pool.query<{
    id: string;
    channel_id: string;
    subreddit: string;
    last_post_id: string | null;
  }>(
    `SELECT id, channel_id, subreddit, last_post_id
       FROM reddit_subs
      WHERE server_id = $1
      ORDER BY subreddit ASC`,
    [serverId],
  );
  return res.rows.map((r) => ({
    id: Number(r.id),
    channelId: r.channel_id,
    subreddit: r.subreddit,
    lastPostId: r.last_post_id,
  }));
}

export async function addRedditSub(input: {
  serverId: string;
  channelId: string;
  subreddit: string;
  createdBy: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO reddit_subs (server_id, channel_id, subreddit, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (server_id, channel_id, subreddit) DO UPDATE
       SET created_by = EXCLUDED.created_by`,
    [input.serverId, input.channelId, input.subreddit.toLowerCase(), input.createdBy],
  );
}

export async function removeRedditSub(serverId: string, id: number): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM reddit_subs WHERE server_id = $1 AND id = $2`,
    [serverId, id],
  );
  return (res.rowCount ?? 0) > 0;
}

// ─── Twitch ────────────────────────────────────────────────────────────

export interface TwitchSub {
  id: number;
  channelId: string;
  twitchLogin: string;
  lastCheckLive: boolean;
}

export async function listTwitchSubs(serverId: string): Promise<TwitchSub[]> {
  const res = await pool.query<{
    id: string;
    channel_id: string;
    twitch_login: string;
    last_check_live: boolean;
  }>(
    `SELECT id, channel_id, twitch_login, last_check_live
       FROM twitch_subs
      WHERE server_id = $1
      ORDER BY twitch_login ASC`,
    [serverId],
  );
  return res.rows.map((r) => ({
    id: Number(r.id),
    channelId: r.channel_id,
    twitchLogin: r.twitch_login,
    lastCheckLive: r.last_check_live,
  }));
}

export async function addTwitchSub(input: {
  serverId: string;
  channelId: string;
  twitchLogin: string;
  createdBy: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO twitch_subs (server_id, channel_id, twitch_login, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (server_id, channel_id, twitch_login) DO UPDATE
       SET created_by = EXCLUDED.created_by`,
    [input.serverId, input.channelId, input.twitchLogin.toLowerCase(), input.createdBy],
  );
}

export async function removeTwitchSub(serverId: string, id: number): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM twitch_subs WHERE server_id = $1 AND id = $2`,
    [serverId, id],
  );
  return (res.rowCount ?? 0) > 0;
}

// ─── YouTube ───────────────────────────────────────────────────────────

export interface YouTubeSub {
  id: number;
  channelId: string;
  youtubeChannelId: string;
  lastVideoId: string | null;
}

export async function listYouTubeSubs(serverId: string): Promise<YouTubeSub[]> {
  const res = await pool.query<{
    id: string;
    channel_id: string;
    youtube_channel_id: string;
    last_video_id: string | null;
  }>(
    `SELECT id, channel_id, youtube_channel_id, last_video_id
       FROM youtube_subs
      WHERE server_id = $1
      ORDER BY youtube_channel_id ASC`,
    [serverId],
  );
  return res.rows.map((r) => ({
    id: Number(r.id),
    channelId: r.channel_id,
    youtubeChannelId: r.youtube_channel_id,
    lastVideoId: r.last_video_id,
  }));
}

export async function addYouTubeSub(input: {
  serverId: string;
  channelId: string;
  youtubeChannelId: string;
  createdBy: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO youtube_subs (server_id, channel_id, youtube_channel_id, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (server_id, channel_id, youtube_channel_id) DO UPDATE
       SET created_by = EXCLUDED.created_by`,
    [input.serverId, input.channelId, input.youtubeChannelId, input.createdBy],
  );
}

export async function removeYouTubeSub(serverId: string, id: number): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM youtube_subs WHERE server_id = $1 AND id = $2`,
    [serverId, id],
  );
  return (res.rowCount ?? 0) > 0;
}
