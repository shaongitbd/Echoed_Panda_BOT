import type { MessageCreatedData } from '../types.js';

// Recently seen messages, for the server log.
//
// A delete event carries the deleted text, and an edit event carries the
// text before the edit, so neither needs this for the words themselves.
// What they do not carry:
//   - whether the author is a bot (the "ignore bots" setting);
//   - the author's name, for embeds, which never resolve mention tokens;
//   - anything at all for a bulk delete, which is only a list of ids.
// It is also the fallback for an edit's "before" text when the backend is
// older than the previousContent field.
//
// In memory and bounded: a message older than the window (or from before a
// restart) is logged without these details, which is the same trade every
// logging bot makes.

export interface RecentMessage {
  serverId: string;
  channelId: string;
  senderId: string;
  authorName: string | null;
  isBot: boolean;
  content: string;
}

const MAX_MESSAGES = 20_000;
// Enough for any embed we build; a pasted novel doesn't need to sit in RAM.
const MAX_CONTENT = 2_000;

const recent = new Map<string, RecentMessage>();

function put(id: string, msg: RecentMessage): void {
  // Re-inserting moves the key to the end, so eviction stays oldest-first.
  recent.delete(id);
  recent.set(id, msg);
  if (recent.size > MAX_MESSAGES) {
    const oldest = recent.keys().next().value;
    if (oldest !== undefined) recent.delete(oldest);
  }
}

export function rememberMessage(msg: MessageCreatedData): void {
  if (!msg.id || !msg.serverId || !msg.channelId) return;
  put(msg.id, {
    serverId: msg.serverId,
    channelId: msg.channelId,
    senderId: msg.senderId,
    authorName: msg.author?.name ?? null,
    isBot: msg.author?.isBot === true,
    content: (msg.content ?? '').slice(0, MAX_CONTENT),
  });
}

export function recentMessage(id: string): RecentMessage | undefined {
  return recent.get(id);
}

// After an edit, so the next edit's "before" is this edit's "after".
export function updateRecentContent(id: string, content: string): void {
  const existing = recent.get(id);
  if (existing) put(id, { ...existing, content: content.slice(0, MAX_CONTENT) });
}

export function forgetMessage(id: string): void {
  recent.delete(id);
}
