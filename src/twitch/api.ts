import { config } from '../config.js';
import { getTwitchToken } from './auth.js';
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
}

const HELIX_BASE = 'https://api.twitch.tv/helix';
const BATCH_SIZE = 100; // Helix streams accepts up to 100 logins per call

// Returns a map of `user_login` (lowercase) → live stream info. Logins
// not present in the response are offline. Helix tolerates batches up
// to 100; we chunk if more.
export async function getLiveStreams(logins: string[]): Promise<Map<string, TwitchStream>> {
  const out = new Map<string, TwitchStream>();
  if (logins.length === 0) return out;

  const token = await getTwitchToken();
  const dedup = Array.from(new Set(logins.map((l) => l.toLowerCase())));

  for (let i = 0; i < dedup.length; i += BATCH_SIZE) {
    const batch = dedup.slice(i, i + BATCH_SIZE);
    const params = new URLSearchParams();
    for (const login of batch) params.append('user_login', login);

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
      continue;
    }
    if (!res.ok) {
      log.warn({ status: res.status }, 'Twitch helix non-ok');
      continue;
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch (err) {
      log.warn({ err }, 'Twitch helix JSON parse failed');
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
  return out;
}
