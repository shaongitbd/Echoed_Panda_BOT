import type { EchoedClient } from '../client/echoedClient.js';
import type { MemberJoinedData } from '../types.js';
import { claimBotWelcome } from '../db/guildConfig.js';
import { log } from '../log.js';

const DASHBOARD_URL = 'https://memebot.echoed.gg';

// Posted once per server, the first time the bot is added. Atomic claim
// in `claimBotWelcome` prevents double-sending on socket reconnects /
// duplicate SERVER_MEMBER_ADD events. Existing servers (already had the
// bot before this rolled out) have NULL bot_welcomed_at by default and
// will receive the welcome on their next add — to avoid retroactively
// spamming current servers, the migration leaves the column NULL but
// install events for already-installed bots don't re-fire so they stay
// quiet.
function buildWelcomeContent(serverName: string, ownerMention: string | null): string {
  const greeting = ownerMention
    ? `Hi ${ownerMention}, thanks for adding me to **${serverName}**!`
    : `Thanks for adding me to **${serverName}**!`;

  return [
    `# 👋 Welcome to **Panda Bot**!`,
    ``,
    greeting,
    ``,
    `## What I can do`,
    `- 🎵 **Music** — \`!play\`, \`!skip\`, \`!queue\` (YouTube + SoundCloud), DJ role gating`,
    `- 📊 **Levels** — XP per message, role rewards, leaderboards`,
    `- 🛡️ **Moderation** — \`!timeout\`, \`!kick\`, \`!ban\`, \`!warn\` with mod-log`,
    `- 🚫 **Auto-mod** — 8 filters (spam · links · caps · mentions · emoji · zalgo · invites · bad-words)`,
    `- 👋 **Welcome flows** — auto-greet new members, auto-assign roles`,
    `- ⭐ **Reaction roles** — give roles when reacting`,
    `- 📅 **Scheduled messages** — post on a schedule`,
    `- 📡 **Social alerts** — Reddit · Twitch · YouTube notifications`,
    `- 🎉 **Giveaways** — \`!gstart\`, \`!greroll\`, role-scoped entry`,
    `- 🛟 **Anti-raid** — auto-lockdown on join floods`,
    ``,
    `## Configure`,
    `Open the dashboard to set everything up: ${DASHBOARD_URL}`,
    ``,
    `_Free, open source, no premium tier. Type \`!help\` for the full command list._`,
  ].join('\n');
}

/**
 * Fired when SERVER_MEMBER_ADD arrives with the bot's own user ID — i.e.
 * the bot was just invited to this server. Sends a welcome card to the
 * first text channel the bot can post in.
 *
 * Idempotent across reconnects via `claimBotWelcome`. Channel selection
 * picks the lowest-position text channel — no "system" channel concept
 * exists in Echoed, so this is the closest analogue to "the place the
 * server owner expects bot announcements".
 *
 * Errors are logged but never thrown — a failed welcome shouldn't block
 * the rest of the bot's onboarding (auto-role assignment, etc.).
 */
export async function handleBotJoinedServer(
  api: EchoedClient,
  data: MemberJoinedData,
): Promise<void> {
  const { serverId } = data;

  // Atomic dedup. If another worker / replay already welcomed this
  // server, claim returns false and we exit silently.
  let isFirstTime: boolean;
  try {
    isFirstTime = await claimBotWelcome(serverId);
  } catch (err) {
    log.error({ err, serverId }, 'claimBotWelcome failed — skipping welcome');
    return;
  }
  if (!isFirstTime) {
    log.debug({ serverId }, 'Bot already welcomed this server, skipping');
    return;
  }

  // Best-effort lookups. If either fails we degrade gracefully —
  // server name falls back to "this server", owner mention falls back
  // to nothing.
  let serverName = 'this server';
  let ownerMention: string | null = null;
  try {
    const info = await api.getServerInfo(serverId);
    if (info.name) serverName = info.name;
    if (info.ownerId) ownerMention = `<@${info.ownerId}>`;
  } catch (err) {
    log.warn({ err, serverId }, 'getServerInfo failed during bot welcome — using fallbacks');
  }

  // Find a text channel to post in. Pick the lowest-position text
  // channel — that's typically what users think of as "general".
  let channels;
  try {
    channels = await api.listChannels(serverId);
  } catch (err) {
    log.warn({ err, serverId }, 'listChannels failed — bot welcome will not post');
    return;
  }

  const targetChannel = channels
    .filter((c) => c.type === 'text')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0];

  if (!targetChannel) {
    log.warn({ serverId }, 'No text channel found for bot welcome');
    return;
  }

  const content = buildWelcomeContent(serverName, ownerMention);

  try {
    await api.sendMessage({
      serverId,
      channelId: targetChannel.id,
      content,
    });
    log.info(
      { serverId, channelId: targetChannel.id, channelName: targetChannel.name },
      'Bot welcome message sent',
    );
  } catch (err) {
    // We already claimed the welcome flag, so we won't retry on next
    // event. This is intentional — if posting fails for permission
    // reasons (bot can't see/post in any channel), retrying every
    // reconnect would just spam errors. The owner can re-invite or
    // run /help manually.
    log.warn({ err, serverId, channelId: targetChannel.id }, 'Bot welcome message send failed');
  }
}
