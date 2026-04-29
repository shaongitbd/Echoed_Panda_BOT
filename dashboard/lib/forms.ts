// Shared form-parsing helpers. Pulled out of every actions.ts so we
// don't drift on parsing rules across pages — and so adding a new
// page stays a 5-line job.

import { redirect } from 'next/navigation';
import { getSession } from './auth';
import { fetchUserinfo } from './echoed';

const BARE_ID_RE = /^[a-zA-Z0-9_-]{8,}$/;
const CHANNEL_MENTION_RE = /^<#([a-zA-Z0-9_-]+)>$/;
const ROLE_MENTION_RE = /^<@&([a-zA-Z0-9_-]+)>$/;

// Re-verify the user owns the target server. Every server action calls
// this — never trust the URL/form data alone.
export async function requireOwner(serverId: string): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/login');
  const user = await fetchUserinfo(session.accessToken);
  const owns = (user.owned_servers ?? []).some((s) => s.id === serverId);
  if (!owns) redirect('/dashboard');
}

export function parseChannelId(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === 'none') return null;
  const m = CHANNEL_MENTION_RE.exec(trimmed);
  if (m?.[1]) return m[1];
  return BARE_ID_RE.test(trimmed) ? trimmed : null;
}

export function parseRoleId(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === 'none') return null;
  const m = ROLE_MENTION_RE.exec(trimmed);
  if (m?.[1]) return m[1];
  return BARE_ID_RE.test(trimmed) ? trimmed : null;
}

// Channel/role id list parser. Splits on whitespace OR commas so the
// admin can paste either format. Skips anything that doesn't parse —
// no errors, just silently drops garbage tokens.
export function parseChannelList(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[\s,]+/)
    .map((p) => parseChannelId(p))
    .filter((id): id is string => id != null);
}

export function parseRoleList(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[\s,]+/)
    .map((p) => parseRoleId(p))
    .filter((id): id is string => id != null);
}

// Multi-pickers (ChannelPicker mode="multi", RolePicker mode="multi")
// emit one hidden input per selected ID, all sharing the same form
// field name. Use this helper to read them out and validate via the
// matching parser. Garbage tokens are silently dropped.
export function collectIds(
  formData: FormData,
  name: string,
  parser: (raw: FormDataEntryValue | null) => string | null,
): string[] {
  return formData
    .getAll(name)
    .map((v) => parser(v))
    .filter((id): id is string => id != null);
}

// Bounded integer parser — falls back to a default and clamps to
// [min,max]. Used for thresholds throughout.
export function parseBoundedInt(
  raw: FormDataEntryValue | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof raw !== 'string') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

// Comma-separated string list, lowercased. Used for bad-words and
// the link-whitelist domains.
export function parseStringList(raw: FormDataEntryValue | null, maxItems = 1000): string[] {
  if (typeof raw !== 'string') return [];
  const out: string[] = [];
  for (const part of raw.split(/[\n,]+/)) {
    const trimmed = part.trim().toLowerCase();
    if (!trimmed) continue;
    out.push(trimmed);
    if (out.length >= maxItems) break;
  }
  // De-dup while preserving first-seen order.
  return Array.from(new Set(out));
}

export function parseBool(raw: FormDataEntryValue | null): boolean {
  return raw === 'on' || raw === 'true';
}

export function parseTrimmedString(
  raw: FormDataEntryValue | null,
  maxLen: number,
): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, maxLen);
}
