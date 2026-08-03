import type { EchoedClient, ChannelInfo } from '../client/echoedClient.js';
import { provisionLevelRoles } from '../levels/provision.js';
import { getRewardsInRange, clearLevelRewards } from '../levels/levelUp.js';
import { setLevelSettings } from '../db/levelSettings.js';
import { getQotdConfig, setQotdConfig } from '../qotd/store.js';
import { getBirthdayConfig, setBirthdayConfig } from '../birthday/store.js';
import { getStarboardConfig, setStarboardConfig } from '../starboard/store.js';
import { getCountingConfig, setCountingConfig } from '../counting/store.js';
import { getGuildConfig, setGuildConfig } from '../db/guildConfig.js';
import { getAutomodConfig, setAutomodConfig } from '../automod/config.js';
import { getRulesForServer, addRule } from '../keywords/store.js';
import { parseDailyTime, nextDailyRunJittered } from '../util/parse.js';
import { log } from '../log.js';

// Recommended defaults. Times are UTC (per-server timezones are a later
// polish) — QOTD lands midday-US / evening-EU, birthdays in the morning.
const QOTD_TIME = '16:00';
const BIRTHDAY_TIME = '12:00';

const GENERAL_HINTS = ['general', 'general-chat', 'chat', 'lounge', 'main', 'home', 'hangout'];
const STARBOARD_HINTS = ['starboard', 'highlights', 'star-board', 'best-of'];
const COUNTING_HINTS = ['counting', 'count', 'counting-game'];
const WELCOME_HINTS = ['welcome', 'introductions', 'intros', 'intro', 'lobby', 'gate'];
const COMMAND_HINTS = ['bot-commands', 'commands', 'bot-spam', 'bot', 'commands-and-bots'];
const MODLOG_HINTS = ['mod-log', 'modlog', 'mod-logs', 'audit-log', 'audit-logs', 'logs'];

// Newcomer role auto-assigned on join (panda's onJoin assigns guild_config
// autorole_id via api.addRole — verified working). HOISTED so new folks show
// as their own group in the member sidebar (easy to spot + greet); a hook for
// "new here" greetings, onboarding channels, slowmode-by-role, etc.
const NEWCOMER_ROLE = { name: 'Newcomer', color: '#9CA3AF' };

// Channel names that are almost never the place to drop QOTD/birthday posts —
// read-only/system/purpose channels. Used to keep the "general" fallback from
// landing on #rules / #announcements when no general-named channel exists.
const NON_GENERAL_NAMES = new Set([
  'rules', 'rule', 'announcements', 'announcement', 'announce', 'news', 'info',
  'information', 'faq', 'welcome', 'introductions', 'intros', 'intro', 'mod-log',
  'modlog', 'mod-logs', 'audit-log', 'logs', 'log', 'starboard', 'highlights',
  'counting', 'tickets', 'ticket', 'verify', 'verification', 'bot-commands',
  'bot-spam', 'roles', 'react-roles',
]);

// Auto-mod baseline tuned for a friendly-but-protected squad server. Values
// chosen to catch obvious abuse without nuking normal chatter. Owners/admins
// are exempt in the pipeline (MANAGE_SERVER bypass), so staff never trip these.
const AUTOMOD_SPEC = {
  enabled: true,
  spamEnabled: true,
  spamThreshold: 5,
  spamWindowSeconds: 15, // 5 messages / 15s
  mentionsEnabled: true,
  mentionsThreshold: 5,
  capsEnabled: true,
  capsThresholdPct: 70,
  capsMinLength: 15,
  emojiEnabled: true,
  emojiThreshold: 8,
  zalgoEnabled: true,
} as const;

// Starter keyword auto-responses. The keyword handler matches on word
// boundaries and (now) throttles each rule to once/min/channel, so these can't
// flood. Kept to wholesome, intentional phrases — nothing toxic.
const STARTER_KEYWORDS: ReadonlyArray<{ phrase: string; response: string }> = [
  { phrase: 'good bot', response: '🥺 thank you!' },
  { phrase: 'bad bot', response: "😔 i'll do better." },
  { phrase: 'gm', response: '☀️ gm! have a good one.' },
  { phrase: 'gn', response: '🌙 gn — rest well.' },
  { phrase: 'happy birthday', response: '🎂🎉' },
  { phrase: 'marco', response: 'polo 🌊' },
  { phrase: 'f', response: '🇫 respects paid.' },
  { phrase: 'gg', response: 'gg 🎮 well played' },
  { phrase: 'no u', response: '😤 no u' },
  { phrase: 'rip', response: '🪦 press f' },
];

// Starboard threshold scales with server size so it stays meaningful: a 3-star
// bar is special in a 20-person server, trivial in a 2000-person one.
function thresholdForSize(memberCount: number): number {
  if (memberCount >= 200) return 8;
  if (memberCount >= 50) return 5;
  return 3;
}

function findByName(channels: ChannelInfo[], hints: string[]): ChannelInfo | undefined {
  const set = new Set(hints);
  return channels.find((c) => c.type === 'text' && set.has(c.name.toLowerCase()));
}

// Lowest-position text channel, preferring a "general"-ish name — the home for
// announcement-style features (QOTD, birthdays).
export function pickGeneralChannel(channels: ChannelInfo[]): ChannelInfo | undefined {
  const text = channels
    .filter((c) => c.type === 'text')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  // 1. Prefer a channel literally named general/chat/lounge/etc. (case-insensitive).
  const named = text.find((c) => GENERAL_HINTS.includes(c.name.toLowerCase()));
  if (named) return named;
  // 2. Else the topmost text channel that isn't an obvious system/read-only one
  //    (so QOTD/birthdays don't land in #rules or #announcements).
  const chatty = text.find((c) => !NON_GENERAL_NAMES.has(c.name.toLowerCase()));
  return chatty ?? text[0];
}

// Find an existing channel by name, else create it. Returns null if creation
// fails (bot lacks Manage Channels) so the caller can report it.
async function ensureChannel(
  api: EchoedClient,
  serverId: string,
  channels: ChannelInfo[],
  hints: string[],
  createName: string,
  description: string,
): Promise<{ id: string; created: boolean } | null> {
  const existing = findByName(channels, hints);
  if (existing) return { id: existing.id, created: false };
  try {
    const res = await api.createChannel({ serverId, name: createName, type: 'text', description });
    return { id: res.channel.id, created: true };
  } catch (err) {
    log.warn({ err, serverId, createName }, 'Auto-setup channel create failed (missing Manage Channels?)');
    return null;
  }
}

export interface AutoSetupOptions {
  // override: reset every feature to defaults (replace existing level rewards,
  // re-enable + reconfigure each feature). Non-override skips anything already
  // configured.
  override: boolean;
  // Prefix used in report text (e.g. `!birthday set`).
  prefix: string;
  // Bot's own user ID — provenance for seeded keyword rules.
  actorId: string;
}

// Provision the full engagement + onboarding + moderation stack for a server
// and return human-readable report lines. Context-free (no command/socket
// dependency) so it's callable from both `!setup` and first-join auto-setup.
// Every step is best-effort; one feature failing never aborts the rest.
export async function runEngagementSetup(
  api: EchoedClient,
  serverId: string,
  opts: AutoSetupOptions,
): Promise<string[]> {
  const { override, prefix, actorId } = opts;
  const lines: string[] = [];

  let channels: ChannelInfo[];
  try {
    channels = await api.listChannels(serverId);
  } catch (err) {
    log.warn({ err, serverId }, 'Auto-setup listChannels failed');
    return ["⚠️ I couldn't read this server's channels (need **View Channels**)."];
  }

  // Announcement home for QOTD/birthdays. Rule: if a channel named "general"
  // already exists (case-insensitive), use it; otherwise CREATE #general. If we
  // can't create (no Manage Channels) AND nothing general exists, fall back to a
  // sensible existing chat channel so posts still have somewhere to land.
  let generalId: string;
  const existingGeneral = channels.find(
    (c) => c.type === 'text' && c.name.toLowerCase().includes('general'),
  );
  if (existingGeneral) {
    generalId = existingGeneral.id;
  } else {
    let created: ChannelInfo | null = null;
    try {
      const res = await api.createChannel({ serverId, name: 'general', type: 'text', description: '💬 Main chat.' });
      created = res.channel;
    } catch (err) {
      log.warn({ err, serverId }, 'Auto-setup could not create #general (missing Manage Channels?)');
    }
    if (created) {
      generalId = created.id;
      lines.push(`✅ **General** — created <#${created.id}> as the main chat`);
    } else {
      const fb = pickGeneralChannel(channels);
      if (!fb) return ["⚠️ No channel to post in, and I lack **Manage Channels** to create #general."];
      generalId = fb.id;
    }
  }

  let memberCount = 0;
  try {
    const info = await api.getServerInfo(serverId);
    memberCount = info.memberCount ?? 0;
  } catch {
    /* threshold falls back to the small-server default */
  }

  const gcfg = await getGuildConfig(serverId);

  // ── Welcome channel ────────────────────────────────────────────────
  let welcomeId = gcfg.welcomeChannel;
  if (override || !gcfg.welcomeChannel) {
    const ch = await ensureChannel(api, serverId, channels, WELCOME_HINTS, 'welcome', '👋 New members land here.');
    if (ch) {
      welcomeId = ch.id;
      lines.push(`✅ **Welcome** — greetings post to <#${ch.id}>${ch.created ? ' *(created)*' : ''}`);
    } else {
      lines.push('⚠️ **Welcome** — needs a channel; I lack **Manage Channels** to make one.');
    }
  } else {
    lines.push(`⏭️ **Welcome** — already set (<#${gcfg.welcomeChannel}>)`);
  }

  // ── Mod-log channel ────────────────────────────────────────────────
  let modlogId = gcfg.modlogChannel;
  if (override || !gcfg.modlogChannel) {
    const ch = await ensureChannel(api, serverId, channels, MODLOG_HINTS, 'mod-log', '🛡️ Moderation + auto-mod actions.');
    if (ch) {
      modlogId = ch.id;
      lines.push(`✅ **Mod-log** — actions log to <#${ch.id}>${ch.created ? ' *(created)*' : ''} — _lock @everyone's send in channel settings (I can't set per-role channel overrides)_`);
    } else {
      lines.push('⚠️ **Mod-log** — needs a channel; I lack **Manage Channels** to make one.');
    }
  } else {
    lines.push(`⏭️ **Mod-log** — already set (<#${gcfg.modlogChannel}>)`);
  }

  // ── Levels (+ command channel for level-ups, no-XP exclusions) ─────
  // The command channel only has meaning as the level-up destination, so it's
  // created/wired together with leveling.
  let doLevels = override;
  try {
    const existing = await getRewardsInRange(serverId, 1, 1000);
    if (!override && existing.length > 0) {
      lines.push(`⏭️ **Levels** — already set up (kept). \`${prefix}setup override\` to replace.`);
    } else {
      doLevels = true;
      if (override && existing.length > 0) await clearLevelRewards(serverId);

      // Command / bot-spam channel: level-ups go here to keep #general clean.
      let commandId: string | null = null;
      const cmdCh = await ensureChannel(api, serverId, channels, COMMAND_HINTS, 'bot-commands', '🤖 Bot replies & level-ups.');
      if (cmdCh) {
        commandId = cmdCh.id;
        lines.push(`✅ **Bot channel** — level-ups & bot replies → <#${cmdCh.id}>${cmdCh.created ? ' *(created)*' : ''}`);
      }

      // Exclude the bot/system channels from XP so they can't be farmed/spammed.
      const noXp = [welcomeId, commandId, modlogId].filter((x): x is string => !!x);
      await setLevelSettings(serverId, {
        enabled: true,
        stackRewards: false,
        levelUpChannel: commandId ?? generalId,
        noXpChannelIds: noXp,
      });
      const ok = await provisionLevelRoles(api, serverId, { force: true });
      lines.push(
        ok
          ? `✅ **Levels** — XP + reward roles (Lv 5→100); ${noXp.length} channel(s) excluded from XP`
          : `⚠️ **Levels** — I need **Manage Roles** to create the reward roles. Grant it and run \`${prefix}setup\` again.`,
      );
    }
  } catch (err) {
    log.warn({ err, serverId }, 'Auto-setup levels failed');
    lines.push('⚠️ **Levels** — something went wrong (check my permissions).');
  }

  // ── Newcomer auto-role ─────────────────────────────────────────────
  let autoroleId = gcfg.autoroleId;
  if (override || !gcfg.autoroleId) {
    try {
      const res = await api.createRole(serverId, {
        name: NEWCOMER_ROLE.name,
        color: NEWCOMER_ROLE.color,
        hoist: true,
        mentionable: false,
        position: 1,
      });
      if (res?.roleId) {
        autoroleId = res.roleId;
        lines.push('✅ **Newcomer role** — auto-assigned to everyone who joins');
      } else {
        lines.push('⚠️ **Newcomer role** — couldn\'t create it (need **Manage Roles**).');
      }
    } catch {
      lines.push('⚠️ **Newcomer role** — couldn\'t create it (need **Manage Roles**).');
    }
  } else {
    lines.push('⏭️ **Newcomer role** — auto-role already configured (kept)');
  }

  // ── Starboard ──────────────────────────────────────────────────────
  try {
    const cfg = await getStarboardConfig(serverId);
    if (!override && (cfg.enabled || cfg.channelId)) {
      lines.push('⏭️ **Starboard** — already set up (kept).');
    } else {
      const ch = await ensureChannel(api, serverId, channels, STARBOARD_HINTS, 'starboard', '⭐ The best messages, pinned by reactions.');
      if (!ch) {
        lines.push(`⚠️ **Starboard** — needs a channel; I lack **Manage Channels**. Run \`${prefix}starboard channel <#channel>\`.`);
      } else {
        const threshold = thresholdForSize(memberCount);
        await setStarboardConfig(serverId, { channelId: ch.id, enabled: true, emoji: '⭐', threshold });
        lines.push(`✅ **Starboard** — ${threshold}× ⭐ → <#${ch.id}>${ch.created ? ' *(created)*' : ''}`);
      }
    }
  } catch (err) {
    log.warn({ err, serverId }, 'Auto-setup starboard failed');
    lines.push('⚠️ **Starboard** — something went wrong.');
  }

  // ── Counting ───────────────────────────────────────────────────────
  try {
    const cfg = await getCountingConfig(serverId);
    if (!override && (cfg.enabled || cfg.channelId)) {
      lines.push('⏭️ **Counting** — already set up (kept).');
    } else {
      const ch = await ensureChannel(api, serverId, channels, COUNTING_HINTS, 'counting', '🔢 Count up together — one number per person, no doubles.');
      if (!ch) {
        lines.push(`⚠️ **Counting** — needs a channel; I lack **Manage Channels**. Run \`${prefix}counting channel <#channel>\`.`);
      } else {
        await setCountingConfig(serverId, { channelId: ch.id, enabled: true, currentCount: 0, lastUserId: null, resetOnFail: true });
        lines.push(`✅ **Counting** — in <#${ch.id}>${ch.created ? ' *(created)*' : ''}, start with **1**`);
      }
    }
  } catch (err) {
    log.warn({ err, serverId }, 'Auto-setup counting failed');
    lines.push('⚠️ **Counting** — something went wrong.');
  }

  // ── QOTD (posts to general) ────────────────────────────────────────
  try {
    const cfg = await getQotdConfig(serverId);
    if (!override && (cfg.enabled || cfg.channelId)) {
      lines.push('⏭️ **QOTD** — already set up (kept).');
    } else {
      const t = parseDailyTime(QOTD_TIME)!;
      await setQotdConfig(serverId, { channelId: generalId, enabled: true, dailyTime: QOTD_TIME, nextRunAt: nextDailyRunJittered(serverId, t.hh, t.mm) });
      lines.push(`✅ **QOTD** — daily at **${QOTD_TIME} UTC** → <#${generalId}>`);
    }
  } catch (err) {
    log.warn({ err, serverId }, 'Auto-setup qotd failed');
    lines.push('⚠️ **QOTD** — something went wrong.');
  }

  // ── Birthdays (announces in general) ───────────────────────────────
  try {
    const cfg = await getBirthdayConfig(serverId);
    if (!override && (cfg.enabled || cfg.channelId)) {
      lines.push('⏭️ **Birthdays** — already set up (kept).');
    } else {
      const t = parseDailyTime(BIRTHDAY_TIME)!;
      await setBirthdayConfig(serverId, { channelId: generalId, enabled: true, dailyTime: BIRTHDAY_TIME, nextRunAt: nextDailyRunJittered(serverId, t.hh, t.mm) });
      lines.push(`✅ **Birthdays** — daily at **${BIRTHDAY_TIME} UTC** → <#${generalId}> (members: \`${prefix}birthday set <MM-DD>\`)`);
    }
  } catch (err) {
    log.warn({ err, serverId }, 'Auto-setup birthdays failed');
    lines.push('⚠️ **Birthdays** — something went wrong.');
  }

  // ── Daily check-in (no config needed) ──────────────────────────────
  lines.push(`✅ **Daily check-in** — \`${prefix}daily\` is live (XP bonus + streaks)`);

  // ── Auto-mod ───────────────────────────────────────────────────────
  try {
    const amCfg = await getAutomodConfig(serverId);
    if (!override && amCfg.enabled) {
      lines.push('⏭️ **Auto-mod** — already on (kept).');
    } else {
      await setAutomodConfig(serverId, { ...AUTOMOD_SPEC });
      lines.push('✅ **Auto-mod** — spam (5/15s), mass-mention (5), caps (70%/15+), emoji (8), zalgo. Owners/admins exempt.');
    }
  } catch (err) {
    log.warn({ err, serverId }, 'Auto-setup automod failed');
    lines.push('⚠️ **Auto-mod** — something went wrong.');
  }

  // ── Keyword auto-responses ─────────────────────────────────────────
  try {
    const existing = new Set((await getRulesForServer(serverId)).map((r) => r.phrase.toLowerCase()));
    let added = 0;
    for (const kw of STARTER_KEYWORDS) {
      if (existing.has(kw.phrase.toLowerCase())) continue;
      await addRule({ serverId, phrase: kw.phrase, response: kw.response, channelId: null, createdBy: actorId });
      added++;
    }
    lines.push(
      added > 0
        ? `✅ **Keywords** — added ${added} fun auto-replies (good bot, gm, gg, marco…); throttled so they can't spam`
        : '⏭️ **Keywords** — starter set already present (kept)',
    );
  } catch (err) {
    log.warn({ err, serverId }, 'Auto-setup keywords failed');
    lines.push('⚠️ **Keywords** — something went wrong.');
  }

  // ── Persist guild-config (welcome / mod-log / auto-role) ───────────
  const patch: { welcomeChannel?: string; modlogChannel?: string; autoroleId?: string } = {};
  if (welcomeId && welcomeId !== gcfg.welcomeChannel) patch.welcomeChannel = welcomeId;
  if (modlogId && modlogId !== gcfg.modlogChannel) patch.modlogChannel = modlogId;
  if (autoroleId && autoroleId !== gcfg.autoroleId) patch.autoroleId = autoroleId;
  if (Object.keys(patch).length > 0) {
    try {
      await setGuildConfig(serverId, patch);
    } catch (err) {
      log.warn({ err, serverId }, 'Auto-setup guild_config write failed');
    }
  }

  return lines;
}
