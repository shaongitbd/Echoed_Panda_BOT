import type { EchoedClient } from '../client/echoedClient.js';
import type { MessageCreatedData } from '../types.js';
import { getEmojisForChannel } from './store.js';
import { log } from '../log.js';

// Add every configured emoji to a fresh message. Sequential to keep
// reaction ordering predictable and to spread API calls evenly under
// the 120/min rate limit when a channel has multiple auto-reacts.
export async function processAutoReact(
  api: EchoedClient,
  msg: MessageCreatedData,
): Promise<void> {
  const emojis = await getEmojisForChannel(msg.serverId, msg.channelId);
  if (emojis.length === 0) return;

  // Only one applies. A message holds at most one reaction per user, and
  // adding another replaces it — so looping over every configured emoji
  // spent a request each and left only the last one, which looked like the
  // earlier rules were being ignored. Take the first and stop; the add
  // command warns when a channel already has one configured.
  const emoji = emojis[0]!;
  try {
    await api.addReaction(msg.serverId, msg.id, emoji);
  } catch (err) {
    log.warn(
      { err, channelId: msg.channelId, msgId: msg.id, emoji },
      'Auto-react add failed',
    );
  }
}
