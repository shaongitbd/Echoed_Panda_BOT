import type { EchoedClient } from '../client/echoedClient.js';
import { listAll, recordCheck } from './store.js';
import { getLiveStreams } from './api.js';
import { twitchEnabled } from '../config.js';
import { forEachLimit } from '../util/concurrency.js';
import { log } from '../log.js';
import { escapeMentions } from '../client/text.js';

// Subscriptions processed at once — the API client paces globally, but a
// narrow fan-out keeps one branch from monopolising the in-flight slots.
const CONCURRENCY = 4;

// Edge-detect "now live" via comparing the current state to the row's
// `last_check_live`. We DON'T fire on every tick a streamer is live
// — only on the offline→online transition. Re-firing per stream
// session uses last_stream_id (Twitch issues a fresh ID each time
// a streamer starts, so a different ID after a brief offline gap is
// a new session).

export async function twitchTick(api: EchoedClient): Promise<void> {
  if (!twitchEnabled()) return;

  const subs = await listAll();
  if (subs.length === 0) return;

  // Single Helix call for all distinct logins.
  const logins = Array.from(new Set(subs.map((s) => s.twitchLogin)));
  let result;
  try {
    result = await getLiveStreams(logins);
  } catch (err) {
    log.warn({ err }, 'Twitch tick: getLiveStreams failed');
    return;
  }
  const { live, complete } = result;
  if (!complete) {
    log.warn('Twitch tick: poll incomplete — not marking anyone offline this round');
  }

  // Walk every subscription row and decide: announce, persist state, both?
  await forEachLimit(subs, CONCURRENCY, async (sub) => {
      const stream = live.get(sub.twitchLogin);
      const isLiveNow = Boolean(stream);

      // No state change: nothing to do.
      if (isLiveNow === sub.lastCheckLive) {
        // Still update last_stream_id if the streamer ended a session
        // and started a new one between ticks (rare, but cheap to handle).
        if (isLiveNow && stream && stream.id !== sub.lastStreamId) {
          await announceStream(api, sub.serverId, sub.channelId, stream);
          await recordCheck({ id: sub.id, isLive: true, streamId: stream.id });
        }
        return;
      }

      if (isLiveNow && stream) {
        await announceStream(api, sub.serverId, sub.channelId, stream);
        await recordCheck({ id: sub.id, isLive: true, streamId: stream.id });
      } else {
        // Went offline. Persist the state but skip the announce — most
        // servers don't want "X is offline now" spam.
        //
        // Only downgrade to offline on a poll that fully succeeded.
        // Otherwise a failed batch reads as "everyone in it went offline",
        // and the next successful poll re-announces all of them at once.
        if (!complete) return;
        // Keep the stream id. Clearing it meant the next online transition
        // couldn't tell a genuinely new broadcast from the same one seen
        // again, so a brief blip produced a duplicate announcement.
        await recordCheck({ id: sub.id, isLive: false, streamId: sub.lastStreamId });
      }
  });
}

async function announceStream(
  api: EchoedClient,
  serverId: string,
  channelId: string,
  stream: { userLogin: string; userName: string; title: string; gameName: string },
): Promise<void> {
  // Stream title, display name and game all come from Twitch. Escape them
  // so a handle appearing in any of them can't ping a member of this
  // server every time the streamer goes live.
  const lines = [
    `🔴 **${escapeMentions(stream.userName)}** is live on Twitch!`,
    stream.title ? `**${escapeMentions(stream.title)}**` : '',
    stream.gameName ? `Playing: ${escapeMentions(stream.gameName)}` : '',
    `https://twitch.tv/${stream.userLogin}`,
  ].filter((l) => l.length > 0);

  try {
    await api.sendMessage({
      serverId,
      channelId,
      content: lines.join('\n'),
    }, { priority: 'background' });
  } catch (err) {
    log.warn({ err, channelId, login: stream.userLogin }, 'Twitch announce failed');
  }
}
