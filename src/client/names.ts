// Display-name resolution for users, roles and channels.
//
// WHY THIS EXISTS
// ---------------
// The send endpoint turns `<@userId>` into a rendered mention only when the
// token appears in a message's `content`. Embed titles, descriptions, field
// names and field values are stored and delivered verbatim — nothing in
// them is resolved. So a mention token written into an embed reaches the
// reader as a raw ID.
//
// Anything we put in an embed therefore has to be resolved to a name up
// front. That is what this module is for. Where we actually want to *ping*
// someone, the reference belongs in `content` instead — that is the only
// construction that both renders a name and notifies.
//
// The user cache is filled for free from inbound messages: every message
// carries its author's display name, and the people who show up in
// leaderboards, starboards and warn lists are by definition people who have
// been talking. Lookups are the fallback, not the common path.

import type { EchoedClient } from './echoedClient.js';
import { mapLimit } from '../util/concurrency.js';
import { log } from '../log.js';

// Names change rarely, and a slightly stale one is much better than a
// lookup storm. Roles and channels move even less than nicknames.
const USER_TTL_MS = 30 * 60 * 1000;
const GUILD_TTL_MS = 10 * 60 * 1000;

// Hard ceilings so a busy fleet can't grow these without bound. Eviction
// is oldest-first, which for these access patterns is close enough to LRU.
const MAX_USERS = 20_000;
const MAX_GUILD_ENTRIES = 2_000;

// Never leak a raw ID into user-visible text — it is exactly the bug this
// module exists to prevent.
export const UNKNOWN_USER = 'Unknown user';
export const UNKNOWN_ROLE = 'unknown-role';
export const UNKNOWN_CHANNEL = 'unknown-channel';

// Profile lookups are the fallback path but can still arrive in bursts (a
// leaderboard of ten strangers). Keep the fan-out flat.
const LOOKUP_CONCURRENCY = 2;

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const users = new Map<string, Entry<string>>();
const guildRoles = new Map<string, Entry<Map<string, string>>>();
const guildChannels = new Map<string, Entry<Map<string, string>>>();

function evictOldest<T>(map: Map<string, Entry<T>>, max: number): void {
  if (map.size <= max) return;
  const excess = map.size - max;
  let i = 0;
  for (const key of map.keys()) {
    map.delete(key);
    if (++i >= excess) break;
  }
}

function get<T>(map: Map<string, Entry<T>>, key: string): T | null {
  const hit = map.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    map.delete(key);
    return null;
  }
  return hit.value;
}

function put<T>(map: Map<string, Entry<T>>, key: string, value: T, ttl: number, max: number): void {
  map.set(key, { value, expiresAt: Date.now() + ttl });
  evictOldest(map, max);
}

// ─── Users ───────────────────────────────────────────────────────────────

const userKey = (serverId: string, userId: string): string => `${serverId}:${userId}`;

// Free cache fill from an inbound message. Cheap enough to call on every
// message on the hot path.
export function rememberUser(serverId: string, userId: string, name: string | undefined): void {
  if (!serverId || !userId || !name) return;
  put(users, userKey(serverId, userId), name, USER_TTL_MS, MAX_USERS);
}

// Resolve one user's display name. Falls back to a neutral placeholder
// rather than the raw ID.
export async function resolveUser(
  api: EchoedClient,
  serverId: string,
  userId: string,
): Promise<string> {
  const cached = get(users, userKey(serverId, userId));
  if (cached) return cached;

  try {
    const profile = await api.getMemberProfile(serverId, userId);
    const name = profile.displayName || profile.username;
    if (name) {
      put(users, userKey(serverId, userId), name, USER_TTL_MS, MAX_USERS);
      return name;
    }
  } catch (err) {
    log.debug({ err, serverId, userId }, 'Name lookup failed');
  }
  return UNKNOWN_USER;
}

// Resolve many at once. Cache hits cost nothing; only the misses go out,
// and they go out with a bounded fan-out.
export async function resolveUsers(
  api: EchoedClient,
  serverId: string,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const misses: string[] = [];

  for (const id of userIds) {
    if (out.has(id)) continue;
    const cached = get(users, userKey(serverId, id));
    if (cached) out.set(id, cached);
    else if (!misses.includes(id)) misses.push(id);
  }

  if (misses.length > 0) {
    const names = await mapLimit(misses, LOOKUP_CONCURRENCY, (id) =>
      resolveUser(api, serverId, id),
    );
    misses.forEach((id, i) => out.set(id, names[i] ?? UNKNOWN_USER));
  }

  return out;
}

// ─── Roles and channels ──────────────────────────────────────────────────

async function roleMap(api: EchoedClient, serverId: string): Promise<Map<string, string>> {
  const cached = get(guildRoles, serverId);
  if (cached) return cached;

  const map = new Map<string, string>();
  try {
    for (const role of await api.listServerRoles(serverId)) {
      if (role?.id && role.name) map.set(role.id, role.name);
    }
  } catch (err) {
    log.debug({ err, serverId }, 'Role list lookup failed');
  }
  put(guildRoles, serverId, map, GUILD_TTL_MS, MAX_GUILD_ENTRIES);
  return map;
}

async function channelMap(api: EchoedClient, serverId: string): Promise<Map<string, string>> {
  const cached = get(guildChannels, serverId);
  if (cached) return cached;

  const map = new Map<string, string>();
  try {
    for (const ch of await api.listChannels(serverId)) {
      if (ch?.id && ch.name) map.set(ch.id, ch.name);
    }
  } catch (err) {
    log.debug({ err, serverId }, 'Channel list lookup failed');
  }
  put(guildChannels, serverId, map, GUILD_TTL_MS, MAX_GUILD_ENTRIES);
  return map;
}

// Render a role for display inside an embed, e.g. `@Moderator`.
export async function resolveRole(
  api: EchoedClient,
  serverId: string,
  roleId: string,
): Promise<string> {
  const name = (await roleMap(api, serverId)).get(roleId);
  return `@${name ?? UNKNOWN_ROLE}`;
}

// Render a channel for display inside an embed, e.g. `#general`.
export async function resolveChannel(
  api: EchoedClient,
  serverId: string,
  channelId: string,
): Promise<string> {
  const name = (await channelMap(api, serverId)).get(channelId);
  return `#${name ?? UNKNOWN_CHANNEL}`;
}

export async function resolveRoles(
  api: EchoedClient,
  serverId: string,
  roleIds: readonly string[],
): Promise<Map<string, string>> {
  const map = await roleMap(api, serverId);
  return new Map(roleIds.map((id) => [id, `@${map.get(id) ?? UNKNOWN_ROLE}`]));
}

export async function resolveChannels(
  api: EchoedClient,
  serverId: string,
  channelIds: readonly string[],
): Promise<Map<string, string>> {
  const map = await channelMap(api, serverId);
  return new Map(channelIds.map((id) => [id, `#${map.get(id) ?? UNKNOWN_CHANNEL}`]));
}

// Whether a channel belongs to this server. Used to stop config commands
// persisting an ID copied from somewhere else.
export async function channelBelongsTo(
  api: EchoedClient,
  serverId: string,
  channelId: string,
): Promise<boolean> {
  return (await channelMap(api, serverId)).has(channelId);
}

export async function roleBelongsTo(
  api: EchoedClient,
  serverId: string,
  roleId: string,
): Promise<boolean> {
  return (await roleMap(api, serverId)).has(roleId);
}

// ─── Server ──────────────────────────────────────────────────────────────

const serverNames = new Map<string, Entry<string>>();

// A server's own name. Member-join payloads don't carry it, so anything
// greeting a new member has to look it up — otherwise a `{server}`
// placeholder renders as a generic fallback.
export async function resolveServerName(
  api: EchoedClient,
  serverId: string,
): Promise<string | null> {
  const cached = get(serverNames, serverId);
  if (cached) return cached;
  try {
    const info = await api.getServerInfo(serverId);
    if (info?.name) {
      put(serverNames, serverId, info.name, GUILD_TTL_MS, MAX_GUILD_ENTRIES);
      return info.name;
    }
  } catch (err) {
    log.debug({ err, serverId }, 'Server name lookup failed');
  }
  return null;
}

// Called after we change a server's roles or channels ourselves, so the
// next read doesn't serve a list we know is stale.
export function invalidateGuild(serverId: string): void {
  guildRoles.delete(serverId);
  guildChannels.delete(serverId);
}

// Replace every `<@id>` / `<@&id>` / `<#id>` token in `text` with a
// rendered name. For text that is going into an embed, where the platform
// would otherwise leave the raw token visible.
const TOKEN_RE = /<(@&|@|#)([a-zA-Z0-9_-]+)>/g;

export async function renderTokens(
  api: EchoedClient,
  serverId: string,
  text: string,
): Promise<string> {
  if (!text || !text.includes('<')) return text;

  const userIds: string[] = [];
  const roleIds: string[] = [];
  const channelIds: string[] = [];
  for (const [, kind, id] of text.matchAll(TOKEN_RE)) {
    if (kind === '@') userIds.push(id!);
    else if (kind === '@&') roleIds.push(id!);
    else channelIds.push(id!);
  }
  if (userIds.length === 0 && roleIds.length === 0 && channelIds.length === 0) return text;

  const [names, roles, channels] = await Promise.all([
    userIds.length ? resolveUsers(api, serverId, userIds) : new Map<string, string>(),
    roleIds.length ? resolveRoles(api, serverId, roleIds) : new Map<string, string>(),
    channelIds.length ? resolveChannels(api, serverId, channelIds) : new Map<string, string>(),
  ]);

  return text.replace(TOKEN_RE, (_m, kind: string, id: string) => {
    if (kind === '@') return `@${names.get(id) ?? UNKNOWN_USER}`;
    if (kind === '@&') return roles.get(id) ?? `@${UNKNOWN_ROLE}`;
    return channels.get(id) ?? `#${UNKNOWN_CHANNEL}`;
  });
}
