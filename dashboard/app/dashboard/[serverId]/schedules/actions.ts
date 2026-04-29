'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { addSchedule, removeSchedule, type ScheduleKind } from '@/lib/queries/scheduledMessages';
import { requireOwner, parseChannelId, parseTrimmedString, parseBoundedInt } from '@/lib/forms';
import { getSession } from '@/lib/auth';
import { fetchUserinfo } from '@/lib/echoed';

const DAILY_TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const MIN_INTERVAL_SECONDS = 5 * 60; // matches the bot's bound
const MAX_INTERVAL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface AddResult {
  ok: boolean;
  error?: string;
}

// Compute first next_run_at for a daily schedule. UTC for v1 — per-
// server timezone is a polish.
function nextDailyRun(hh: number, mm: number): Date {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0, 0),
  );
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

export async function addScheduledMessage(
  serverId: string,
  formData: FormData,
): Promise<AddResult> {
  await requireOwner(serverId);

  const rawKind = formData.get('kind');
  const kind: ScheduleKind | null =
    rawKind === 'every' || rawKind === 'daily' ? rawKind : null;
  const channelId = parseChannelId(formData.get('channelId'));
  const message = parseTrimmedString(formData.get('message'), 1500);

  if (!kind) return { ok: false, error: 'Kind must be every or daily.' };
  if (!channelId) return { ok: false, error: 'Channel is required.' };
  if (!message) return { ok: false, error: 'Message is required.' };

  let intervalSeconds: number | null = null;
  let dailyTime: string | null = null;
  let nextRunAt: Date;

  if (kind === 'every') {
    intervalSeconds = parseBoundedInt(
      formData.get('intervalSeconds'),
      MIN_INTERVAL_SECONDS,
      MIN_INTERVAL_SECONDS,
      MAX_INTERVAL_SECONDS,
    );
    nextRunAt = new Date(Date.now() + intervalSeconds * 1000);
  } else {
    const raw = formData.get('dailyTime');
    if (typeof raw !== 'string') {
      return { ok: false, error: 'Daily time must be HH:MM.' };
    }
    const m = DAILY_TIME_RE.exec(raw.trim());
    if (!m) return { ok: false, error: 'Daily time must be HH:MM (24h, UTC).' };
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    dailyTime = raw.trim();
    nextRunAt = nextDailyRun(hh, mm);
  }

  // We need the userId to populate created_by.
  const session = await getSession();
  if (!session) redirect('/login');
  const user = await fetchUserinfo(session.accessToken);

  await addSchedule({
    serverId,
    channelId,
    message,
    kind,
    intervalSeconds,
    dailyTime,
    nextRunAt,
    createdBy: user.sub,
  });

  revalidatePath(`/dashboard/${serverId}/schedules`);
  return { ok: true };
}

export async function removeScheduledMessage(serverId: string, id: number): Promise<void> {
  await requireOwner(serverId);
  await removeSchedule(serverId, id);
  revalidatePath(`/dashboard/${serverId}/schedules`);
}
