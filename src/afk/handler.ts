import type { EchoedClient } from '../client/echoedClient.js';
import type { MessageCreatedData } from '../types.js';
import { getAfk, getAfkBatch, clearAfk } from './store.js';
import { log } from '../log.js';

const MENTION_RE = /<@!?([a-zA-Z0-9_-]+)>/g;

function fmtAge(date: Date): string {
  const ms = Date.now() - date.getTime();
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days}d ago`;
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `${hours}h ago`;
  const mins = Math.floor(ms / 60000);
  if (mins >= 1) return `${mins}m ago`;
  return 'just now';
}

// Per-channel rate limit on AFK reply messages. Without this, a
// channel that mentions an AFK user repeatedly turns into bot spam.
// Key: `${channelId}:${afkUserId}` → last reply timestamp.
const REPLY_COOLDOWN_MS = 60_000;
const recentReplies = new Map<string, number>();

function shouldReply(channelId: string, afkUserId: string): boolean {
  const k = `${channelId}:${afkUserId}`;
  const last = recentReplies.get(k) ?? 0;
  if (Date.now() - last < REPLY_COOLDOWN_MS) return false;
  recentReplies.set(k, Date.now());
  return true;
}

// Periodic sweep of the cooldown map so it doesn't grow unbounded.
let sweepTimer: NodeJS.Timeout | null = null;
function startSweep(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const cutoff = Date.now() - REPLY_COOLDOWN_MS * 5;
    for (const [k, ts] of recentReplies) {
      if (ts < cutoff) recentReplies.delete(k);
    }
  }, REPLY_COOLDOWN_MS);
  sweepTimer.unref();
}

// processAfk runs on every MESSAGE_CREATE. Two responsibilities:
//   1. If the sender is currently AFK, clear it and welcome them back.
//   2. For every mentioned user, if they're AFK, reply once (per
//      channel + cooldown) with the AFK status.
//
// Both are best-effort; errors are logged and swallowed.
export async function processAfk(api: EchoedClient, msg: MessageCreatedData): Promise<void> {
  startSweep();

  // Sender clear-on-return.
  try {
    const senderAfk = await getAfk(msg.serverId, msg.senderId);
    if (senderAfk) {
      const removed = await clearAfk(msg.serverId, msg.senderId);
      if (removed) {
        await api.sendMessage({
          serverId: msg.serverId,
          channelId: msg.channelId,
          content: `Welcome back <@${msg.senderId}>. You were AFK for ${fmtAge(removed.since)}.`,
        });
      }
    }
  } catch (err) {
    log.warn({ err, serverId: msg.serverId, userId: msg.senderId }, 'AFK clear-on-return failed');
  }

  // Mentions of AFK users.
  const mentioned = new Set<string>();
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(msg.content)) !== null) {
    const id = m[1];
    if (id && id !== msg.senderId) mentioned.add(id);
  }
  if (mentioned.size === 0) return;

  try {
    const afks = await getAfkBatch(msg.serverId, Array.from(mentioned));
    if (afks.size === 0) return;

    // Aggregate replies into a single message — one mention with
    // multiple AFK targets shouldn't spawn a thread of bot messages.
    const lines: string[] = [];
    for (const [uid, entry] of afks) {
      if (!shouldReply(msg.channelId, uid)) continue;
      const reason = entry.message ? `: ${entry.message}` : '';
      lines.push(`<@${uid}> is AFK${reason} (since ${fmtAge(entry.since)})`);
    }
    if (lines.length === 0) return;

    await api.sendMessage({
      serverId: msg.serverId,
      channelId: msg.channelId,
      content: lines.join('\n'),
    });
  } catch (err) {
    log.warn({ err, serverId: msg.serverId }, 'AFK mention reply failed');
  }
}
