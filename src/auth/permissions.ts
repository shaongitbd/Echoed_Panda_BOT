import type { EchoedClient } from '../client/echoedClient.js';
import { EchoedApiError } from '../client/echoedClient.js';
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

function cacheKey(serverId: string, userId: string): string {
  return `${serverId}:${userId}`;
}

export class PermissionService {
  constructor(private readonly api: EchoedClient) {}

  // Returns true if the user has the given permission in the server.
  // Administrator implies everything. Network failures fail CLOSED — when
  // we genuinely don't know what perms a user has, denying the action is
  // the safer default for moderation commands.
  async has(serverId: string, userId: string, perm: Permission): Promise<boolean> {
    const perms = await this.fetch(serverId, userId);
    if (!perms) return false;
    return perms.has('ADMINISTRATOR') || perms.has(perm);
  }

  // Lower-level accessor for callers that need the full set (e.g. a
  // permission-check that needs ANY of several perms).
  async list(serverId: string, userId: string): Promise<ReadonlySet<Permission> | null> {
    return this.fetch(serverId, userId);
  }

  // Drop a cached entry. Wire this to the PERMISSION_UPDATE socket event
  // so role/channel-perm changes take effect immediately.
  invalidate(serverId: string, userId: string): void {
    cache.delete(cacheKey(serverId, userId));
  }

  invalidateServer(serverId: string): void {
    const prefix = `${serverId}:`;
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) cache.delete(key);
    }
  }

  private async fetch(serverId: string, userId: string): Promise<ReadonlySet<Permission> | null> {
    const key = cacheKey(serverId, userId);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.permissions;
    }

    try {
      const res = await this.api.getMemberPermissions(serverId, userId);
      const set = new Set(res.permissions as Permission[]);
      cache.set(key, { permissions: set, expiresAt: Date.now() + TTL_MS });
      return set;
    } catch (err) {
      // 404 = not a member. We treat that as "no perms" and cache a brief
      // empty set so a flood of commands from a non-member doesn't hammer
      // the API.
      if (err instanceof EchoedApiError && err.status === 404) {
        const empty = new Set<Permission>();
        cache.set(key, { permissions: empty, expiresAt: Date.now() + TTL_MS });
        return empty;
      }
      log.warn(
        { err, serverId, userId },
        'Failed to fetch member permissions — failing closed',
      );
      return null;
    }
  }
}
