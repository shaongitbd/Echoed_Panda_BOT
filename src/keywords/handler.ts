import type { EchoedClient } from '../client/echoedClient.js';
import type { MessageCreatedData } from '../types.js';
import { getRulesForServer, type KeywordRule } from './store.js';
import { log } from '../log.js';
import { escapeMentions } from '../client/text.js';

// Per-rule compiled regex cache. Lifetime tied to the rule store's
// cache invalidation — when an admin edits the list, the next read
// rebuilds these on first hit.
const regexCache = new Map<number, RegExp>();

// Per-rule-per-channel response cooldown. Keyword rules match on every message
// with no other throttle, so a common phrase (e.g. "gm", "gg", "f") could make
// the bot reply on every occurrence. Cap each rule to one response per channel
// per minute — fun phrases stay fun, active channels don't get flooded.
const RESPONSE_COOLDOWN_MS = 60 * 1000;
const lastFired = new Map<string, number>();

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Word boundaries only work next to word characters. Applying them
// unconditionally meant any phrase starting or ending in punctuation could
// never match anything: `\b` before the `:` of `:)` requires a word
// character immediately before it, which realistic text never has. That
// silently broke every emoji, emoticon and punctuated phrase — `🎉`, `:)`,
// `<3`, `o/`, `^_^`, `...`, `lol!` — while the command that saved them
// reported success.
export function buildKeywordRegex(phrase: string): RegExp {
  const escaped = escapeRe(phrase);
  const leading = /^\w/.test(phrase) ? '\\b' : '';
  const trailing = /\w$/.test(phrase) ? '\\b' : '';
  return new RegExp(`${leading}${escaped}${trailing}`, 'i');
}

function getRegex(rule: KeywordRule): RegExp {
  let re = regexCache.get(rule.id);
  if (!re) {
    re = buildKeywordRegex(rule.phrase);
    regexCache.set(rule.id, re);
  }
  return re;
}

// Run keyword rules against a fresh message. We fire AT MOST ONE
// response per message — multiple matches all from the same incoming
// message would otherwise spam. The first match (in DB order) wins.
export async function processKeywords(
  api: EchoedClient,
  msg: MessageCreatedData,
): Promise<void> {
  const rules = await getRulesForServer(msg.serverId);
  if (rules.length === 0) return;

  for (const rule of rules) {
    if (rule.channelId && rule.channelId !== msg.channelId) continue;
    const re = getRegex(rule);
    if (!re.test(msg.content)) continue;

    // Matched — but throttle per rule+channel so common phrases don't spam.
    // A cooled-down match still counts as "handled" (we return), so we don't
    // cascade to another rule and fire a different response on the same message.
    const cdKey = `${rule.id}:${msg.channelId}`;
    if (Date.now() - (lastFired.get(cdKey) ?? 0) < RESPONSE_COOLDOWN_MS) return;

    // Stamp the throttle BEFORE sending, not after. Recording it only on
    // success means a channel we can't post in never starts its cooldown,
    // so every matching message retries — and the default keyword set
    // matches very common words.
    lastFired.set(cdKey, Date.now());
    try {
      await api.sendMessage(
        {
          serverId: msg.serverId,
          channelId: msg.channelId,
          // Member-authored response text.
          content: escapeMentions(rule.response),
        },
        { priority: 'background' },
      );
    } catch (err) {
      log.warn({ err, ruleId: rule.id }, 'Keyword response send failed');
    }
    return; // first match wins
  }
}

// Drop any cached regex when a rule is removed. We could clear the
// whole cache instead — both work, this is just slightly tidier.
export function forgetRule(id: number): void {
  regexCache.delete(id);
}
