// Changing Panda's settings through `!panda` — "set up a welcome channel",
// "turn on counting in #numbers", "make the mod-log #staff-log".
//
// This is the most powerful thing the agent can do, so it is fenced in:
//   1. Off unless the server owner switched it on (dashboard), and only for
//      someone with Manage Server — checked when the change is proposed AND
//      again when it is confirmed.
//   2. A fixed list of settings (SETTINGS below), each with the same checks
//      the matching command applies. Never: AI settings, mod/protected
//      roles, command permissions, member roles, channel permissions, or
//      deleting anything. Creating is limited to text channels and roles
//      with NO permissions.
//   3. Nothing is written until the same admin confirms a preview that shows
//      every change as before → after (full text for messages, ⚠️ on links),
//      and warns in bold when member messages were read along the way.
//   4. Every applied change is stored (panda.ai_config_changes), posted to
//      the mod-log, and DM'd to the owner when someone else made it. At most
//      MAX_CHANGES_PER_HOUR per server.

import type { Services } from '../commands/index.js';
import { pool } from '../db/pool.js';
import { getGuildConfig, setGuildConfig } from '../db/guildConfig.js';
import { getBirthdayConfig, setBirthdayConfig } from '../birthday/store.js';
import { getQotdConfig, setQotdConfig } from '../qotd/store.js';
import { getStarboardConfig, setStarboardConfig } from '../starboard/store.js';
import { getCountingConfig, setCountingConfig } from '../counting/store.js';
import { getLevelSettings, setLevelSettings } from '../db/levelSettings.js';
import { getAutomodConfig, setAutomodConfig } from '../automod/config.js';
import { containsMention, escapeMentions } from '../client/text.js';
import { nextDailyRun, parseDailyTime } from '../util/parse.js';
import { config } from '../config.js';
import { log } from '../log.js';
import { defangLinks, hasLink } from './safety.js';

const MAX_CHANGES_PER_HOUR = 30;
const MAX_CREATES = 10;

type Kind = 'channel' | 'role' | 'bool' | 'int' | 'time' | 'text' | 'emoji' | 'prefix';
/** A setting's value: ids for channels/roles (null = unset), or a plain value. */
type Value = string | number | boolean | null;

interface SettingDef {
  label: string;
  kind: Kind;
  /** May be cleared (set to none). */
  nullable?: boolean;
  min?: number;
  max?: number;
  maxLen?: number;
  /** Turning this on needs this setting to have a value (e.g. a channel). */
  needs?: string;
  read: (serverId: string) => Promise<Value>;
  write: (serverId: string, value: Value) => Promise<void>;
}

const hhmm = (t: string) => parseDailyTime(t) ?? { hh: 9, mm: 0 };

// Each entry writes exactly what the matching command writes (including the
// next scheduled run when a daily post is switched on or re-timed).
const SETTINGS: Record<string, SettingDef> = {
  prefix: {
    label: 'Command prefix', kind: 'prefix',
    read: async (s) => (await getGuildConfig(s)).prefix ?? config.defaultPrefix,
    write: async (s, v) => void (await setGuildConfig(s, { prefix: String(v) })),
  },
  modlog_channel: {
    label: 'Mod-log channel', kind: 'channel', nullable: true,
    read: async (s) => (await getGuildConfig(s)).modlogChannel,
    write: async (s, v) => void (await setGuildConfig(s, { modlogChannel: v as string | null })),
  },
  welcome_channel: {
    label: 'Welcome channel', kind: 'channel', nullable: true,
    read: async (s) => (await getGuildConfig(s)).welcomeChannel,
    write: async (s, v) => void (await setGuildConfig(s, { welcomeChannel: v as string | null })),
  },
  welcome_message: {
    label: 'Welcome message', kind: 'text', nullable: true, maxLen: 1000,
    read: async (s) => (await getGuildConfig(s)).welcomeMessage,
    write: async (s, v) => void (await setGuildConfig(s, { welcomeMessage: v as string | null })),
  },
  autorole: {
    label: 'Role for new members', kind: 'role', nullable: true,
    read: async (s) => (await getGuildConfig(s)).autoroleId,
    write: async (s, v) => void (await setGuildConfig(s, { autoroleId: v as string | null })),
  },
  suggestions_channel: {
    label: 'Suggestions channel', kind: 'channel', nullable: true,
    read: async (s) => (await getGuildConfig(s)).suggestionsChannel,
    write: async (s, v) => void (await setGuildConfig(s, { suggestionsChannel: v as string | null })),
  },
  anti_raid: {
    label: 'Anti-raid', kind: 'bool',
    read: async (s) => (await getGuildConfig(s)).antiRaidEnabled,
    write: async (s, v) => void (await setGuildConfig(s, { antiRaidEnabled: v === true })),
  },
  anti_raid_threshold: {
    label: 'Anti-raid: joins that trigger it', kind: 'int', min: 2, max: 200,
    read: async (s) => (await getGuildConfig(s)).antiRaidThreshold,
    write: async (s, v) => void (await setGuildConfig(s, { antiRaidThreshold: Number(v) })),
  },
  anti_raid_window_seconds: {
    label: 'Anti-raid: window (seconds)', kind: 'int', min: 5, max: 600,
    read: async (s) => (await getGuildConfig(s)).antiRaidWindowSeconds,
    write: async (s, v) => void (await setGuildConfig(s, { antiRaidWindowSeconds: Number(v) })),
  },
  birthday_posts: {
    label: 'Birthday posts', kind: 'bool', needs: 'birthday_channel',
    read: async (s) => (await getBirthdayConfig(s)).enabled,
    write: async (s, v) => {
      const t = hhmm((await getBirthdayConfig(s)).dailyTime);
      await setBirthdayConfig(s, v === true ? { enabled: true, nextRunAt: nextDailyRun(t.hh, t.mm) } : { enabled: false });
    },
  },
  birthday_channel: {
    label: 'Birthday channel', kind: 'channel',
    read: async (s) => (await getBirthdayConfig(s)).channelId,
    write: async (s, v) => void (await setBirthdayConfig(s, { channelId: String(v) })),
  },
  birthday_time: {
    label: 'Birthday post time (UTC)', kind: 'time',
    read: async (s) => (await getBirthdayConfig(s)).dailyTime,
    write: async (s, v) => {
      const t = hhmm(String(v));
      await setBirthdayConfig(s, { dailyTime: String(v), nextRunAt: nextDailyRun(t.hh, t.mm) });
    },
  },
  birthday_role: {
    label: 'Birthday role', kind: 'role', nullable: true,
    read: async (s) => (await getBirthdayConfig(s)).roleId,
    write: async (s, v) => void (await setBirthdayConfig(s, { roleId: v as string | null })),
  },
  birthday_message: {
    label: 'Birthday message', kind: 'text', nullable: true, maxLen: 500,
    read: async (s) => (await getBirthdayConfig(s)).message,
    write: async (s, v) => void (await setBirthdayConfig(s, { message: v as string | null })),
  },
  qotd_posts: {
    label: 'Question of the day', kind: 'bool', needs: 'qotd_channel',
    read: async (s) => (await getQotdConfig(s)).enabled,
    write: async (s, v) => {
      const t = hhmm((await getQotdConfig(s)).dailyTime);
      await setQotdConfig(s, v === true ? { enabled: true, nextRunAt: nextDailyRun(t.hh, t.mm) } : { enabled: false });
    },
  },
  qotd_channel: {
    label: 'Question of the day channel', kind: 'channel',
    read: async (s) => (await getQotdConfig(s)).channelId,
    write: async (s, v) => void (await setQotdConfig(s, { channelId: String(v) })),
  },
  qotd_time: {
    label: 'Question of the day time (UTC)', kind: 'time',
    read: async (s) => (await getQotdConfig(s)).dailyTime,
    write: async (s, v) => {
      const t = hhmm(String(v));
      await setQotdConfig(s, { dailyTime: String(v), nextRunAt: nextDailyRun(t.hh, t.mm) });
    },
  },
  starboard: {
    label: 'Starboard', kind: 'bool', needs: 'starboard_channel',
    read: async (s) => (await getStarboardConfig(s)).enabled,
    write: async (s, v) => void (await setStarboardConfig(s, { enabled: v === true })),
  },
  starboard_channel: {
    label: 'Starboard channel', kind: 'channel',
    read: async (s) => (await getStarboardConfig(s)).channelId,
    write: async (s, v) => void (await setStarboardConfig(s, { channelId: String(v) })),
  },
  starboard_emoji: {
    label: 'Starboard emoji', kind: 'emoji', maxLen: 32,
    read: async (s) => (await getStarboardConfig(s)).emoji,
    write: async (s, v) => void (await setStarboardConfig(s, { emoji: String(v) })),
  },
  starboard_threshold: {
    label: 'Starboard: reactions needed', kind: 'int', min: 1, max: 50,
    read: async (s) => (await getStarboardConfig(s)).threshold,
    write: async (s, v) => void (await setStarboardConfig(s, { threshold: Number(v) })),
  },
  counting: {
    label: 'Counting game', kind: 'bool', needs: 'counting_channel',
    read: async (s) => (await getCountingConfig(s)).enabled,
    write: async (s, v) => void (await setCountingConfig(s, { enabled: v === true })),
  },
  counting_channel: {
    label: 'Counting channel', kind: 'channel',
    read: async (s) => (await getCountingConfig(s)).channelId,
    write: async (s, v) => void (await setCountingConfig(s, { channelId: String(v) })),
  },
  counting_reset_on_fail: {
    label: 'Counting: reset on a wrong number', kind: 'bool',
    read: async (s) => (await getCountingConfig(s)).resetOnFail,
    write: async (s, v) => void (await setCountingConfig(s, { resetOnFail: v === true })),
  },
  levels: {
    label: 'Levels (XP)', kind: 'bool',
    read: async (s) => (await getLevelSettings(s)).enabled,
    write: async (s, v) => void (await setLevelSettings(s, { enabled: v === true })),
  },
  levelup_channel: {
    label: 'Level-up announcements channel', kind: 'channel', nullable: true,
    read: async (s) => (await getLevelSettings(s)).levelUpChannel,
    write: async (s, v) => void (await setLevelSettings(s, { levelUpChannel: v as string | null })),
  },
  levelup_message: {
    label: 'Level-up message', kind: 'text', nullable: true, maxLen: 500,
    read: async (s) => (await getLevelSettings(s)).levelUpMessage,
    write: async (s, v) => void (await setLevelSettings(s, { levelUpMessage: v as string | null })),
  },
  automod: automodBool('Auto-mod', 'enabled'),
  automod_spam: automodBool('Auto-mod: spam filter', 'spamEnabled'),
  automod_links: automodBool('Auto-mod: link filter', 'linksEnabled'),
  automod_invites: automodBool('Auto-mod: invite filter', 'invitesEnabled'),
  automod_caps: automodBool('Auto-mod: caps filter', 'capsEnabled'),
  automod_mentions: automodBool('Auto-mod: mass-mention filter', 'mentionsEnabled'),
  automod_emoji: automodBool('Auto-mod: emoji-spam filter', 'emojiEnabled'),
  automod_zalgo: automodBool('Auto-mod: zalgo filter', 'zalgoEnabled'),
  automod_bad_words: automodBool('Auto-mod: bad-word filter', 'badWordsEnabled'),
};

function automodBool(
  label: string,
  field: 'enabled' | 'spamEnabled' | 'linksEnabled' | 'invitesEnabled' | 'capsEnabled' | 'mentionsEnabled' | 'emojiEnabled' | 'zalgoEnabled' | 'badWordsEnabled',
): SettingDef {
  return {
    label, kind: 'bool',
    read: async (s) => (await getAutomodConfig(s))[field],
    write: async (s, v) => void (await setAutomodConfig(s, { [field]: v === true })),
  };
}

/** For the tool description: every setting the agent may change, and its type. */
export function settingsCatalog(): string {
  return Object.entries(SETTINGS)
    .map(([key, d]) => `${key} (${d.kind}${d.nullable ? ', or null to clear' : ''}${d.min !== undefined ? `, ${d.min}–${d.max}` : ''})`)
    .join('; ');
}

// ── Planning ───────────────────────────────────────────────────────────────

export interface CreateSpec {
  type: 'text_channel' | 'role';
  name: string;
  description?: string;
  private?: boolean;
  color?: string;
}

interface PlannedChange {
  key: string;
  /** A real id/value, or a reference to something this plan creates ("new:rules"). */
  value: Value | { ref: string };
  before: string;
  after: string;
  warn?: string;
}

export interface ConfigPlan {
  creates: CreateSpec[];
  changes: PlannedChange[];
  /** The agent read member-written text while working on this. */
  tainted: boolean;
}

export interface ServerDirectory {
  /** Text channels: id → name. */
  channels: Map<string, string>;
  roles: Map<string, string>;
  /** Role ids that must never be handed out by a setting (mod / protected roles). */
  sensitiveRoles: Set<string>;
}

export async function loadDirectory(svc: Services, serverId: string): Promise<ServerDirectory> {
  const [channels, roles, guild] = await Promise.all([
    svc.api.listChannels(serverId).catch(() => []),
    svc.api.listServerRoles(serverId).catch(() => []),
    getGuildConfig(serverId),
  ]);
  return {
    channels: new Map(channels.filter((c) => c.type === 'text').map((c) => [c.id, c.name])),
    roles: new Map(roles.map((r) => [r.id, r.name])),
    sensitiveRoles: new Set([...guild.modRoleIds, ...guild.protectedRoleIds]),
  };
}

const CHANNEL_NAME = /^[a-z0-9][a-z0-9_-]{0,49}$/;

/**
 * Validate what the model proposed against the fixed list and the server's
 * real channels and roles. Returns the plan (possibly empty) and the
 * problems, which go back to the model so it can tell the admin.
 */
export async function planConfig(
  serverId: string,
  dir: ServerDirectory,
  rawCreates: unknown,
  rawChanges: unknown,
  tainted: boolean,
  /** The asker has Manage Roles — needed to create roles or make Panda hand one out. */
  canManageRoles: boolean,
): Promise<{ plan: ConfigPlan; problems: string[] }> {
  const problems: string[] = [];
  const creates: CreateSpec[] = [];
  const newChannels = new Set<string>();
  const newRoles = new Set<string>();

  for (const raw of Array.isArray(rawCreates) ? rawCreates.slice(0, MAX_CREATES) : []) {
    if (!raw || typeof raw !== 'object') continue;
    const c = raw as Record<string, unknown>;
    const type = c.type === 'role' ? 'role' : c.type === 'text_channel' ? 'text_channel' : null;
    const name = typeof c.name === 'string' ? c.name.trim() : '';
    if (!type) { problems.push(`Can only create "text_channel" or "role".`); continue; }
    if (type === 'text_channel') {
      const n = name.toLowerCase().replace(/^#/, '').replace(/\s+/g, '-');
      if (!CHANNEL_NAME.test(n)) { problems.push(`"${name.slice(0, 40)}" isn't a usable channel name (letters, numbers, - and _).`); continue; }
      if ([...dir.channels.values()].includes(n) || newChannels.has(n)) { problems.push(`#${n} already exists — use it instead of creating it.`); continue; }
      newChannels.add(n);
      creates.push({
        type,
        name: n,
        description: typeof c.description === 'string' ? c.description.slice(0, 200) : undefined,
        private: c.private === true,
      });
    } else {
      if (!canManageRoles) { problems.push('Creating a role needs the Manage Roles permission.'); continue; }
      const n = name.replace(/^@/, '').slice(0, 50);
      if (!n || /^(everyone|here)$/i.test(n) || containsMention(n)) { problems.push(`"${name.slice(0, 40)}" isn't a usable role name.`); continue; }
      if ([...dir.roles.values()].some((r) => r.toLowerCase() === n.toLowerCase()) || newRoles.has(n.toLowerCase())) {
        problems.push(`A role called ${n} already exists — use it instead of creating it.`);
        continue;
      }
      newRoles.add(n.toLowerCase());
      const color = typeof c.color === 'string' && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : undefined;
      creates.push({ type, name: n, color });
    }
  }

  const changes: PlannedChange[] = [];
  const pending = new Map<string, Value | { ref: string }>();
  for (const raw of Array.isArray(rawChanges) ? rawChanges.slice(0, 30) : []) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const key = typeof r.setting === 'string' ? r.setting : '';
    const def = SETTINGS[key];
    if (!def) { problems.push(`"${key.slice(0, 40)}" isn't a setting I can change.`); continue; }
    // Choosing a role Panda hands out is granting its permissions.
    if (def.kind === 'role' && !canManageRoles) { problems.push(`${def.label}: needs the Manage Roles permission.`); continue; }
    const parsed = parseValue(def, r.value, dir, newChannels, newRoles);
    if ('error' in parsed) { problems.push(`${def.label}: ${parsed.error}`); continue; }
    pending.set(key, parsed.value);
  }

  // A feature switched on needs its channel — set now, set in this plan, or created in it.
  for (const [key, value] of pending) {
    const def = SETTINGS[key]!;
    if (def.kind === 'bool' && value === true && def.needs && !pending.has(def.needs)) {
      const current = await SETTINGS[def.needs]!.read(serverId).catch(() => null);
      if (current === null || current === '') {
        problems.push(`${def.label} needs a ${SETTINGS[def.needs]!.label.toLowerCase()} first — say which channel.`);
        pending.delete(key);
      }
    }
  }

  for (const [key, value] of pending) {
    const def = SETTINGS[key]!;
    const current = await def.read(serverId).catch(() => null);
    const after = display(def, value, dir);
    const before = display(def, current, dir);
    if (before === after) continue; // already so
    let warn: string | undefined;
    if (def.kind === 'text' && typeof value === 'string' && hasLink(value)) warn = 'contains a link — check it';
    if (def.kind === 'role' && typeof value === 'string' && /admin|mod|owner|staff/i.test(dir.roles.get(value) ?? '')) {
      warn = 'that role sounds powerful — everyone it is given to gets its permissions';
    }
    changes.push({ key, value, before, after, warn });
  }

  // Creations nothing uses are still allowed ("make a #rules channel"), so keep them all.
  return { plan: { creates, changes, tainted }, problems };
}

function parseValue(
  def: SettingDef,
  raw: unknown,
  dir: ServerDirectory,
  newChannels: Set<string>,
  newRoles: Set<string>,
): { value: Value | { ref: string } } | { error: string } {
  if (raw === null || raw === 'none' || raw === '') {
    return def.nullable ? { value: null } : { error: "can't be cleared, only changed." };
  }
  switch (def.kind) {
    case 'bool':
      if (raw === true || raw === 'on' || raw === 'true') return { value: true };
      if (raw === false || raw === 'off' || raw === 'false') return { value: false };
      return { error: 'needs on or off.' };
    case 'int': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isInteger(n) || n < def.min! || n > def.max!) return { error: `needs a whole number from ${def.min} to ${def.max}.` };
      return { value: n };
    }
    case 'time': {
      const t = parseDailyTime(String(raw));
      if (!t) return { error: 'needs a time like 09:00 (UTC).' };
      return { value: `${String(t.hh).padStart(2, '0')}:${String(t.mm).padStart(2, '0')}` };
    }
    case 'prefix': {
      const p = String(raw).trim();
      if (!/^[^\s@#<>`]{1,5}$/.test(p)) return { error: 'needs 1–5 characters, no spaces, @, #, < or `.' };
      return { value: p };
    }
    case 'emoji': {
      const e = String(raw).trim();
      if (!e || e.length > def.maxLen! || /\s/.test(e) || containsMention(e)) return { error: 'needs one emoji.' };
      return { value: e };
    }
    case 'text': {
      const t = String(raw).trim();
      if (t.length > def.maxLen!) return { error: `is limited to ${def.maxLen} characters.` };
      // As the commands do: a template that pings someone would ping them every time it's used.
      if (containsMention(t)) return { error: 'mentions someone directly, which would ping them every time. Use {user} instead.' };
      return { value: t };
    }
    case 'channel': {
      const v = String(raw).trim();
      const name = v.replace(/^<#(.+)>$/, '$1').replace(/^#/, '').toLowerCase();
      if (dir.channels.has(v)) return { value: v };
      for (const [id, n] of dir.channels) if (n.toLowerCase() === name) return { value: id };
      const ref = name.replace(/^new:/, '');
      if (newChannels.has(ref)) return { value: { ref: `channel:${ref}` } };
      return { error: `there's no text channel called ${v.slice(0, 40)} (create it first in the same proposal).` };
    }
    case 'role': {
      const v = String(raw).trim();
      const name = v.replace(/^<@&(.+)>$/, '$1').replace(/^@/, '').toLowerCase();
      let id: string | null = dir.roles.has(v) ? v : null;
      if (!id) for (const [rid, n] of dir.roles) if (n.toLowerCase() === name) id = rid;
      if (id) {
        // Never hand out a mod or protected role through a setting.
        if (dir.sensitiveRoles.has(id)) return { error: 'is a moderator or protected role; I won\'t hand it out automatically.' };
        return { value: id };
      }
      const ref = name.replace(/^new:/, '');
      if (newRoles.has(ref)) return { value: { ref: `role:${ref}` } };
      return { error: `there's no role called ${v.slice(0, 40)} (create it first in the same proposal).` };
    }
  }
}

function display(def: SettingDef, value: Value | { ref: string } | undefined, dir: ServerDirectory): string {
  if (value && typeof value === 'object') return value.ref.startsWith('channel:') ? `#${value.ref.slice(8)} (new)` : `@${value.ref.slice(5)} (new)`;
  if (value === null || value === undefined || value === '') return 'not set';
  // Shown in the preview, the mod-log and the owner's DM: names escaped, links
  // defanged — the value itself is stored as typed.
  switch (def.kind) {
    case 'bool': return value ? 'on' : 'off';
    case 'channel': return `#${escapeMentions(dir.channels.get(String(value)) ?? 'deleted-channel')}`;
    case 'role': return `@${escapeMentions(dir.roles.get(String(value)) ?? 'deleted-role')}`;
    case 'text': return `“${escapeMentions(defangLinks(String(value))).replace(/\n/g, ' ⏎ ')}”`;
    default: return escapeMentions(String(value));
  }
}

/** The preview lines for a plan (also what the model is told it prepared). */
export function describePlan(plan: ConfigPlan): string[] {
  const lines: string[] = [];
  for (const c of plan.creates) {
    if (c.type === 'text_channel') {
      // The topic is shown too — nothing that gets written is hidden from the preview.
      const topic = c.description
        ? ` — topic “${escapeMentions(defangLinks(c.description))}”${hasLink(c.description) ? '  ⚠️ contains a link — check it' : ''}`
        : '';
      lines.push(`• Create text channel **#${c.name}**${c.private ? ' (private)' : ''}${topic}`);
    } else {
      lines.push(`• Create role **@${escapeMentions(c.name)}** (no permissions)`);
    }
  }
  for (const ch of plan.changes) {
    const def = SETTINGS[ch.key]!;
    lines.push(`• **${def.label}:** ${ch.before} → ${ch.after}${ch.warn ? `  ⚠️ ${ch.warn}` : ''}`);
  }
  return lines;
}

// ── Applying ───────────────────────────────────────────────────────────────

export async function changesInLastHour(serverId: string): Promise<number> {
  const res = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM panda.ai_config_changes WHERE server_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [serverId],
  );
  return Number(res.rows[0]?.n ?? 0);
}

export function overHourlyCap(planSize: number, done: number): boolean {
  return done + planSize > MAX_CHANGES_PER_HOUR;
}

/** The plan creates a role or sets a role Panda hands out — both need Manage Roles. */
export function planTouchesRoles(plan: ConfigPlan): boolean {
  return plan.creates.some((c) => c.type === 'role') || plan.changes.some((c) => SETTINGS[c.key]!.kind === 'role');
}

/**
 * Apply a confirmed plan: creations first (so settings can point at them),
 * then each setting — re-reading its value at that moment for the record.
 * Every step is recorded; a failure stops nothing else. Returns one line per
 * step for the preview, and the summary for the notifications.
 */
export async function applyPlan(
  svc: Services,
  serverId: string,
  actor: { id: string; name: string },
  plan: ConfigPlan,
  request: string,
): Promise<{ lines: string[]; applied: string[] }> {
  const lines: string[] = [];
  const applied: string[] = [];
  const created = new Map<string, string>(); // "channel:rules" → id
  const dir = await loadDirectory(svc, serverId);

  for (const c of plan.creates) {
    try {
      if (c.type === 'text_channel') {
        const res = await svc.api.createChannel({ serverId, name: c.name, type: 'text', description: c.description, isPrivate: c.private });
        created.set(`channel:${c.name}`, res.channel.id);
        dir.channels.set(res.channel.id, c.name);
        lines.push(`✓ created #${c.name}`);
        applied.push(`Created text channel #${c.name}${c.description ? ` — topic “${escapeMentions(defangLinks(c.description))}”` : ''}`);
        await record(serverId, actor, 'create_text_channel', null, `#${c.name}`, request);
      } else {
        // No permissions, ever — a role made here can't grant anything.
        const res = await svc.api.createRole(serverId, { name: c.name, color: c.color, permissions: 0, mentionable: false });
        created.set(`role:${c.name.toLowerCase()}`, res.roleId);
        dir.roles.set(res.roleId, c.name);
        lines.push(`✓ created @${escapeMentions(c.name)}`);
        applied.push(`Created role @${escapeMentions(c.name)} (no permissions)`);
        await record(serverId, actor, 'create_role', null, `@${c.name}`, request);
      }
    } catch (err) {
      log.warn({ err, serverId }, '!panda config: create failed');
      lines.push(`✗ couldn't create ${c.type === 'role' ? `@${escapeMentions(c.name)}` : `#${c.name}`}: ${errText(err)}`);
    }
  }

  // Channels, roles, times and texts first; on/off switches last, so a
  // feature is never switched on before the channel it posts in is set.
  const ordered = [...plan.changes].sort((a, b) => Number(SETTINGS[a.key]!.kind === 'bool') - Number(SETTINGS[b.key]!.kind === 'bool'));
  for (const ch of ordered) {
    const def = SETTINGS[ch.key]!;
    let value: Value;
    if (ch.value && typeof ch.value === 'object') {
      const id = created.get(ch.value.ref);
      if (!id) { lines.push(`✗ ${def.label}: what it pointed at wasn't created`); continue; }
      value = id;
    } else {
      value = ch.value;
    }
    try {
      const before = display(def, await def.read(serverId).catch(() => null), dir);
      await def.write(serverId, value);
      const after = display(def, value, dir);
      lines.push(`✓ ${def.label}: ${after}`);
      applied.push(`${def.label}: ${before} → ${after}`);
      await record(serverId, actor, ch.key, before, after, request);
    } catch (err) {
      log.warn({ err, serverId, setting: ch.key }, '!panda config: write failed');
      lines.push(`✗ ${def.label}: ${errText(err)}`);
    }
  }
  return { lines, applied };
}

async function record(serverId: string, actor: { id: string; name: string }, setting: string, before: string | null, after: string, request: string): Promise<void> {
  await pool.query(
    `INSERT INTO panda.ai_config_changes (server_id, actor_id, actor_name, setting, before_value, after_value, request)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [serverId, actor.id, actor.name.slice(0, 100), setting, before, after.slice(0, 1200), request.slice(0, 1000)],
  ).catch((err: unknown) => log.warn({ err, serverId }, '!panda config: audit write failed'));
}

/**
 * Tell the people responsible: a post in the mod-log (as it is AFTER the
 * change), and a DM to the owner when someone else made it.
 */
export async function announceChanges(
  svc: Services,
  serverId: string,
  actor: { id: string; name: string },
  whereChannelName: string,
  applied: string[],
): Promise<void> {
  if (applied.length === 0) return;
  const body = [
    `⚙️ **Panda settings changed** by **${escapeMentions(actor.name)}** via \`!panda\` in #${whereChannelName}:`,
    ...applied.map((a) => `• ${a}`),
  ].join('\n').slice(0, 1900);

  const guild = await getGuildConfig(serverId);
  if (guild.modlogChannel) {
    await svc.api.sendMessage({ serverId, channelId: guild.modlogChannel, content: body }, { priority: 'background' })
      .catch((err: unknown) => log.warn({ err, serverId }, '!panda config: mod-log post failed'));
  }
  try {
    const info = await svc.api.getServerInfo(serverId);
    if (info.ownerId && info.ownerId !== actor.id) {
      const owner = await svc.api.getMemberProfile(serverId, info.ownerId);
      await svc.api.sendDM(
        owner.username,
        `${body}\n\n(on **${escapeMentions(info.name)}** — if you didn't expect this, check with ${escapeMentions(actor.name)}; every setting can be changed back on the dashboard.)`.slice(0, 1990),
      );
    }
  } catch (err) {
    log.debug({ err, serverId }, '!panda config: owner DM failed');
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 120) : 'failed';
}
