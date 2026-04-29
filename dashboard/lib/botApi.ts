// Server-side helpers that call the panda bot's HTTP API.
//
// The bot token never leaves the server boundary — every function here
// is meant to be invoked from a Server Component, route handler, or
// Server Action, never from a browser client. Keeping these in lib/
// (not in app/api/) means React can call them directly during render
// without a network hop.

import 'server-only';
import { config } from './config';

const HEADERS = (): Record<string, string> => ({
  'X-Bot-Token': config.botApi.token,
  'Content-Type': 'application/json',
  'User-Agent': 'panda-dashboard/0.1',
});

export interface BotChannel {
  id: string;
  name: string;
  type: 'text' | 'voice' | 'video' | 'tasks' | 'calendar' | string;
  description?: string;
  categoryId?: string | null;
}

export interface BotRole {
  id: string;
  name: string;
  color?: string;
}

// Fetch all channels visible to the bot in a server. Cached briefly to
// absorb the picker's chatter without hammering Echoed every render.
const channelCache = new Map<string, { at: number; channels: BotChannel[] }>();
const CHANNEL_TTL = 30_000;

export async function getServerChannels(serverId: string): Promise<BotChannel[]> {
  const cached = channelCache.get(serverId);
  if (cached && Date.now() - cached.at < CHANNEL_TTL) return cached.channels;

  const res = await fetch(`${config.botApi.base}/v1/bots/${serverId}/channels`, {
    method: 'GET',
    headers: HEADERS(),
    cache: 'no-store',
  });
  if (!res.ok) {
    // Empty list is a fine fallback — pages render with a hint instead
    // of erroring out the whole page when the bot's down.
    return [];
  }
  const body = (await res.json()) as BotChannel[] | { channels: BotChannel[] };
  const channels = Array.isArray(body) ? body : body.channels ?? [];
  channelCache.set(serverId, { at: Date.now(), channels });
  return channels;
}

// List the servers the bot has been invited into. Used by the
// dashboard's server picker so we only render cards for servers
// where panda actually lives — anything else is just noise the user
// can't act on (saving config would be a no-op since the bot won't
// see the changes until invited).
//
// Backend returns `{ servers: [{ id, name, icon, ... }], total }` —
// note `id` (not `serverId`). This matched a Python contract that
// shipped before the bot dashboard existed; we map to a normalized
// `serverId` field here so callers can match consistently against
// userinfo.owned_servers, which uses `id`.
export async function getBotServers(): Promise<{ serverId: string }[]> {
  const res = await fetch(`${config.botApi.base}/v1/bots/servers`, {
    method: 'GET',
    headers: HEADERS(),
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { servers?: Array<{ id?: string; serverId?: string }> };
  const raw = body.servers ?? [];
  return raw
    .map((s) => ({ serverId: s.id ?? s.serverId ?? '' }))
    .filter((s) => s.serverId !== '');
}

export async function getServerRoles(serverId: string): Promise<BotRole[]> {
  const res = await fetch(`${config.botApi.base}/v1/bots/${serverId}/roles`, {
    method: 'GET',
    headers: HEADERS(),
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const body = (await res.json()) as BotRole[] | { roles: BotRole[] };
  return Array.isArray(body) ? body : body.roles ?? [];
}
