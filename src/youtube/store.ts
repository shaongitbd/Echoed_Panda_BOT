import { pool } from '../db/pool.js';

export interface YouTubeSub {
  id: number;
  serverId: string;
  channelId: string;
  youtubeChannelId: string;
  lastVideoId: string | null;
  createdBy: string;
  createdAt: Date;
}

interface Row {
  id: string;
  server_id: string;
  channel_id: string;
  youtube_channel_id: string;
  last_video_id: string | null;
  created_by: string;
  created_at: Date;
}

function rowToSub(row: Row): YouTubeSub {
  return {
    id: Number(row.id),
    serverId: row.server_id,
    channelId: row.channel_id,
    youtubeChannelId: row.youtube_channel_id,
    lastVideoId: row.last_video_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function addSub(input: {
  serverId: string;
  channelId: string;
  youtubeChannelId: string;
  createdBy: string;
}): Promise<YouTubeSub> {
  const res = await pool.query<Row>(
    `INSERT INTO panda.youtube_subs (server_id, channel_id, youtube_channel_id, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (server_id, channel_id, youtube_channel_id) DO UPDATE
       SET created_by = EXCLUDED.created_by
     RETURNING id, server_id, channel_id, youtube_channel_id, last_video_id, created_by, created_at`,
    [input.serverId, input.channelId, input.youtubeChannelId, input.createdBy],
  );
  const row = res.rows[0];
  if (!row) throw new Error('youtube_subs upsert returned no row');
  return rowToSub(row);
}

export async function removeSub(
  serverId: string,
  channelId: string,
  youtubeChannelId: string,
): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM panda.youtube_subs
       WHERE server_id = $1 AND channel_id = $2 AND youtube_channel_id = $3`,
    [serverId, channelId, youtubeChannelId],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function listForServer(serverId: string): Promise<YouTubeSub[]> {
  const res = await pool.query<Row>(
    `SELECT id, server_id, channel_id, youtube_channel_id, last_video_id, created_by, created_at
       FROM panda.youtube_subs
      WHERE server_id = $1
      ORDER BY youtube_channel_id ASC`,
    [serverId],
  );
  return res.rows.map(rowToSub);
}

export async function listAll(): Promise<YouTubeSub[]> {
  const res = await pool.query<Row>(
    `SELECT id, server_id, channel_id, youtube_channel_id, last_video_id, created_by, created_at
       FROM panda.youtube_subs`,
  );
  return res.rows.map(rowToSub);
}

export async function recordLastVideo(id: number, videoId: string): Promise<void> {
  await pool.query(
    `UPDATE panda.youtube_subs SET last_video_id = $2 WHERE id = $1`,
    [id, videoId],
  );
}
