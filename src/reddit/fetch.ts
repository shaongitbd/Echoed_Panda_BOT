// Lightweight Reddit fetcher. Uses the public JSON endpoint
// (https://www.reddit.com/r/<sub>/new.json) which doesn't require an
// API key for read-only consumption.
//
// We pull "new" posts (not "hot") since we want freshness — a sub
// might add 50 posts/hour and we want each one once.

import { log } from '../log.js';

export interface RedditPost {
  id: string;       // Reddit's `t3_xxx` ID with the `t3_` prefix stripped
  title: string;
  url: string;       // canonical reddit.com link
  permalink: string; // `/r/sub/comments/...` path
  author: string;
  isNsfw: boolean;
  // For self-posts the URL points to the post itself; for link posts
  // the URL is the external link. The bot prefers the comments link
  // for cleaner unfurling.
  commentsUrl: string;
}

interface RawListing {
  data?: { children?: Array<{ data?: RawPost }> };
}

interface RawPost {
  id?: string;
  title?: string;
  url?: string;
  permalink?: string;
  author?: string;
  over_18?: boolean;
  is_self?: boolean;
}

const USER_AGENT = 'panda-bot/0.1 (+echoed-bot)';

export async function fetchNewPosts(subreddit: string, limit = 10): Promise<RedditPost[]> {
  const cap = Math.min(Math.max(1, limit), 100);
  const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/new.json?limit=${cap}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  } catch (err) {
    log.warn({ err, subreddit }, 'Reddit fetch threw');
    return [];
  }
  if (!res.ok) {
    log.warn({ status: res.status, subreddit }, 'Reddit fetch non-ok');
    return [];
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    log.warn({ err, subreddit }, 'Reddit JSON parse failed');
    return [];
  }

  const listing = json as RawListing;
  const children = listing.data?.children ?? [];
  const posts: RedditPost[] = [];
  for (const c of children) {
    const d = c.data;
    if (!d?.id || !d.title || !d.permalink) continue;
    posts.push({
      id: d.id,
      title: d.title,
      url: d.url ?? `https://www.reddit.com${d.permalink}`,
      permalink: d.permalink,
      author: d.author ?? '[deleted]',
      isNsfw: Boolean(d.over_18),
      commentsUrl: `https://www.reddit.com${d.permalink}`,
    });
  }
  return posts;
}
