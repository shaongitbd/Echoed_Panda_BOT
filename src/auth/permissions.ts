import type { EchoedClient } from '../client/echoedClient.js';
import { EchoedApiError } from '../client/echoedClient.js';
import { config } from '../config.js';
import { log } from '../log.js';

// Echoed permission names — the strings the API returns from
// GET /v1/bots/:server_id/members/:user_id/permissions.
export type Permission =
  | 'VIEW_CHANNELS'
  | 'MANAGE_CHANNELS'
  | 'MANAGE_ROLES'
  | 'MANAGE_SERVER'
  | 'CREATE_INVITE'
  | 'KICK_MEMBERS'
  | 'BAN_MEMBERS'
  | 'ADMINISTRATOR'
  | 'SEND_MESSAGES'
  | 'READ_MESSAGE_HISTORY'
  | 'USE_EXTERNAL_EMOJIS'
  | 'ADD_REACTIONS'
  | 'ATTACH_FILES'
  | 'EMBED_LINKS'
  | 'MANAGE_MESSAGES'
  | 'CONNECT'
  | 'SPEAK'
  | 'MUTE_MEMBERS'
  | 'DEAFEN_MEMBERS'
  | 'MOVE_MEMBERS'
  | 'USE_VOICE_ACTIVITY'
  | 'PRIORITY_SPEAKER'
  | 'USE_CAMERA'
  | 'SCREEN_SHARE'
  | 'READ_TASKS'
  | 'CREATE_TASKS'
  | 'MANAGE_TASKS'
  | 'READ_THREADS'
  | 'CREATE_THREADS'
  | 'MANAGE_THREADS'
  | 'READ_EVENTS'
  | 'CREATE_EVENTS'
  | 'MANAGE_EVENTS';

const TTL_MS = 60_000; // One minute. PERMISSION_UPDATE socket events evict.

interface CacheEntry {
  permissions: ReadonlySet<Permission>;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

// Cache key. When channelId is undefined the entry is the server-level
// effective permissions; with a channelId it is post-override per-channel.
function cacheKey(serverId: string, userId: string, channelId?: string): string {
  return channelId ? `${serverId}:${userId}:${channelId}` : `${serverId}:${userId}`;
}

export class PermissionService {
  constructor(private readonly api: EchoedClient) {}

  // Returns true if the user has the given permission. When `channelId` is
  // supplied the check honors per-channel overrides; otherwise it's a
  // server-level check. Administrator implies everything. Network failures
  // fail CLOSED — denying is the safer default for moderation commands.
  async has(
    serverId: string,
    userId: string,
    perm: Permission,
    channelId?: string,
  ): Promise<boolean> {
    const perms = await this.fetch(serverId, userId, channelId);
    if (!perms) return false;
    return perms.has('ADMINISTRATOR') || perms.has(perm);
  }

  // Same check, but distinguishes "denied" from "we couldn't find out".
  // The action still fails closed either way — this only exists so the
  // reply can be honest. Telling someone they lack a permission they
  // actually hold, because a lookup blipped, sends admins to re-check
  // settings that were never wrong.
  async check(
    serverId: string,
    userId: string,
    perm: Permission,
    channelId?: string,
  ): Promise<'granted' | 'denied' | 'unavailable'> {
    const perms = await this.fetch(serverId, userId, channelId);
    if (!perms) return 'unavailable';
    return perms.has('ADMINISTRATOR') || perms.has(perm) ? 'granted' : 'denied';
  }

  // Channel-aware convenience: same as has(...) but the channelId is
  // required, so the call site reads as "does this user have X in #channel".
  async hasIn(
    serverId: string,
    channelId: string,
    userId: string,
    perm: Permission,
  ): Promise<boolean> {
    return this.has(serverId, userId, perm, channelId);
  }

  // Lower-level accessor for callers that need the full set (e.g. a
  // permission-check that needs ANY of several perms).
  async list(
    serverId: string,
    userId: string,
    channelId?: string,
  ): Promise<ReadonlySet<Permission> | null> {
    return this.fetch(serverId, userId, channelId);
  }

  // Drop a cached entry. Wire this to the PERMISSION_UPDATE socket event
  // so role/channel-perm changes take effect immediately. Without
  // channelId, drops both server-level and every per-channel entry for
  // this user — channel overrides typically change in lockstep with role
  // edits, so over-eviction is fine.
  invalidate(serverId: string, userId: string): void {
    const userPrefix = `${serverId}:${userId}`;
    for (const key of cache.keys()) {
      if (key === userPrefix || key.startsWith(`${userPrefix}:`)) {
        cache.delete(key);
      }
    }
  }

  invalidateServer(serverId: string): void {
    const prefix = `${serverId}:`;
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) cache.delete(key);
    }
  }

  // Drop every cached entry for a single channel (any user). Use when a
  // channel's overrides change — server-level entries stay valid.
  invalidateChannel(serverId: string, channelId: string): void {
    const suffix = `:${channelId}`;
    const prefix = `${serverId}:`;
    for (const key of cache.keys()) {
      if (key.startsWith(prefix) && key.endsWith(suffix)) {
        cache.delete(key);
      }
    }
  }

  private async fetch(
    serverId: string,
    userId: string,
    channelId?: string,
  ): Promise<ReadonlySet<Permission> | null> {
    const key = cacheKey(serverId, userId, channelId);
    // When the permission cache is disabled (PERMISSION_CACHE_ENABLED=false),
    // skip both the read and the write so every check hits the backend live —
    // role grants reflect instantly, no 60s staleness window.
    const useCache = config.permissionCacheEnabled;
    if (useCache) {
      const cached = cache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.permissions;
      }
    }

    try {
      const res = await this.api.getMemberPermissions(serverId, userId, channelId);
      const set = new Set(res.permissions as Permission[]);
      if (useCache) cache.set(key, { permissions: set, expiresAt: Date.now() + TTL_MS });
      return set;
    } catch (err) {
      // 404 = not a member. We treat that as "no perms" and cache a brief
      // empty set so a flood of commands from a non-member doesn't hammer
      // the API.
      if (err instanceof EchoedApiError && err.status === 404) {
        const empty = new Set<Permission>();
        if (useCache) cache.set(key, { permissions: empty, expiresAt: Date.now() + TTL_MS });
        return empty;
      }
      log.warn(
        { err, serverId, userId, channelId },
        'Failed to fetch member permissions — failing closed',
      );
      return null;
    }
  }
}
