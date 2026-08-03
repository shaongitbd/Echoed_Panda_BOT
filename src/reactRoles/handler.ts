import type { EchoedClient } from '../client/echoedClient.js';
import type { ReactionEventData } from '../types.js';
import {
  getMessage,
  getMappingForEmoji,
  getMappingsForMessage,
} from './store.js';
import { applyRoleChanges, revokeRole } from '../levels/roleWrites.js';

// onReactionAdded: a user clicked an emoji on a possibly-tracked message.
//
// Flow:
//   1. Fast path: is this message tracked? If not, return immediately.
//   2. Look up the role bound to this emoji. Missing → ignore (the user
//      reacted with an emoji that isn't part of the reaction-role setup).
//   3. Add the role to the user.
//   4. In `unique` mode, also remove every OTHER role configured on
//      this message — keeps the user with at most one role from the
//      message at a time.
//
// We can't physically remove the user's old reactions because Echoed's
// bot reaction endpoints only let the bot manage its own reactions.
// The roles still flip correctly; the UI just shows lingering checks.
export async function handleReactionAdded(
  api: EchoedClient,
  data: ReactionEventData,
): Promise<void> {
  const message = await getMessage(data.messageId);
  if (!message) return;

  const mapping = await getMappingForEmoji(data.messageId, data.reactionType);
  if (!mapping) return;

  // In unique mode the other options come off in the same queued unit, so
  // nothing can interleave between granting the new role and dropping the
  // old ones. Removing a role the member never had answers 404, which is
  // the normal case here and is treated as success rather than logged as a
  // failure for every option they didn't pick.
  const others =
    message.mode === 'unique'
      ? (await getMappingsForMessage(data.messageId))
          .filter((m) => m.emoji !== data.reactionType)
          .map((m) => m.roleId)
      : [];

  await applyRoleChanges(api, data.serverId, data.userId, {
    grant: [mapping.roleId],
    revoke: others,
  });
}

// onReactionRemoved: a user un-clicked. In `verify` mode this is a
// no-op (the binding is one-way: react to opt in, no take-backs).
// In other modes we remove the role.
export async function handleReactionRemoved(
  api: EchoedClient,
  data: ReactionEventData,
): Promise<void> {
  const message = await getMessage(data.messageId);
  if (!message) return;

  // verify mode = one-way grant. Ignore the un-react.
  if (message.mode === 'verify') return;

  const mapping = await getMappingForEmoji(data.messageId, data.reactionType);
  if (!mapping) return;

  await revokeRole(api, data.serverId, data.userId, mapping.roleId);
}
