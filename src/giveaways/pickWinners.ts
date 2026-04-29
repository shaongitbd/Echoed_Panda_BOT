import type { EchoedClient } from '../client/echoedClient.js';
import type { Giveaway } from './store.js';
import { recordWinners } from './store.js';
import { log } from '../log.js';

export const GIVEAWAY_EMOJI = '🎉';

// Fisher-Yates partial shuffle — pick `n` distinct items from `pool`
// without mutating the original. We use this rather than `sort`-by-
// random because it's O(n) and unbiased.
function pickRandom<T>(pool: readonly T[], n: number): T[] {
  if (n <= 0 || pool.length === 0) return [];
  const arr = pool.slice();
  const out: T[] = [];
  const want = Math.min(n, arr.length);
  for (let i = 0; i < want; i++) {
    const j = i + Math.floor(Math.random() * (arr.length - i));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
    out.push(arr[i]!);
  }
  return out;
}

// Select winners by reading the message's reactions, filtering out
// already-winning users (for re-roll), and picking randomly. Returns
// the picked winners and the announcement-friendly mention string.
export async function pickAndAnnounce(
  api: EchoedClient,
  g: Giveaway,
  options: { excludeUserIds?: string[]; isReroll?: boolean; botUserId?: string } = {},
): Promise<string[]> {
  let message;
  try {
    message = await api.getMessage(g.serverId, g.messageId);
  } catch (err) {
    log.warn({ err, giveawayId: g.id }, 'Giveaway message lookup failed');
    await sendNoEntries(api, g, 'message no longer accessible');
    return [];
  }

  const reactors = message.reactions?.[GIVEAWAY_EMOJI] ?? [];
  const excluded = new Set(options.excludeUserIds ?? []);
  if (options.botUserId) excluded.add(options.botUserId);

  const eligible = reactors.filter((id) => !excluded.has(id));
  if (eligible.length === 0) {
    await sendNoEntries(api, g, options.isReroll ? 'no other entrants' : 'no entrants');
    return [];
  }

  const winners = pickRandom(eligible, g.winnerCount);
  await recordWinners(g.id, winners);

  const mentions = winners.map((id) => `<@${id}>`).join(', ');
  const verb = options.isReroll ? '🎲 New winner' : '🎉 Winner';
  const plural = winners.length === 1 ? '' : 's';
  try {
    await api.sendMessage({
      serverId: g.serverId,
      channelId: g.channelId,
      content: `${verb}${plural} for **${g.prize}**: ${mentions}`,
    });
  } catch (err) {
    log.warn({ err, giveawayId: g.id }, 'Giveaway announcement failed');
  }
  return winners;
}

async function sendNoEntries(
  api: EchoedClient,
  g: Giveaway,
  reason: string,
): Promise<void> {
  try {
    await api.sendMessage({
      serverId: g.serverId,
      channelId: g.channelId,
      content: `🎉 Giveaway for **${g.prize}** ended — ${reason}.`,
    });
  } catch (err) {
    log.warn({ err, giveawayId: g.id }, 'No-entries announcement failed');
  }
}
