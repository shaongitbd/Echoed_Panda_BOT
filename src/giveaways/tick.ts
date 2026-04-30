import type { EchoedClient } from '../client/echoedClient.js';
import type { PermissionService } from '../auth/permissions.js';
import { claimDueGiveaways } from './store.js';
import { pickAndAnnounce } from './pickWinners.js';
import { log } from '../log.js';

const BATCH_SIZE = 25;

export async function giveawayTick(
  api: EchoedClient,
  botUserId: string | null,
  perms: PermissionService | null,
): Promise<void> {
  const due = await claimDueGiveaways(new Date(), BATCH_SIZE);
  if (due.length === 0) return;

  log.debug({ count: due.length }, 'Ending giveaways');
  await Promise.allSettled(
    due.map((g) =>
      pickAndAnnounce(api, g, {
        botUserId: botUserId ?? undefined,
        perms: perms ?? undefined,
      }).catch((err: unknown) => {
        log.warn({ err, giveawayId: g.id }, 'Giveaway end failed');
      }),
    ),
  );
}
