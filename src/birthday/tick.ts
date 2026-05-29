import type { EchoedClient } from '../client/echoedClient.js';
import { claimDueBirthdayConfigs, birthdaysOn } from './store.js';
import { buildEmbed, COLORS } from '../client/embeds.js';
import { log } from '../log.js';

const BATCH_SIZE = 25;

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
  await Promise.allSettled(
    due.map(async (cfg) => {
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
          await Promise.allSettled(
            expired.map((uid) =>
              api.removeRole(cfg.serverId, uid, cfg.roleId!).catch(() => undefined),
            ),
          );
          await Promise.allSettled(
            celebrants.map((uid) =>
              api.addRole(cfg.serverId, uid, cfg.roleId!).catch(() => undefined),
            ),
          );
        } catch (err) {
          log.warn({ err, serverId: cfg.serverId }, 'Birthday role rotation failed');
        }
      }

      if (celebrants.length === 0) return;

      const mentions = celebrants.map((uid) => `<@${uid}>`).join(' ');
      try {
        await api.sendMessage({
          serverId: cfg.serverId,
          channelId: cfg.channelId,
          content: renderWish(cfg.message, mentions),
          embeds: [
            buildEmbed({
              title: '🎂 Birthday time!',
              description: `Everybody wish ${mentions} a happy birthday! 🥳`,
              color: COLORS.ACCENT,
            }),
          ],
        });
      } catch (err) {
        log.warn({ err, serverId: cfg.serverId }, 'Birthday post failed');
      }
    }),
  );
}
