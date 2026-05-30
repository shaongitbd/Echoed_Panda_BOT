import type { EchoedClient, ChannelInfo } from '../client/echoedClient.js';
import { provisionLevelRoles } from '../levels/provision.js';
import { getRewardsInRange, clearLevelRewards } from '../levels/levelUp.js';
import { setLevelSettings } from '../db/levelSettings.js';
import { getQotdConfig, setQotdConfig } from '../qotd/store.js';
import { getBirthdayConfig, setBirthdayConfig } from '../birthday/store.js';
import { getStarboardConfig, setStarboardConfig } from '../starboard/store.js';
import { getCountingConfig, setCountingConfig } from '../counting/store.js';
import { parseDailyTime, nextDailyRun } from '../util/parse.js';
import { log } from '../log.js';

// Recommended defaults. Times are UTC (per-server timezones are a later
// polish) — QOTD lands midday-US / evening-EU, birthdays in the morning.
const QOTD_TIME = '16:00';
const BIRTHDAY_TIME = '12:00';

const GENERAL_HINTS = ['general', 'general-chat', 'chat', 'lounge', 'main', 'home', 'hangout'];
const STARBOARD_HINTS = ['starboard', 'highlights', 'star-board', 'best-of'];
const COUNTING_HINTS = ['counting', 'count', 'counting-game'];

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
// announcement-style features (QOTD, birthdays, level-ups).
export function pickGeneralChannel(channels: ChannelInfo[]): ChannelInfo | undefined {
  const text = channels
    .filter((c) => c.type === 'text')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return text.find((c) => GENERAL_HINTS.includes(c.name.toLowerCase())) ?? text[0];
}

// Find an existing channel by name, else create it. Returns null if creation
// fails (bot lacks Manage Channels) so the caller can report it instead of
// silently dropping the feature.
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
}

// Provision the full engagement stack for a server and return human-readable
// report lines (one per feature: ✅ set / ⏭️ kept / ⚠️ couldn't). Context-free
// (no command/socket dependency) so it's callable from both the `!setup`
// command and the first-join auto-setup. Every step is best-effort; a single
// feature failing never aborts the rest.
export async function runEngagementSetup(
  api: EchoedClient,
  serverId: string,
  opts: AutoSetupOptions,
): Promise<string[]> {
  const { override, prefix } = opts;
  const lines: string[] = [];

  let channels: ChannelInfo[];
  try {
    channels = await api.listChannels(serverId);
  } catch (err) {
    log.warn({ err, serverId }, 'Auto-setup listChannels failed');
    return ["⚠️ I couldn't read this server's channels (need **View Channels**)."];
  }

  const general = pickGeneralChannel(channels);
  if (!general) return ['⚠️ No text channel found to anchor announcements.'];

  let memberCount = 0;
  try {
    const info = await api.getServerInfo(serverId);
    memberCount = info.memberCount ?? 0;
  } catch {
    /* threshold falls back to the small-server default */
  }

  // ── Levels + reward roles ──────────────────────────────────────────
  try {
    const existing = await getRewardsInRange(serverId, 1, 1000);
    if (!override && existing.length > 0) {
      lines.push(`⏭️ **Levels** — already set up (kept). \`${prefix}setup override\` to replace the ladder.`);
    } else {
      if (override && existing.length > 0) await clearLevelRewards(serverId);
      await setLevelSettings(serverId, { enabled: true, stackRewards: false, levelUpChannel: general.id });
      const ok = await provisionLevelRoles(api, serverId, { force: true });
      lines.push(
        ok
          ? `✅ **Levels** — XP + reward roles (Lv 5→100), level-ups → <#${general.id}>`
          : `⚠️ **Levels** — I need **Manage Roles** to create the reward roles. Grant it and run \`${prefix}setup\` again.`,
      );
    }
  } catch (err) {
    log.warn({ err, serverId }, 'Auto-setup levels failed');
    lines.push('⚠️ **Levels** — something went wrong (check my permissions).');
  }

  // ── Starboard (needs its own channel) ──────────────────────────────
  try {
    const cfg = await getStarboardConfig(serverId);
    if (!override && (cfg.enabled || cfg.channelId)) {
      lines.push('⏭️ **Starboard** — already set up (kept).');
    } else {
      const ch = await ensureChannel(api, serverId, channels, STARBOARD_HINTS, 'starboard', '⭐ The best messages, pinned by reactions.');
      if (!ch) {
        lines.push(`⚠️ **Starboard** — needs a channel; I lack **Manage Channels** to make one. Run \`${prefix}starboard channel <#channel>\`.`);
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

  // ── Counting (needs its own channel) ───────────────────────────────
  try {
    const cfg = await getCountingConfig(serverId);
    if (!override && (cfg.enabled || cfg.channelId)) {
      lines.push('⏭️ **Counting** — already set up (kept).');
    } else {
      const ch = await ensureChannel(api, serverId, channels, COUNTING_HINTS, 'counting', '🔢 Count up together — one number per person, no doubles.');
      if (!ch) {
        lines.push(`⚠️ **Counting** — needs a channel; I lack **Manage Channels** to make one. Run \`${prefix}counting channel <#channel>\`.`);
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
      await setQotdConfig(serverId, { channelId: general.id, enabled: true, dailyTime: QOTD_TIME, nextRunAt: nextDailyRun(t.hh, t.mm) });
      lines.push(`✅ **QOTD** — daily at **${QOTD_TIME} UTC** → <#${general.id}>`);
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
      await setBirthdayConfig(serverId, { channelId: general.id, enabled: true, dailyTime: BIRTHDAY_TIME, nextRunAt: nextDailyRun(t.hh, t.mm) });
      lines.push(`✅ **Birthdays** — daily at **${BIRTHDAY_TIME} UTC** → <#${general.id}> (members: \`${prefix}birthday set <MM-DD>\`)`);
    }
  } catch (err) {
    log.warn({ err, serverId }, 'Auto-setup birthdays failed');
    lines.push('⚠️ **Birthdays** — something went wrong.');
  }

  // ── Daily check-in (no config needed) ──────────────────────────────
  lines.push(`✅ **Daily check-in** — \`${prefix}daily\` is live (XP bonus + streaks)`);

  return lines;
}
