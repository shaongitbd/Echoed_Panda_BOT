import type { EchoedClient } from '../client/echoedClient.js';
import type { PermissionService } from '../auth/permissions.js';
import { log } from '../log.js';
import { fetchMemberRoles } from '../util/memberRoles.js';
import { registerTtlCache } from '../util/ttlCache.js';
import {
  applicableRules,
  checkRules,
  getCommandRules,
  hasChannelOrRoleRule,
  needsRoles,
  type CommandRule,
  type Denial,
} from './settings.js';

interface AccessInput {
  serverId: string;
  channelId: string;
  senderId: string;
  messageId: string;
  prefix: string;
}

export interface AccessResult {
  // The rules that apply, broadest first — the dispatcher reads cooldown and
  // delete-after-use from them.
  applicable: CommandRule[];
  allowed: boolean;
}

// A redirect hint is posted at most once per member, command and channel per
// window, so someone retrying doesn't make the bot spam its own hint.
const HINT_WINDOW_MS = 30 * 1000;
const HINT_TTL_MS = 8 * 1000;
const lastHint = new Map<string, { expiresAt: number }>();
registerTtlCache('commandAccessHints', lastHint, 10_000);

export async function checkCommandAccess(
  api: EchoedClient,
  perms: PermissionService,
  input: AccessInput,
  command: string,
  category: string | null,
): Promise<AccessResult> {
  let rules;
  try {
    rules = await getCommandRules(input.serverId);
  } catch (err) {
    // The table is read on every command; if Postgres blips, run the command
    // rather than make the whole bot go quiet.
    log.warn({ err, serverId: input.serverId }, 'Command rules unavailable — allowing');
    return { applicable: [], allowed: true };
  }
  const applicable = applicableRules(rules, command, category);
  if (applicable.length === 0) return { applicable, allowed: true };

  let isManager = false;
  if (hasChannelOrRoleRule(applicable)) {
    try {
      isManager = await perms.has(input.serverId, input.senderId, 'MANAGE_SERVER');
    } catch {
      isManager = false;
    }
  }
  const roles =
    !isManager && needsRoles(applicable)
      ? await fetchMemberRoles(api, input.serverId, input.senderId)
      : [];

  const denial = checkRules(applicable, input.channelId, roles, isManager);
  if (!denial) return { applicable, allowed: true };

  log.debug({ command, denial, channelId: input.channelId }, 'Command blocked by rule');
  await explainDenial(api, input, command, denial);
  return { applicable, allowed: false };
}

// Only a channel rule gets a reply: pointing someone at the right channel is
// useful. A disabled command or a role they lack stays silent, as MEE6 does —
// announcing "you can't use this" to a room is noise.
async function explainDenial(
  api: EchoedClient,
  input: AccessInput,
  command: string,
  denial: Denial,
): Promise<void> {
  if (denial.kind !== 'channel') return;

  const key = `${input.channelId}:${input.senderId}:${command}`;
  const seen = lastHint.get(key);
  if (seen && seen.expiresAt > Date.now()) return;
  lastHint.set(key, { expiresAt: Date.now() + HINT_WINDOW_MS });

  const where = denial.allowedChannelIds.slice(0, 3).map((id) => `<#${id}>`);
  const content =
    where.length > 0
      ? `\`${input.prefix}${command}\` works in ${where.join(', ')}.`
      : `\`${input.prefix}${command}\` is turned off in this channel.`;

  try {
    const sent = await api.sendMessage({
      serverId: input.serverId,
      channelId: input.channelId,
      replyToId: input.messageId,
      content,
    });
    // The hint is for the person who tried; clear it so it doesn't sit in
    // the channel.
    setTimeout(() => {
      api.deleteMessage(input.serverId, sent.messageId).catch(() => undefined);
    }, HINT_TTL_MS).unref();
  } catch (err) {
    log.debug({ err, command }, 'Command redirect hint failed');
  }
}
