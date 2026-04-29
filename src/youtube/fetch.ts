// YouTube notifications via the public Atom feed:
//   https://www.youtube.com/feeds/videos.xml?channel_id=UC...
//
// No API key required. The feed returns the channel's 15 most recent
// uploads in newest-first order. We parse with regex rather than
// pulling a full XML dependency — the schema is tiny and stable.

import { log } from '../log.js';

export interface YouTubeVideo {
  videoId: string;
  title: string;
  url: string;
  author: string;
  publishedAt: string;
}

const FEED_URL = (channelId: string): string =>
  `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;

// Pull a single tag value out of an XML fragment. Greedy regex is
// fine here because Atom's structure is well-defined and the fields
// we read don't contain nested tags of the same name.
function extract(fragment: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const m = re.exec(fragment);
  return m?.[1]?.trim() ?? null;
}

// `<link rel="alternate" href="..."/>` — needs an attribute extract.
function extractLink(fragment: string): string | null {
  const m = /<link[^>]*\srel="alternate"[^>]*\shref="([^"]+)"/.exec(fragment);
  return m?.[1] ?? null;
}

const ENTRY_RE = /<entry>([\s\S]*?)<\/entry>/g;
const VIDEO_ID_RE = /<yt:videoId>([^<]+)<\/yt:videoId>/;

const USER_AGENT = 'panda-bot/0.1 (+echoed-bot)';

export async function fetchLatestVideos(channelId: string): Promise<YouTubeVideo[]> {
  let res: Response;
  try {
    res = await fetch(FEED_URL(channelId), { headers: { 'User-Agent': USER_AGENT } });
  } catch (err) {
    log.warn({ err, channelId }, 'YouTube fetch threw');
    return [];
  }
  if (!res.ok) {
    log.warn({ status: res.status, channelId }, 'YouTube fetch non-ok');
    return [];
  }
  const xml = await res.text();
  const out: YouTubeVideo[] = [];

  ENTRY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ENTRY_RE.exec(xml)) !== null) {
    const entry = m[1];
    if (!entry) continue;
    const idMatch = VIDEO_ID_RE.exec(entry);
    const videoId = idMatch?.[1];
    if (!videoId) continue;
    const title = extract(entry, 'title') ?? '';
    const author = extract(entry, 'name') ?? '';
    const publishedAt = extract(entry, 'published') ?? '';
    const link = extractLink(entry) ?? `https://www.youtube.com/watch?v=${videoId}`;
    out.push({ videoId, title, url: link, author, publishedAt });
  }
  return out;
}
