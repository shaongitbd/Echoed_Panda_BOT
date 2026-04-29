// Pure detection functions. Each returns true if the message should be
// flagged. The pipeline runs these in priority order and short-circuits
// on the first match — a message that trips multiple filters logs as
// the highest-priority one.

import type { AutomodConfig, FilterKind } from './config.js';
import { recordAndCount } from './spamWindow.js';

// ─── Invite blocker ─────────────────────────────────────────────────────
//
// Catches common invite-share URL patterns from popular chat platforms
// + Echoed's own `echoed.gg/invite/foo` and `echoed.gg/i/foo`
// shorthands. All matched case-insensitively.

const INVITE_RE = new RegExp(
  String.raw`(discord\.gg/[a-z0-9-]+|discord(?:app)?\.com/invite/[a-z0-9-]+|echoed\.gg/(?:invite|i)/[a-z0-9-]+)`,
  'i',
);

export function detectInvite(content: string): boolean {
  return INVITE_RE.test(content);
}

// ─── Bad words ──────────────────────────────────────────────────────────
//
// Word-boundary matches against a configured list. Building the regex
// every call would be wasteful at hot-path scale; we cache by the
// joined-list string so config edits invalidate naturally.

const badWordsRegexCache = new Map<string, RegExp | null>();

function buildBadWordsRegex(words: string[]): RegExp | null {
  if (words.length === 0) return null;
  // Sort for stable cache key. Lowercase + escape regex meta-chars so
  // a word like "f.u.c.k" doesn't blow up the pattern.
  const sorted = [...words].map((w) => w.toLowerCase()).sort();
  const key = sorted.join('');
  if (badWordsRegexCache.has(key)) return badWordsRegexCache.get(key) ?? null;

  const escaped = sorted.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // \b on both sides keeps "ass" from matching "assassin" but still
  // catches "ass!" (since `!` is not a word char).
  const re = new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'i');
  badWordsRegexCache.set(key, re);
  return re;
}

export function detectBadWords(content: string, words: string[]): boolean {
  const re = buildBadWordsRegex(words);
  if (!re) return false;
  return re.test(content);
}

// ─── Caps ───────────────────────────────────────────────────────────────
//
// Triggers when ≥thresholdPct of the letters in a message are uppercase
// AND the message is at least `minLength` chars long. Short messages
// like "OK" don't trip; "I HATE THIS" does.

export function detectCaps(content: string, thresholdPct: number, minLength: number): boolean {
  if (content.length < minLength) return false;
  let upper = 0;
  let total = 0;
  for (const ch of content) {
    if (ch >= 'A' && ch <= 'Z') {
      upper++;
      total++;
    } else if (ch >= 'a' && ch <= 'z') {
      total++;
    }
  }
  if (total < minLength) return false;
  const pct = (upper / total) * 100;
  return pct >= thresholdPct;
}

// ─── Mass mentions ──────────────────────────────────────────────────────
//
// Counts user (`<@id>`) and role (`<@&id>`) mentions plus literal
// @everyone / @here. Threshold is the count that flips the flag.

const MENTION_RE = /<@!?[a-zA-Z0-9_-]+>|<@&[a-zA-Z0-9_-]+>/g;
const EVERYONE_RE = /@(everyone|here)\b/g;

export function detectMassMentions(content: string, threshold: number): boolean {
  const mentions = (content.match(MENTION_RE) ?? []).length;
  const everyone = (content.match(EVERYONE_RE) ?? []).length;
  return mentions + everyone >= threshold;
}

// ─── Emoji spam ─────────────────────────────────────────────────────────
//
// Counts pictographic codepoints. \p{Extended_Pictographic} catches
// most emoji but not regional indicators or skin-tone modifiers; for
// auto-mod purposes that's plenty — clusters always include a base
// pictographic char.

const EMOJI_RE = /\p{Extended_Pictographic}/gu;

export function detectEmojiSpam(content: string, threshold: number): boolean {
  const m = content.match(EMOJI_RE);
  return (m ? m.length : 0) >= threshold;
}

// ─── Zalgo ──────────────────────────────────────────────────────────────
//
// Z̸̧̪͕̜͔̑̔A̸̢̙͕̲͐͜L̴̢͙̟͚̱̔̃G̷̛̱̦͎͖͈̥̈͝O̴̳̘̭͉̾͌̊͂́̕ — combining marks layered onto base chars to garble
// rendering. We trip when ≥30% of the message is combining marks AND
// there are at least 5 of them; this avoids false-positives on plain
// accented text like résumé, naïve, etc.

const COMBINING_MARK_RE = /\p{M}/gu;
const ZALGO_RATIO_THRESHOLD = 0.3;
const ZALGO_MIN_MARKS = 5;

export function detectZalgo(content: string): boolean {
  if (content.length < 5) return false;
  const marks = (content.match(COMBINING_MARK_RE) ?? []).length;
  if (marks < ZALGO_MIN_MARKS) return false;
  const ratio = marks / content.length;
  return ratio >= ZALGO_RATIO_THRESHOLD;
}

// ─── Links ──────────────────────────────────────────────────────────────
//
// Catches URLs with http/https or bare domains. When a whitelist is
// configured we extract domains and check each one — a single
// whitelisted domain doesn't bless the whole message; every URL must
// be on the list.

const URL_RE = /\bhttps?:\/\/[^\s]+/gi;

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function detectLinks(content: string, whitelist: string[]): boolean {
  const matches = content.match(URL_RE);
  if (!matches || matches.length === 0) return false;
  if (whitelist.length === 0) return true; // Any link blocked.

  const wl = whitelist.map((d) => d.toLowerCase());
  for (const url of matches) {
    const host = extractDomain(url);
    if (!host) return true; // Malformed URL — flag and let mods sort it.
    // Whitelist match: exact OR subdomain (e.g. `youtube.com` allows
    // `music.youtube.com`).
    const allowed = wl.some((d) => host === d || host.endsWith(`.${d}`));
    if (!allowed) return true;
  }
  return false;
}

// ─── Spam (rate-based) ──────────────────────────────────────────────────
//
// Stateful — bumps the per-user message counter and flags if the count
// in the rolling window reaches the threshold.

export function detectSpam(
  serverId: string,
  userId: string,
  threshold: number,
  windowSeconds: number,
): boolean {
  const count = recordAndCount(serverId, userId, windowSeconds);
  return count >= threshold;
}

// ─── Detection result ───────────────────────────────────────────────────

export interface FilterMatch {
  kind: FilterKind;
  // Short human label for the warning/mod-log message.
  reason: string;
}

// Run all enabled filters on a message in priority order and return
// the FIRST match. Spam check runs last because it has the side-effect
// of recording a timestamp; we don't want to also bump the counter for
// messages we'll delete anyway. If a higher-priority filter trips, the
// caller resets the spam window separately so the user doesn't get
// double-tagged.
export function runFilters(
  config: AutomodConfig,
  ctx: { serverId: string; userId: string; content: string },
): FilterMatch | null {
  if (config.invitesEnabled && detectInvite(ctx.content)) {
    return { kind: 'invites', reason: 'Invite link' };
  }
  if (config.badWordsEnabled && detectBadWords(ctx.content, config.badWords)) {
    return { kind: 'bad_words', reason: 'Filtered word' };
  }
  if (config.mentionsEnabled && detectMassMentions(ctx.content, config.mentionsThreshold)) {
    return { kind: 'mentions', reason: 'Mass mentions' };
  }
  if (
    config.linksEnabled &&
    detectLinks(ctx.content, config.linkWhitelist)
  ) {
    return { kind: 'links', reason: 'Disallowed link' };
  }
  if (
    config.capsEnabled &&
    detectCaps(ctx.content, config.capsThresholdPct, config.capsMinLength)
  ) {
    return { kind: 'caps', reason: 'Excessive caps' };
  }
  if (config.emojiEnabled && detectEmojiSpam(ctx.content, config.emojiThreshold)) {
    return { kind: 'emoji', reason: 'Emoji spam' };
  }
  if (config.zalgoEnabled && detectZalgo(ctx.content)) {
    return { kind: 'zalgo', reason: 'Zalgo / combining-mark abuse' };
  }
  // Spam check last — see comment above.
  if (
    config.spamEnabled &&
    detectSpam(ctx.serverId, ctx.userId, config.spamThreshold, config.spamWindowSeconds)
  ) {
    return { kind: 'spam', reason: 'Message spam' };
  }
  return null;
}
