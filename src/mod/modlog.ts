import type { EchoedClient } from '../client/echoedClient.js';
import { getGuildConfig } from '../db/guildConfig.js';
import { log } from '../log.js';

export type ModAction =
  | 'kick'
  | 'ban'
  | 'unban'
  | 'timeout'
  | 'untimeout'
  | 'warn'
  | 'purge';

interface ModLogInput {
  serverId: string;
  action: ModAction;
  // ID of the affected user, or null for action that don't target a
  // single user (e.g. !purge).
  targetId: string | null;
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
};

const VERB: Record<ModAction, string> = {
  kick: 'Kicked',
  ban: 'Banned',
  unban: 'Unbanned',
  timeout: 'Timed out',
  untimeout: 'Removed timeout from',
  warn: 'Warned',
  purge: 'Purged messages by',
};

// Best-effort post to the server's configured mod-log channel. Failures
// are logged but never bubble up — the actual moderation action already
// succeeded by the time we get here.
export async function postModAction(
  api: EchoedClient,
  input: ModLogInput,
): Promise<void> {
  const cfg = await getGuildConfig(input.serverId);
  if (!cfg.modlogChannel) return;

  const lines: string[] = [];
  const targetText = input.targetId ? `<@${input.targetId}>` : 'channel';
  lines.push(`${EMOJI[input.action]} **${VERB[input.action]}** ${targetText}`);
  if (input.extra) lines.push(`Duration: ${input.extra}`);
  lines.push(`Moderator: <@${input.actorId}>`);
  if (input.reason) lines.push(`Reason: ${input.reason}`);

  try {
    await api.sendMessage({
      serverId: input.serverId,
      channelId: cfg.modlogChannel,
      content: lines.join('\n'),
    });
  } catch (err) {
    log.warn(
      { err, serverId: input.serverId, action: input.action, channelId: cfg.modlogChannel },
      'Mod-log post failed',
    );
  }
}
