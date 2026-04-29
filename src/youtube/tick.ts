import type { EchoedClient } from '../client/echoedClient.js';
import { listAll, recordLastVideo } from './store.js';
import { fetchLatestVideos } from './fetch.js';
import { log } from '../log.js';

const POSTS_PER_TICK_MAX = 3;

// Group subscriptions by youtube_channel_id so multiple followers
// share one feed fetch per tick.
function groupByChannel<T extends { youtubeChannelId: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const arr = out.get(row.youtubeChannelId) ?? [];
    arr.push(row);
    out.set(row.youtubeChannelId, arr);
  }
  return out;
}

export async function youtubeTick(api: EchoedClient): Promise<void> {
  const subs = await listAll();
  if (subs.length === 0) return;

  const byChannel = groupByChannel(subs);
  for (const [ytChannelId, group] of byChannel) {
    let videos;
    try {
      videos = await fetchLatestVideos(ytChannelId);
    } catch (err) {
      log.warn({ err, ytChannelId }, 'YouTube tick: fetch failed');
      continue;
    }
    if (videos.length === 0) continue;

    for (const sub of group) {
      const cutoff = sub.lastVideoId;
      const newVideos: typeof videos = [];
      for (const v of videos) {
        if (v.videoId === cutoff) break;
        newVideos.push(v);
      }
      if (newVideos.length === 0) continue;

      // Send oldest-first within the burst so the channel reads
      // top→bottom in upload order.
      const toPost = newVideos.slice(0, POSTS_PER_TICK_MAX).reverse();
      for (const v of toPost) {
        const body = `📺 **${v.author}** uploaded: ${v.title}\n${v.url}`;
        try {
          await api.sendMessage({
            serverId: sub.serverId,
            channelId: sub.channelId,
            content: body,
          });
        } catch (err) {
          log.warn({ err, channelId: sub.channelId, ytChannelId }, 'YouTube notification send failed');
        }
      }

      const newest = newVideos[0]?.videoId;
      if (newest) {
        await recordLastVideo(sub.id, newest).catch((err: unknown) => {
          log.warn({ err, subId: sub.id }, 'recordLastVideo failed');
        });
      }
    }
  }
}
