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
  const emojis = await getEmojisForChannel(msg.channelId);
  if (emojis.length === 0) return;

  for (const emoji of emojis) {
    try {
      await api.addReaction(msg.serverId, msg.id, emoji);
    } catch (err) {
      log.warn(
        { err, channelId: msg.channelId, msgId: msg.id, emoji },
        'Auto-react add failed',
      );
    }
  }
}
