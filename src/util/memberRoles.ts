import type { EchoedClient } from '../client/echoedClient.js';
import { log } from '../log.js';
import { registerTtlCache } from './ttlCache.js';

// Per-member role cache, shared by everything that scopes a feature by role
// on the message path (auto-mod, command permissions). Both run on every
// message, so the lookup has to be cached; 60s absorbs admin role changes
// without a network call per message.
const ROLE_CACHE_TTL_MS = 60 * 1000;
const memberRolesCache = new Map<string, { roles: string[]; expiresAt: number }>();
registerTtlCache('memberRoles', memberRolesCache, 20_000);

// Returns null when the lookup fails, so each caller decides for itself
// whether to fail open or closed.
export async function fetchMemberRoles(
  api: EchoedClient,
  serverId: string,
  userId: string,
): Promise<string[] | null> {
  const key = `${serverId}:${userId}`;
  const cached = memberRolesCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.roles;
  try {
    const res = await api.getMemberRoles(serverId, userId);
    const roles = res.roles ?? [];
    memberRolesCache.set(key, { roles, expiresAt: Date.now() + ROLE_CACHE_TTL_MS });
    return roles;
  } catch (err) {
    log.warn({ err, serverId, userId }, 'Member role lookup failed');
    return null;
  }
}
