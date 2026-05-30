import type { EchoedClient } from '../client/echoedClient.js';
import type { MemberJoinedData } from '../types.js';
import type { PermissionService, Permission } from '../auth/permissions.js';
import { config } from '../config.js';
import { claimBotWelcome, claimLevelPermsNag, clearLevelPermsNag } from '../db/guildConfig.js';
import { provisionLevelRoles } from '../levels/provision.js';
import { runEngagementSetup } from '../engagement/autoSetup.js';
import { log } from '../log.js';

const DASHBOARD_URL = 'https://memebot.echoed.gg';

// Posted in-channel when the bot can't create the level roles for lack of
// permission. Gives the two concrete fixes an admin can take.
const MISSING_PERMS_MESSAGE =
  `⚠️ I can't set up the **level system** here yet — I'm missing the **Manage Roles** permission.\n\n` +
  `**To fix it, do either:**\n` +
  `• Create a role with **Manage Roles** (or **Manage Server**) and assign it to me — I'll finish setting up automatically, **or**\n` +
  `• Remove me, then re-invite me and tick **Manage Roles** on the permission screen — that grants it for me automatically.`;

/**
 * provisionLevelRoles + a one-time in-channel notice when it fails for lack of
 * permission. Used by the startup reconcile and the permission self-heal. (The
 * fresh-invite welcome flow reports status in its welcome card and manages the
 * nag flag itself, so it doesn't go through here.) Spam-safe via
 * claimLevelPermsNag — the notice posts at most once until levels succeed.
 */
export async function provisionAndNotify(api: EchoedClient, serverId: string): Promise<boolean> {
  const ok = await provisionLevelRoles(api, serverId);
  if (ok) {
    try { await clearLevelPermsNag(serverId); } catch (err) { log.warn({ err, serverId }, 'clearLevelPermsNag failed'); }
    return true;
  }
  // Couldn't provision — almost always because the bot lacks Manage Roles.
  // Tell the server ONCE so an admin can grant it; the self-heal finishes later.
  let firstTime = false;
  try { firstTime = await claimLevelPermsNag(serverId); } catch (err) { log.warn({ err, serverId }, 'claimLevelPermsNag failed'); }
  if (!firstTime) return false;
  try {
    const channels = await api.listChannels(serverId);
    const target = channels
      .filter((c) => c.type === 'text')
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0];
    if (target) {
      await api.sendMessage({
        serverId,
        channelId: target.id,
        content: MISSING_PERMS_MESSAGE,
      });
    }
  } catch (err) {
    log.warn({ err, serverId }, 'Failed to post missing-perms notice');
  }
  return false;
}

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

// The capabilities Panda uses, the permission each needs, and what breaks
// without it. Drives the per-invite permission checklist so an admin who
// granted, say, everything-except-Manage-Server sees exactly what's on, what's
// off, and the consequence of each gap.
const CAPABILITIES: ReadonlyArray<{ perm: Permission; label: string; without: string }> = [
  // Foundational
  { perm: 'VIEW_CHANNELS',        label: 'View Channels',        without: "I can't see channels here — most features won't work" },
  { perm: 'SEND_MESSAGES',        label: 'Send Messages',        without: "I can't reply or post anything at all" },
  { perm: 'READ_MESSAGE_HISTORY', label: 'Read Message History', without: 'I miss context for commands & auto-mod' },
  { perm: 'EMBED_LINKS',          label: 'Embed Links',          without: 'leaderboards & rich cards show as plain text' },
  { perm: 'ADD_REACTIONS',        label: 'Add Reactions',        without: "reaction-roles, polls & giveaways can't seed reactions" },
  // Management. NOTE: Echoed has no standalone "Manage Messages" — Manage
  // Channels is the umbrella and *implies* message moderation (delete/purge),
  // task & event management, and member-move, both in the role editor and in
  // the permission service (isImpliedByManageChannels). So we list Manage
  // Channels once and spell out everything it unlocks; a separate Manage
  // Messages line would just mirror it and read as a second thing to grant.
  { perm: 'MANAGE_ROLES',        label: 'Manage Roles',         without: 'no level rewards, reaction roles, or auto-roles' },
  { perm: 'MANAGE_CHANNELS',      label: 'Manage Channels',      without: "auto-mod can't delete flagged messages, no purge, and temp voice/text channels can't be created" },
  // Moderation
  { perm: 'KICK_MEMBERS',         label: 'Kick Members',         without: 'no kicks, and anti-raid auto-kick is disabled' },
  { perm: 'BAN_MEMBERS',          label: 'Ban Members',          without: 'no bans' },
  { perm: 'MUTE_MEMBERS',         label: 'Mute Members',         without: "I can't timeout / untimeout members" },
  { perm: 'MANAGE_SERVER',        label: 'Manage Server',        without: "I can't engage raid lockdown" },
  // Voice (music)
  { perm: 'CONNECT',              label: 'Connect to Voice',     without: "I can't join voice to play music" },
  { perm: 'SPEAK',                label: 'Speak',                without: "I can't play music" },
];

// Build the per-permission checklist for the bot on a server. Granted perms get
// a ✅; missing ones get a ❌ plus the feature impact. Returns the message body.
// Exported so the on-demand `!checkperms` admin command can render the same
// report the auto-post uses — one source of truth for what Panda needs.
export async function buildPermissionReport(
  perms: PermissionService,
  botUserId: string,
  serverId: string,
): Promise<string> {
  const lines: string[] = [];
  let missing = 0;
  for (const cap of CAPABILITIES) {
    // Best-effort per perm — a check that errors counts as "not granted" so we
    // surface it rather than silently claiming the feature works.
    let ok = false;
    try {
      ok = await perms.has(serverId, botUserId, cap.perm);
    } catch {
      ok = false;
    }
    if (ok) {
      lines.push(`✅ **${cap.label}**`);
    } else {
      missing++;
      lines.push(`❌ **${cap.label}** — without it, ${cap.without}`);
    }
  }

  const header =
    missing === 0
      ? `## ✅ Permissions — all good!\nEverything I do is enabled here:`
      : `## ⚠️ Permission check — ${missing} missing\nHere's what I can and can't do right now:`;
  const footer =
    missing === 0
      ? ''
      : `\n\n**To grant the missing ones, either:**\n` +
        `• Add them to a role assigned to me, **or**\n` +
        `• Remove me and re-invite me, ticking them on the permission screen.`;
  // The checks above are SERVER-WIDE. Per-channel overrides can grant access in
  // specific channels that this server-level view won't reflect — say so, so a
  // channel-only grant doesn't look like the feature is fully dead.
  const channelNote =
    `\n\n_This reflects my **server-wide** access. If you grant a permission in only certain channels ` +
    `(via channel overrides), I'll still work in those channels even if it shows ❌ above._`;
  return `${header}\n\n${lines.join('\n')}${footer}${channelNote}`;
}

/**
 * Fired when SERVER_MEMBER_ADD arrives with the bot's own user ID — i.e. the
 * bot was just invited. Posts (to the lowest-position text channel):
 *   - a one-time welcome card (first invite only, via claimBotWelcome), and
 *   - a permission checklist EVERY invite — so re-invites (after a remove)
 *     re-report the bot's current capabilities, which is exactly when an admin
 *     wants to confirm what they granted this time.
 * Also auto-provisions the level ladder (idempotent; non-destructive removal
 * means a re-invite finds the existing rewards and leaves ranks intact).
 *
 * Errors are logged, never thrown.
 */
export async function handleBotJoinedServer(
  api: EchoedClient,
  perms: PermissionService,
  botUserId: string,
  data: MemberJoinedData,
): Promise<void> {
  const { serverId } = data;

  // One-shot welcome card vs. always-posted permission report. claimBotWelcome
  // is true only the first time; the report posts on every invite regardless.
  let isFirstTime = false;
  try {
    isFirstTime = await claimBotWelcome(serverId);
  } catch (err) {
    log.warn({ err, serverId }, 'claimBotWelcome failed — posting report without welcome card');
  }

  // First-ever invite + the bot actually has the perms to finish → run the FULL
  // engagement auto-setup (levels + QOTD + birthdays + starboard + counting +
  // daily). Gated because a half-done setup on a fresh server reads as broken:
  // we require Manage Roles (reward roles) AND Manage Channels (to create the
  // #starboard / #counting channels). Without both, we DON'T impose a partial
  // setup — we provision just levels (if we can) and nudge the admin to grant
  // perms + run !setup. Only on the first invite (claimBotWelcome), so a remove
  // + re-invite never re-creates channels or re-runs setup (configs persist via
  // non-destructive removal anyway).
  let autoSetupLines: string[] | null = null;
  let levelsReady = false;
  if (isFirstTime) {
    const [hasRoles, hasChannels] = await Promise.all([
      perms.has(serverId, botUserId, 'MANAGE_ROLES').catch(() => false),
      perms.has(serverId, botUserId, 'MANAGE_CHANNELS').catch(() => false),
    ]);
    if (hasRoles && hasChannels) {
      try {
        autoSetupLines = await runEngagementSetup(api, serverId, {
          override: false,
          prefix: config.defaultPrefix,
        });
        levelsReady = true; // gated on Manage Roles, so the ladder provisioned
      } catch (err) {
        log.warn({ err, serverId }, 'First-join auto-setup failed');
      }
    }
  }

  // Fallback when we didn't run the full setup (re-invite, or first join without
  // enough perms): still provision the level ladder (idempotent, needs only
  // Manage Roles) so the visible-badge hook works.
  if (autoSetupLines === null) {
    levelsReady = await provisionLevelRoles(api, serverId);
  }
  try {
    if (levelsReady) await clearLevelPermsNag(serverId);
    else await claimLevelPermsNag(serverId); // report below covers the "missing" case
  } catch (err) {
    log.warn({ err, serverId }, 'level perms nag flag update failed');
  }

  // Permission checklist — always built. Owner mention / server name only
  // needed for the first-time welcome card.
  const report = await buildPermissionReport(perms, botUserId, serverId);

  let content: string;
  if (isFirstTime) {
    let serverName = 'this server';
    let ownerMention: string | null = null;
    try {
      const info = await api.getServerInfo(serverId);
      if (info.name) serverName = info.name;
      if (info.ownerId) ownerMention = `<@${info.ownerId}>`;
    } catch (err) {
      log.warn({ err, serverId }, 'getServerInfo failed during bot welcome — using fallbacks');
    }
    content = buildWelcomeContent(serverName, ownerMention);
    if (autoSetupLines) {
      // Full auto-setup ran — show what got configured.
      content += `\n\n## ✅ I set everything up for you\n${autoSetupLines.join('\n')}`;
    } else {
      // Couldn't full-auto — note levels (if they provisioned) + nudge.
      if (levelsReady) {
        content += `\n\n✅ **Levels are live** — members earn XP as they chat and unlock a colored level badge next to their name.`;
      }
      content += `\n\n💡 **Want the full experience?** Grant me **Manage Roles** + **Manage Channels**, then run \`${config.defaultPrefix}setup\` — I'll auto-configure daily questions, a starboard, a counting game & birthdays.`;
    }
    content += `\n\n${report}`;
  } else {
    content = report;
  }

  // Lowest-position text channel the bot can actually post in. Checking SEND
  // per-channel matters when Send Messages was granted only via a channel
  // override (not server-wide) — otherwise we'd post to a channel we can't
  // speak in and the message would silently 403. Falls back to the first text
  // channel if we can't confirm any (best-effort).
  let channels;
  try {
    channels = await api.listChannels(serverId);
  } catch (err) {
    log.warn({ err, serverId }, 'listChannels failed — bot join message will not post');
    return;
  }
  const textChannels = channels
    .filter((c) => c.type === 'text')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  let targetChannel = textChannels[0];
  if (!targetChannel) {
    log.warn({ serverId }, 'No text channel found for bot join message');
    return;
  }
  for (const ch of textChannels) {
    try {
      if (await perms.hasIn(serverId, ch.id, botUserId, 'SEND_MESSAGES')) {
        targetChannel = ch;
        break;
      }
    } catch {
      /* fall through — keep the default */
    }
  }

  try {
    await api.sendMessage({ serverId, channelId: targetChannel.id, content });
    log.info({ serverId, channelId: targetChannel.id, firstTime: isFirstTime }, 'Bot join message sent');
  } catch (err) {
    log.warn({ err, serverId, channelId: targetChannel.id }, 'Bot join message send failed');
  }
}
