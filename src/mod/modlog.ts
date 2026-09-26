import type { EchoedClient } from '../client/echoedClient.js';
import { getGuildConfig } from '../db/guildConfig.js';
import { escapeMentions } from '../client/text.js';
import { log } from '../log.js';
import { createCase, setCaseModlogMessage, type CaseAction, type ModCase } from './cases.js';

export type ModAction = CaseAction;

interface ModLogInput {
  serverId: string;
  action: ModAction;
  // ID of the affected user, or null for action that don't target a
  // single user (e.g. !purge).
  targetId: string | null;
  // For actions on a channel (lock/unlock): named instead of a user.
  targetChannelId?: string;
  actorId: string;
  reason?: string | null;
  // Free-form extra context, e.g. "1h30m" for timeout, "12 messages" for purge.
  extra?: string;
}

const EMOJI: Record<ModAction, string> = {
  kick: '👢',
  ban: '🔨',
  unban: '🕊️',
  timeout: '🔇',
  untimeout: '🔊',
  warn: '⚠️',
  purge: '🧹',
  lock: '🔒',
  unlock: '🔓',
  note: '📝',
};

const VERB: Record<ModAction, string> = {
  kick: 'Kicked',
  ban: 'Banned',
  unban: 'Unbanned',
  timeout: 'Timed out',
  untimeout: 'Removed timeout from',
  warn: 'Warned',
  purge: 'Purged messages by',
  lock: 'Locked',
  unlock: 'Unlocked',
  note: 'Note on',
};

export function actionVerb(action: ModAction): string {
  return VERB[action];
}

// The mod-log line for a case. Kept a pure function of the case, so a later
// `!reason` can re-render the post exactly as it would have been written.
export function renderModlogEntry(c: ModCase): string {
  const lines: string[] = [];
  const targetText = c.targetId
    ? `<@${c.targetId}>`
    : c.targetChannelId
      ? `<#${c.targetChannelId}>`
      : 'channel';
  lines.push(`${EMOJI[c.action]} **${VERB[c.action]}** ${targetText} · Case #${c.caseNumber}`);
  if (c.extra) lines.push(`Duration: ${c.extra}`);
  lines.push(`Moderator: <@${c.actorId}>`);
  // The reason is free text from a moderator — it must not be able to
  // ping through the bot.
  if (c.reason) lines.push(`Reason: ${escapeMentions(c.reason)}`);
  return lines.join('\n');
}

// Record a moderation action as a numbered case, then post it to the
// server's mod-log channel. Returns the case, or null when even recording
// it failed. Failures never bubble up — the action itself already
// succeeded by the time we get here.
//
// Notes are recorded but never posted: they are a moderator's private
// memory of a member, read back with `!modlogs`.
export async function postModAction(
  api: EchoedClient,
  input: ModLogInput,
): Promise<ModCase | null> {
  let modCase: ModCase;
  try {
    modCase = await createCase({
      serverId: input.serverId,
      action: input.action,
      targetId: input.targetId,
      targetChannelId: input.targetChannelId ?? null,
      actorId: input.actorId,
      reason: input.reason ?? null,
      extra: input.extra ?? null,
    });
  } catch (err) {
    log.warn({ err, serverId: input.serverId, action: input.action }, 'Case record failed');
    return null;
  }
  if (input.action === 'note') return modCase;

  const cfg = await getGuildConfig(input.serverId);
  // Fall back to the welcome channel when no mod-log is set. On a server
  // where auto-setup couldn't run, every moderation action — including an
  // anti-raid lockdown and every heuristic kick — was recorded nowhere at
  // all, which is exactly when someone needs to be able to see it.
  const channelId = cfg.modlogChannel ?? cfg.welcomeChannel;
  if (!channelId) return modCase;

  try {
    const sent = await api.sendMessage(
      {
        serverId: input.serverId,
        channelId,
        content: renderModlogEntry(modCase),
      },
      { priority: 'background' },
    );
    if (sent?.messageId) {
      await setCaseModlogMessage(input.serverId, modCase.caseNumber, channelId, sent.messageId);
      modCase = { ...modCase, modlogChannelId: channelId, modlogMessageId: sent.messageId };
    }
  } catch (err) {
    log.warn(
      { err, serverId: input.serverId, action: input.action, channelId },
      'Mod-log post failed',
    );
  }
  return modCase;
}
