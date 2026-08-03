import type { EchoedClient } from '../client/echoedClient.js';
import { claimDueQotd, pickQuestion, setQotdConfig } from './store.js';
import { buildEmbed, COLORS } from '../client/embeds.js';
import { log } from '../log.js';

const BATCH_SIZE = 25;

// Fires the Question of the Day for every server whose scheduled time has
// arrived. claimDueQotd advances next_run_at by a day atomically, so a slow
// send or overlapping tick can't double-post. Per-server question pick avoids
// the immediate repeat and is persisted as last_question.
export async function qotdTick(api: EchoedClient): Promise<void> {
  const due = await claimDueQotd(new Date(), BATCH_SIZE);
  if (due.length === 0) return;

  log.debug({ count: due.length }, 'Firing QOTD');
  await Promise.allSettled(
    due.map(async (cfg) => {
      if (!cfg.channelId) return;
      let question: string;
      try {
        question = await pickQuestion(cfg.serverId, cfg.lastQuestion);
      } catch (err) {
        log.warn({ err, serverId: cfg.serverId }, 'QOTD question pick failed');
        return;
      }
      try {
        await api.sendMessage({
          serverId: cfg.serverId,
          channelId: cfg.channelId,
          content: '',
          embeds: [
            buildEmbed({
              title: '💬 Question of the Day',
              description: question,
              color: COLORS.ACCENT,
              footer: 'Reply below 👇',
            }),
          ],
        }, { priority: 'background' });
        // Remember what we just asked so the next pick avoids it.
        await setQotdConfig(cfg.serverId, { lastQuestion: question });
      } catch (err) {
        log.warn({ err, serverId: cfg.serverId }, 'QOTD post failed');
      }
    }),
  );
}
