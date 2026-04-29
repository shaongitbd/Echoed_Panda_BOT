import type { EchoedClient } from '../client/echoedClient.js';
import { claimDue } from './store.js';
import { log } from '../log.js';

// One tick handles up to BATCH_SIZE due reminders. If more are due,
// the next tick picks them up — keeps the per-tick latency bounded
// even on a busy day.
const BATCH_SIZE = 50;

export async function reminderTick(api: EchoedClient): Promise<void> {
  const due = await claimDue(new Date(), BATCH_SIZE);
  if (due.length === 0) return;

  log.debug({ count: due.length }, 'Firing reminders');

  // Fire in parallel — the API client serializes per the bot rate
  // limit. Failures are isolated so one bad channel doesn't block
  // the whole batch.
  await Promise.allSettled(
    due.map(async (r) => {
      try {
        await api.sendMessage({
          serverId: r.serverId,
          channelId: r.channelId,
          content: `⏰ <@${r.userId}> — ${r.message}`,
        });
      } catch (err) {
        log.warn({ err, reminderId: r.id }, 'Reminder send failed');
        throw err;
      }
    }),
  );
}
