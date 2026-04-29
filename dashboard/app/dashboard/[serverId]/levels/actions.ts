'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { fetchUserinfo } from '@/lib/echoed';
import { setLevelSettings } from '@/lib/queries/levelSettings';

// Same gate as the per-server layout — never trust the form data
// alone. We re-verify the user owns the target server on every
// write, so a leaked form submission from a non-admin can't write
// to someone else's settings.
async function requireOwner(serverId: string): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/login');
  const user = await fetchUserinfo(session.accessToken);
  const owns = (user.owned_servers ?? []).some((s) => s.id === serverId);
  if (!owns) redirect('/dashboard');
}

// Accept "<#abc123>" or bare ID; null when blank. Same parser the
// bot uses on the chat-side; reimplemented here to keep the
// dashboard self-contained.
function parseChannelId(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === 'none') return null;
  const m = /^<#([a-zA-Z0-9_-]+)>$/.exec(trimmed);
  if (m?.[1]) return m[1];
  return /^[a-zA-Z0-9_-]{8,}$/.test(trimmed) ? trimmed : null;
}

function parseChannelList(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[\s,]+/)
    .map((p) => parseChannelId(p))
    .filter((id): id is string => id != null);
}

function parseInt(raw: FormDataEntryValue | null, fallback: number, min: number, max: number): number {
  if (typeof raw !== 'string') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export async function saveLevels(serverId: string, formData: FormData): Promise<void> {
  await requireOwner(serverId);

  const enabled = formData.get('enabled') === 'on';
  const stackRewards = formData.get('stackRewards') === 'on';
  const levelUpChannel = parseChannelId(formData.get('levelUpChannel'));
  const noXpChannelIds = parseChannelList(formData.get('noXpChannelIds'));

  const rawMsg = formData.get('levelUpMessage');
  const levelUpMessage =
    typeof rawMsg === 'string' && rawMsg.trim().length > 0 ? rawMsg.trim().slice(0, 500) : null;

  const xpPerMessageMin = parseInt(formData.get('xpPerMessageMin'), 15, 1, 200);
  const xpPerMessageMax = parseInt(
    formData.get('xpPerMessageMax'),
    Math.max(25, xpPerMessageMin),
    xpPerMessageMin,
    500,
  );
  const cooldownSeconds = parseInt(formData.get('cooldownSeconds'), 60, 0, 3600);

  await setLevelSettings(serverId, {
    enabled,
    stackRewards,
    levelUpChannel,
    levelUpMessage,
    noXpChannelIds,
    xpPerMessageMin,
    xpPerMessageMax,
    cooldownSeconds,
  });

  // Bust the read cache so the form re-renders with the saved values.
  revalidatePath(`/dashboard/${serverId}/levels`);
  revalidatePath(`/dashboard/${serverId}`);
}
