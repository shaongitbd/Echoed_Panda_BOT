import { config } from '../config.js';
import { log } from '../log.js';

// App access token via client-credentials flow. Twitch issues these
// for ~60 days; we cache in-process and lazily refresh when they're
// within 5 minutes of expiry. Per-process is fine because the bot is
// single-instance (unlike the old Echoed socket server). If we go
// multi-instance later, swap to Redis with the same TTL math.

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let cached: CachedToken | null = null;
let inflight: Promise<CachedToken> | null = null;
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
}

async function fetchToken(): Promise<CachedToken> {
  if (!config.twitchClientId || !config.twitchClientSecret) {
    throw new Error('Twitch not configured');
  }
  const body = new URLSearchParams({
    client_id: config.twitchClientId,
    client_secret: config.twitchClientSecret,
    grant_type: 'client_credentials',
  });

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`Twitch token request failed: ${res.status}`);
  }
  const json = (await res.json()) as TokenResponse;
  if (!json.access_token || typeof json.expires_in !== 'number') {
    throw new Error('Twitch token response missing fields');
  }
  return {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}

export async function getTwitchToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + REFRESH_BUFFER_MS) {
    return cached.accessToken;
  }
  // De-dupe concurrent refreshes — a single tick can fan out a dozen
  // streams calls. Without coalescing we'd request a fresh token from
  // every one and likely get rate-limited by Twitch.
  if (!inflight) {
    inflight = fetchToken()
      .then((t) => {
        cached = t;
        log.debug({ expiresIn: Math.round((t.expiresAt - Date.now()) / 1000) }, 'Twitch token refreshed');
        return t;
      })
      .finally(() => {
        inflight = null;
      });
  }
  const token = await inflight;
  return token.accessToken;
}
