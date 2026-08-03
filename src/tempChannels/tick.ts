import { EchoedApiError, type EchoedClient } from '../client/echoedClient.js';
import { claimExpired, settle, release } from './store.js';
import { log } from '../log.js';

const BATCH_SIZE = 25;

export async function tempChannelTick(api: EchoedClient): Promise<void> {
  const expired = await claimExpired(new Date(), BATCH_SIZE);
  if (expired.length === 0) return;

  log.debug({ count: expired.length }, 'Deleting expired temp channels');

  // Sequential: an expired-channel sweep is rarely more than a handful,
  // and there's no reason to burn in-flight slots other branches need.
  for (const t of expired) {
    try {
      await api.deleteChannel(t.serverId, t.channelId);
      await settle(t.channelId);
    } catch (err) {
      const status = err instanceof EchoedApiError ? err.status : 0;
      // Already gone, or we've lost access and never will delete it —
      // either way there is nothing left to do, so stop tracking it.
      if (status === 404 || status === 403) {
        log.debug({ channelId: t.channelId, status }, 'Temp channel already gone');
        await settle(t.channelId).catch(() => undefined);
        continue;
      }
      // Anything else might work next time. Release the claim rather than
      // forgetting the channel — otherwise it stays alive forever with
      // nothing tracking it.
      log.warn({ err, channelId: t.channelId }, 'Temp channel delete failed — will retry');
      await release(t.channelId).catch(() => undefined);
    }
  }
}
