import type { EchoedClient } from '../client/echoedClient.js';
import type { MemberJoinedData } from '../types.js';
import { getGuildConfig } from '../db/guildConfig.js';
import { resolveServerName } from '../client/names.js';
import { log } from '../log.js';

const DEFAULT_WELCOME_MESSAGE = 'Welcome to **{server}**, {user}! You\'re member #{membercount}.';

interface TemplateVars {
  userId: string;
  serverName: string | null;
  memberCount: number | null;
}

// Substitute placeholders. We deliberately keep the syntax minimal —
// `{user}` becomes a mention, `{server}` the name, `{membercount}` the
// post-join total. Anything fancier (random pick lists, embed builder,
// etc.) is post-MVP.
function renderTemplate(template: string, vars: TemplateVars): string {
  return template
    .replace(/\{user\}/g, `<@${vars.userId}>`)
    .replace(/\{server\}/g, vars.serverName ?? 'this server')
    .replace(/\{membercount\}/g, vars.memberCount != null ? String(vars.memberCount) : '?');
}

// handleMemberJoined runs the welcome flow + auto-role assignment in
// parallel. Welcome message and auto-role are independent: a missing
// channel doesn't block the role grant, and a missing role doesn't
// block the message. Both branches handle their own errors.
export async function handleMemberJoined(
  api: EchoedClient,
  data: MemberJoinedData,
): Promise<void> {
  const cfg = await getGuildConfig(data.serverId);

  // Fast exit: no welcome flow AND no auto-role configured.
  if (!cfg.welcomeChannel && !cfg.autoroleId) return;

  await Promise.allSettled([
    sendWelcome(api, cfg, data),
    assignAutoRole(api, cfg, data),
  ]);
}

async function sendWelcome(
  api: EchoedClient,
  cfg: { welcomeChannel: string | null; welcomeMessage: string | null },
  data: MemberJoinedData,
): Promise<void> {
  if (!cfg.welcomeChannel) return;

  const template = cfg.welcomeMessage ?? DEFAULT_WELCOME_MESSAGE;
  // The join payload has no server name, so look it up — the default
  // template leads with {server}, and without this every server that never
  // customised its greeting welcomes people to "this server". Cached, so
  // it's one lookup per server per TTL rather than one per join.
  const serverName = template.includes('{server}')
    ? await resolveServerName(api, data.serverId)
    : null;
  const content = renderTemplate(template, {
    userId: data.userId,
    serverName,
    memberCount: data.memberCount ?? null,
  });

  try {
    await api.sendMessage({
      serverId: data.serverId,
      channelId: cfg.welcomeChannel,
      content,
      // The template renders {user} into content, where it resolves. Naming
      // them here too makes the mention reliable.
      mentions: [data.userId],
    });
  } catch (err) {
    log.warn(
      { err, serverId: data.serverId, userId: data.userId, channelId: cfg.welcomeChannel },
      'Welcome message send failed',
    );
  }
}

async function assignAutoRole(
  api: EchoedClient,
  cfg: { autoroleId: string | null },
  data: MemberJoinedData,
): Promise<void> {
  if (!cfg.autoroleId) return;

  try {
    await api.addRole(data.serverId, data.userId, cfg.autoroleId);
  } catch (err) {
    log.warn(
      { err, serverId: data.serverId, userId: data.userId, roleId: cfg.autoroleId },
      'Auto-role assign failed',
    );
  }
}
