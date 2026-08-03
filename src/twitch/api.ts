import { config } from '../config.js';
import { getTwitchToken, invalidateTwitchToken } from './auth.js';
import { log } from '../log.js';

export interface TwitchStream {
  id: string;
  userLogin: string;
  userName: string;
  gameName: string;
  title: string;
  viewerCount: number;
  startedAt: string;
  thumbnailUrl: string;
}

interface RawStream {
  id?: string;
  user_login?: string;
  user_name?: string;
  game_name?: string;
  title?: string;
  viewer_count?: number;
  started_at?: string;
  thumbnail_url?: string;
}

interface StreamsResponse {
  data?: RawStream[];
  pagination?: { cursor?: string };
}

// What a poll actually managed to establish. `complete` is false when any
// batch failed, which must NOT be read as "those streamers are offline" —
// doing so both announces a re-run when they come back into view and
// re-fires for everyone once the next poll succeeds.
export interface LiveStreamResult {
  live: Map<string, TwitchStream>;
  complete: boolean;
}

const HELIX_BASE = 'https://api.twitch.tv/helix';
const BATCH_SIZE = 100; // Helix streams accepts up to 100 logins per call
// Page size must match the batch size. It defaults to 20, so asking about
// 100 logins returned at most the 20 most-watched — every quieter streamer
// in the batch looked permanently offline, and drifting in and out of that
// top 20 produced repeat announcements.
const PAGE_SIZE = 100;

// Returns a map of `user_login` (lowercase) → live stream info. Logins
// not present in the response are offline. Helix tolerates batches up
// to 100; we chunk if more.
export async function getLiveStreams(logins: string[]): Promise<LiveStreamResult> {
  const out = new Map<string, TwitchStream>();
  if (logins.length === 0) return { live: out, complete: true };
  let complete = true;

  const token = await getTwitchToken();
  const dedup = Array.from(new Set(logins.map((l) => l.toLowerCase())));

  for (let i = 0; i < dedup.length; i += BATCH_SIZE) {
    const batch = dedup.slice(i, i + BATCH_SIZE);
    const params = new URLSearchParams();
    for (const login of batch) params.append('user_login', login);
    params.set('first', String(PAGE_SIZE));

    let res: Response;
    try {
      res = await fetch(`${HELIX_BASE}/streams?${params.toString()}`, {
        headers: {
          'Client-Id': config.twitchClientId,
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (err) {
      log.warn({ err, batchSize: batch.length }, 'Twitch helix fetch threw');
      complete = false;
      continue;
    }
    if (!res.ok) {
      // An expired or revoked token can only be noticed here; the cache
      // otherwise holds it until its own expiry, which is measured in
      // weeks, and every poll in between silently returns nothing.
      if (res.status === 401 || res.status === 403) invalidateTwitchToken();
      log.warn({ status: res.status }, 'Twitch helix non-ok');
      complete = false;
      continue;
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch (err) {
      log.warn({ err }, 'Twitch helix JSON parse failed');
      complete = false;
      continue;
    }
    const data = (json as StreamsResponse).data ?? [];
    for (const s of data) {
      if (!s.id || !s.user_login) continue;
      out.set(s.user_login.toLowerCase(), {
        id: s.id,
        userLogin: s.user_login.toLowerCase(),
        userName: s.user_name ?? s.user_login,
        gameName: s.game_name ?? '',
        title: s.title ?? '',
        viewerCount: s.viewer_count ?? 0,
        startedAt: s.started_at ?? '',
        // Replace the {width}x{height} template with a sensible default.
        thumbnailUrl: (s.thumbnail_url ?? '').replace('{width}', '1280').replace('{height}', '720'),
      });
    }
  }
  return { live: out, complete };
}
