import type { EchoedClient } from '../client/echoedClient.js';
import { claimDueAndReschedule } from './store.js';
import { log } from '../log.js';

const BATCH_SIZE = 25;

// schedMsgTick fires every due scheduled message and lets the SQL in
// claimDueAndReschedule advance next_run_at atomically. If the send
// fails we DON'T retry — the message is lost for that run, but the
// next interval will fire normally. Retrying mid-tick would risk
// hammering a flaky channel and burning rate-limit budget on a
// scheduled-message-storm scenario.
export async function schedMsgTick(api: EchoedClient): Promise<void> {
  const due = await claimDueAndReschedule(new Date(), BATCH_SIZE);
  if (due.length === 0) return;

  log.debug({ count: due.length }, 'Firing scheduled messages');
  await Promise.allSettled(
    due.map((s) =>
      api
        .sendMessage({
          serverId: s.serverId,
          channelId: s.channelId,
          content: s.message,
        })
        .catch((err: unknown) => {
          log.warn({ err, scheduleId: s.id }, 'Scheduled message send failed');
        }),
    ),
  );
}
