import type { EchoedClient } from '../client/echoedClient.js';
import { claimDueBirthdayConfigs, birthdaysOn } from './store.js';
import { buildEmbed, COLORS } from '../client/embeds.js';
import { forEachLimit } from '../util/concurrency.js';
import { log } from '../log.js';

const BATCH_SIZE = 25;

// Servers processed at once, and role changes in flight within a server.
const CONCURRENCY = 4;
const ROLE_CONCURRENCY = 3;

// Ceiling on how many celebrants we name in one greeting. Message content
// has a size limit, and over-length content is dropped rather than
// rejected — so an unbounded list would silently post an empty greeting.
const MAX_MENTIONED = 20;

function renderWish(template: string | null, mentions: string): string {
  if (template && template.trim()) return template.replace(/\{user\}/g, mentions);
  return `🎂 Happy birthday ${mentions}! Hope it's a great one. 🎉`;
}

// Daily birthday run. For each server whose configured time has arrived:
//   - grant the (optional) birthday role to today's celebrants and strip it
//     from yesterday's, so the role tracks the current day with no extra state
//   - post a celebratory message mentioning today's birthday folks
// claimDueBirthdayConfigs advances the cursor a day atomically (no double-run).
export async function birthdayTick(api: EchoedClient): Promise<void> {
  const due = await claimDueBirthdayConfigs(new Date(), BATCH_SIZE);
  if (due.length === 0) return;

  const now = new Date();
  const todayM = now.getUTCMonth() + 1;
  const todayD = now.getUTCDate();
  const yest = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yestM = yest.getUTCMonth() + 1;
  const yestD = yest.getUTCDate();

  log.debug({ count: due.length }, 'Firing birthday run');
  await forEachLimit(due, CONCURRENCY, async (cfg) => {
      if (!cfg.channelId) return;
      let celebrants: string[];
      try {
        celebrants = await birthdaysOn(cfg.serverId, todayM, todayD);
      } catch (err) {
        log.warn({ err, serverId: cfg.serverId }, 'birthdaysOn failed');
        return;
      }

      // Birthday role rotation: strip yesterday's holders, grant today's.
      if (cfg.roleId) {
        try {
          const expired = await birthdaysOn(cfg.serverId, yestM, yestD);
          // Bounded: a server with many birthdays on one day would
          // otherwise issue a role call per member all at once, and this
          // runs for every due server in the batch simultaneously.
          await forEachLimit(expired, ROLE_CONCURRENCY, (uid) =>
            api.removeRole(cfg.serverId, uid, cfg.roleId!).catch(() => undefined),
          );
          await forEachLimit(celebrants, ROLE_CONCURRENCY, (uid) =>
            api.addRole(cfg.serverId, uid, cfg.roleId!).catch(() => undefined),
          );
        } catch (err) {
          log.warn({ err, serverId: cfg.serverId }, 'Birthday role rotation failed');
        }
      }

      if (celebrants.length === 0) return;

      // The mention list goes in `content` — that is the only place tokens
      // are resolved, and the only way the celebrants actually get pinged.
      // Cap it: `content` has a size limit, and a server with a very large
      // shared birthday would otherwise blow past it.
      const named = celebrants.slice(0, MAX_MENTIONED);
      const overflow = celebrants.length - named.length;
      const mentions =
        named.map((uid) => `<@${uid}>`).join(' ') +
        (overflow > 0 ? ` and ${overflow} more` : '');

      try {
        await api.sendMessage({
          serverId: cfg.serverId,
          channelId: cfg.channelId,
          content: renderWish(cfg.message, mentions),
          // Deliberately no mention list in the embed: tokens there would
          // render as raw IDs, and `content` already carries the greeting.
          embeds: [
            buildEmbed({
              title: '🎂 Birthday time!',
              description: 'Wishing a very happy birthday to our celebrants today! 🥳',
              color: COLORS.ACCENT,
            }),
          ],
          mentions: named,
        }, { priority: 'background' });
      } catch (err) {
        log.warn({ err, serverId: cfg.serverId }, 'Birthday post failed');
      }
  });
}
