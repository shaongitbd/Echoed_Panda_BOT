import type { EchoedClient } from '../client/echoedClient.js';
import type { MessageCreatedData } from '../types.js';
import { getRulesForServer, type KeywordRule } from './store.js';
import { log } from '../log.js';

// Per-rule compiled regex cache. Lifetime tied to the rule store's
// cache invalidation — when an admin edits the list, the next read
// rebuilds these on first hit.
const regexCache = new Map<number, RegExp>();

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getRegex(rule: KeywordRule): RegExp {
  let re = regexCache.get(rule.id);
  if (!re) {
    re = new RegExp(`\\b${escapeRe(rule.phrase)}\\b`, 'i');
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

    try {
      await api.sendMessage({
        serverId: msg.serverId,
        channelId: msg.channelId,
        content: rule.response,
      });
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
