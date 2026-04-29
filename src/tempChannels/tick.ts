import type { EchoedClient } from '../client/echoedClient.js';
import { claimExpired } from './store.js';
import { log } from '../log.js';

const BATCH_SIZE = 25;

export async function tempChannelTick(api: EchoedClient): Promise<void> {
  const expired = await claimExpired(new Date(), BATCH_SIZE);
  if (expired.length === 0) return;

  log.debug({ count: expired.length }, 'Deleting expired temp channels');

  // Sequential delete keeps us comfortably under the rate limit
  // since the same tick may also fire reminders/giveaways. A single
  // expired-channel sweep is rarely more than a handful anyway.
  for (const t of expired) {
    try {
      await api.deleteChannel(t.serverId, t.channelId);
    } catch (err) {
      // 404 is fine — channel was already deleted out from under us.
      // Other failures are logged; the row is already deleted from
      // our table so we won't retry.
      log.warn({ err, channelId: t.channelId }, 'Temp channel delete failed (already gone?)');
    }
  }
}
