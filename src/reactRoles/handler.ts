import type { EchoedClient } from '../client/echoedClient.js';
import type { ReactionEventData } from '../types.js';
import {
  getMessage,
  getMappingForEmoji,
  getMappingsForMessage,
} from './store.js';
import { log } from '../log.js';

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

  try {
    await api.addRole(data.serverId, data.userId, mapping.roleId);
  } catch (err) {
    log.warn(
      { err, msgId: data.messageId, userId: data.userId, roleId: mapping.roleId },
      'Reaction-role add failed',
    );
    return;
  }

  if (message.mode === 'unique') {
    const all = await getMappingsForMessage(data.messageId);
    const others = all.filter((m) => m.emoji !== data.reactionType);
    // Fire role removals in parallel; per-call failures (role doesn't
    // apply, role deleted) shouldn't block the others.
    await Promise.allSettled(
      others.map((m) =>
        api.removeRole(data.serverId, data.userId, m.roleId).catch((err: unknown) => {
          log.warn(
            { err, roleId: m.roleId, userId: data.userId },
            'Unique-mode role removal failed',
          );
          throw err;
        }),
      ),
    );
  }
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

  try {
    await api.removeRole(data.serverId, data.userId, mapping.roleId);
  } catch (err) {
    log.warn(
      { err, msgId: data.messageId, userId: data.userId, roleId: mapping.roleId },
      'Reaction-role remove failed',
    );
  }
}
