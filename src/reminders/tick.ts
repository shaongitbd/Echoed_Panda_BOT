import { EchoedApiError, type EchoedClient } from '../client/echoedClient.js';
import { claimDue, settle, release, abandon } from './store.js';
import { forEachLimit } from '../util/concurrency.js';
import { escapeMentions } from '../client/text.js';
import { log } from '../log.js';

// One tick handles up to BATCH_SIZE due reminders. If more are due,
// the next tick picks them up — keeps the per-tick latency bounded
// even on a busy day.
const BATCH_SIZE = 25;

// Cap on simultaneous sends from this branch. The API client paces
// everything against one shared budget anyway, but keeping the fan-out
// narrow here means a backlog doesn't monopolise the in-flight slots and
// starve the other branches.
const CONCURRENCY = 4;

export async function reminderTick(api: EchoedClient): Promise<void> {
  const due = await claimDue(new Date(), BATCH_SIZE);
  if (due.length === 0) return;

  log.debug({ count: due.length }, 'Firing reminders');

  // Each reminder is claimed, not deleted, until it is actually delivered.
  // Failures are isolated so one bad channel doesn't block the batch, and
  // a transient failure releases the claim so the next tick retries rather
  // than the reminder being lost.
  await forEachLimit(due, CONCURRENCY, async (r) => {
    try {
      await api.sendMessage(
        {
          serverId: r.serverId,
          channelId: r.channelId,
          // The body is whatever the member typed. Only the mention we
          // construct ourselves should ping.
          content: `⏰ <@${r.userId}> — ${escapeMentions(r.message)}`,
          mentions: [r.userId],
        },
        { priority: 'background' },
      );
      await settle(r.id);
    } catch (err) {
      // A channel that's gone, or that we can't post in, will never
      // succeed — drop it instead of retrying until the attempt cap.
      const status = err instanceof EchoedApiError ? err.status : 0;
      if (status === 403 || status === 404) {
        log.warn({ err, reminderId: r.id }, 'Reminder undeliverable — dropping');
        await abandon(r.id).catch(() => undefined);
        return;
      }
      log.warn({ err, reminderId: r.id }, 'Reminder send failed — will retry');
      await release(r.id).catch(() => undefined);
    }
  });
}
