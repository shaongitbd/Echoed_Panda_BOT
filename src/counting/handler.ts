import type { EchoedClient } from '../client/echoedClient.js';
import type { MessageCreatedData } from '../types.js';
import { getCountingRoute, getCountingConfig, advanceCount, resetCount } from './store.js';
import { log } from '../log.js';

// Pure integer messages only — content must be exactly the number (allowing a
// leading +). Anything else (chatter, "5 nice", "5.0") is ignored, not failed,
// so a stray comment doesn't reset the run.
const PURE_INT_RE = /^\+?(\d{1,9})$/;

// Processes a message in the counting channel. Returns true if the message was
// part of the counting game (valid or a failed attempt), false if it's just an
// ordinary message we should leave alone. Best-effort; never throws.
export async function processCounting(api: EchoedClient, msg: MessageCreatedData): Promise<boolean> {
  // Hot-path gate: cached routing check, so the 99% of messages NOT in the
  // counting channel cost nothing but a cache hit.
  let route;
  try {
    route = await getCountingRoute(msg.serverId);
  } catch (err) {
    log.warn({ err, serverId: msg.serverId }, 'counting route lookup failed');
    return false;
  }
  if (!route.enabled || !route.channelId || msg.channelId !== route.channelId) return false;

  const m = PURE_INT_RE.exec(msg.content.trim());
  if (!m) return false; // not a number — leave chatter alone

  // In the counting channel with a number — now read the live count.
  let cfg;
  try {
    cfg = await getCountingConfig(msg.serverId);
  } catch (err) {
    log.warn({ err, serverId: msg.serverId }, 'counting getConfig failed');
    return false;
  }
  if (!cfg.enabled || !cfg.channelId) return false;

  const num = parseInt(m[1]!, 10);
  const expected = cfg.currentCount + 1;
  const sameUserTwice = cfg.lastUserId === msg.senderId;

  // Correct number, different user → advance.
  if (num === expected && !sameUserTwice) {
    const advanced = await advanceCount(msg.serverId, expected, msg.senderId);
    if (advanced) {
      const isRecord = advanced.count === advanced.highScore && advanced.count > 1;
      await api
        .addReaction(msg.serverId, msg.id, isRecord ? '🏆' : '✅')
        .catch((err: unknown) => log.debug({ err }, 'counting reaction failed'));
    }
    // If advance raced (someone else got there first), silently ignore.
    return true;
  }

  // Failure: wrong number, or the same person counting twice in a row.
  const reachedCount = cfg.currentCount;
  if (cfg.resetOnFail) {
    await resetCount(msg.serverId).catch((err: unknown) => log.warn({ err }, 'counting reset failed'));
    const why = sameUserTwice
      ? `you can't count twice in a row!`
      : `**${num}** wasn't right — it was **${expected}**.`;
    await api
      .sendMessage({
        serverId: msg.serverId,
        channelId: msg.channelId,
        content: `❌ <@${msg.senderId}> broke the chain at **${reachedCount}** — ${why} Next number is **1**.`,
      })
      .catch((err: unknown) => log.warn({ err }, 'counting fail-message failed'));
  } else {
    await api.addReaction(msg.serverId, msg.id, '❌').catch(() => undefined);
  }
  return true;
}
