import type { EchoedClient } from '../client/echoedClient.js';
import { listAll, recordLastPost } from './store.js';
import { fetchNewPosts } from './fetch.js';
import { log } from '../log.js';

const POSTS_PER_TICK_MAX = 5; // never spam more than this from a single sub per tick

// Group subscriptions by `subreddit` so we hit Reddit once per sub per
// tick rather than once per channel that follows it.
function groupBySubreddit<T extends { subreddit: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.subreddit.toLowerCase();
    const arr = out.get(key) ?? [];
    arr.push(row);
    out.set(key, arr);
  }
  return out;
}

export async function redditTick(api: EchoedClient): Promise<void> {
  const subs = await listAll();
  if (subs.length === 0) return;

  const byKind = groupBySubreddit(subs);
  for (const [subreddit, group] of byKind) {
    let posts;
    try {
      posts = await fetchNewPosts(subreddit, 25);
    } catch (err) {
      log.warn({ err, subreddit }, 'Reddit tick: fetch failed');
      continue;
    }
    if (posts.length === 0) continue;

    // Reddit's `/new` returns newest-first. We walk newest→oldest and
    // stop at last_post_id; everything before that point is new.
    for (const sub of group) {
      const cutoff = sub.lastPostId;
      const newPosts: typeof posts = [];
      for (const p of posts) {
        if (p.id === cutoff) break;
        newPosts.push(p);
      }
      if (newPosts.length === 0) continue;

      // Post in chronological order so the channel reads top→bottom
      // as "oldest first" within the burst.
      const toPost = newPosts.slice(0, POSTS_PER_TICK_MAX).reverse();
      let lastSent: string | null = null;
      for (const p of toPost) {
        const nsfwTag = p.isNsfw ? ' 🔞' : '';
        const body = `📰 **r/${subreddit}** — ${p.title}${nsfwTag}\nby u/${p.author}\n${p.commentsUrl}`;
        try {
          await api.sendMessage({
            serverId: sub.serverId,
            channelId: sub.channelId,
            content: body,
          });
          lastSent = p.id;
        } catch (err) {
          log.warn(
            { err, channelId: sub.channelId, subreddit },
            'Reddit notification send failed',
          );
        }
      }
      // Even if some sends failed, the FIRST element of `newPosts`
      // is the newest — record that so we don't re-fire on next tick.
      // If we used `lastSent` we'd risk a small post duplication on
      // partial failure (acceptable trade for not flooding on
      // recovery).
      const newest = newPosts[0]?.id ?? lastSent;
      if (newest) {
        await recordLastPost(sub.id, newest).catch((err: unknown) => {
          log.warn({ err, subId: sub.id }, 'recordLastPost failed');
        });
      }
    }
  }
}
