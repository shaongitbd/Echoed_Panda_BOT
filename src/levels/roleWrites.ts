// Serialized role writes.
//
// A role change is applied by rewriting the member's whole role set, so two
// changes for the same member in flight at once can lose one of them —
// whichever read first wins, and the other change vanishes with no error.
// That is easy to hit here: a level-up grants a reward role while a
// reaction-role panel grants another, or the birthday rotation runs while
// someone is being auto-roled on join.
//
// Every role write in the bot goes through this queue, keyed on
// (serverId, userId). Different members still run concurrently; the same
// member never does. This only serializes *our* writes — a change made
// from elsewhere at the same moment can still collide, which is why the
// features that care also reconcile rather than assuming a write stuck.

import { EchoedApiError, type EchoedClient } from '../client/echoedClient.js';
import { KeyedQueue } from '../util/concurrency.js';
import { log } from '../log.js';

const queue = new KeyedQueue();

const key = (serverId: string, userId: string): string => `${serverId}:${userId}`;

export async function grantRole(
  api: EchoedClient,
  serverId: string,
  userId: string,
  roleId: string,
): Promise<boolean> {
  return queue.run(key(serverId, userId), async () => {
    try {
      await api.addRole(serverId, userId, roleId);
      return true;
    } catch (err) {
      log.warn({ err, serverId, userId, roleId }, 'Role grant failed');
      return false;
    }
  });
}

// Removing a role the member doesn't hold answers 404. That's the normal
// outcome of a speculative removal, not a failure — treat it as success so
// it doesn't read as an error in the logs.
export async function revokeRole(
  api: EchoedClient,
  serverId: string,
  userId: string,
  roleId: string,
): Promise<boolean> {
  return queue.run(key(serverId, userId), async () => {
    try {
      await api.removeRole(serverId, userId, roleId);
      return true;
    } catch (err) {
      if (err instanceof EchoedApiError && err.status === 404) {
        log.debug({ serverId, userId, roleId }, 'Role already absent');
        return true;
      }
      log.warn({ err, serverId, userId, roleId }, 'Role revoke failed');
      return false;
    }
  });
}

// Apply a set of grants and revokes for one member as a single queued
// unit, so nothing interleaves in the middle of a multi-role change.
export async function applyRoleChanges(
  api: EchoedClient,
  serverId: string,
  userId: string,
  changes: { grant?: readonly string[]; revoke?: readonly string[] },
): Promise<void> {
  const grant = changes.grant ?? [];
  const revoke = changes.revoke ?? [];
  if (grant.length === 0 && revoke.length === 0) return;

  await queue.run(key(serverId, userId), async () => {
    for (const roleId of grant) {
      try {
        await api.addRole(serverId, userId, roleId);
      } catch (err) {
        log.warn({ err, serverId, userId, roleId }, 'Role grant failed');
      }
    }
    for (const roleId of revoke) {
      try {
        await api.removeRole(serverId, userId, roleId);
      } catch (err) {
        if (err instanceof EchoedApiError && err.status === 404) continue;
        log.warn({ err, serverId, userId, roleId }, 'Role revoke failed');
      }
    }
  });
}
