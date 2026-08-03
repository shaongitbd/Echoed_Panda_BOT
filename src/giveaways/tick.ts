import type { EchoedClient } from '../client/echoedClient.js';
import type { PermissionService } from '../auth/permissions.js';
import { claimDueGiveaways, markEnded, releaseGiveaway } from './store.js';
import { pickAndAnnounce } from './pickWinners.js';
import { forEachLimit } from '../util/concurrency.js';
import { log } from '../log.js';

const BATCH_SIZE = 25;

// Drawing a giveaway can mean a permission check per entrant, so a batch of
// popular giveaways is the single largest burst this bot can produce. Keep
// the number of giveaways drawn at once small; the draw itself is also
// internally bounded.
const CONCURRENCY = 2;

export async function giveawayTick(
  api: EchoedClient,
  botUserId: string | null,
  perms: PermissionService | null,
): Promise<void> {
  const due = await claimDueGiveaways(new Date(), BATCH_SIZE);
  if (due.length === 0) return;

  log.debug({ count: due.length }, 'Ending giveaways');
  await forEachLimit(due, CONCURRENCY, async (g) => {
    try {
      await pickAndAnnounce(api, g, {
        botUserId: botUserId ?? undefined,
        perms: perms ?? undefined,
      });
      // Only now is the giveaway actually finished.
      await markEnded(g.id);
    } catch (err) {
      // Leave it un-ended and release the claim so a later tick retries.
      // Marking it ended here would strand it: the early-end path only
      // matches un-ended giveaways, so nothing could ever finish it.
      log.warn({ err, giveawayId: g.id }, 'Giveaway end failed — will retry');
      await releaseGiveaway(g.id).catch(() => undefined);
    }
  });
}
