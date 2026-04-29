'use server';

import { revalidatePath } from 'next/cache';
import { addCounter, removeCounter, type StatKind } from '@/lib/queries/statCounters';
import { requireOwner, parseChannelId, parseTrimmedString } from '@/lib/forms';

export interface AddResult {
  ok: boolean;
  error?: string;
}

export async function addStatCounter(serverId: string, formData: FormData): Promise<AddResult> {
  await requireOwner(serverId);

  const channelId = parseChannelId(formData.get('channelId'));
  const rawKind = formData.get('kind');
  const kind: StatKind | null =
    rawKind === 'members' || rawKind === 'channels' ? rawKind : null;
  const format = parseTrimmedString(formData.get('format'), 100);

  if (!channelId) return { ok: false, error: 'Channel is required.' };
  if (!kind) return { ok: false, error: 'Kind must be members or channels.' };

  // Format defaults to a sensible per-kind label. Saves the admin
  // typing for the most common case while still accepting custom
  // text when they want it.
  const finalFormat =
    format ?? (kind === 'members' ? 'Members: {count}' : 'Channels: {count}');

  await addCounter({ serverId, channelId, kind, format: finalFormat });
  revalidatePath(`/dashboard/${serverId}/statcounters`);
  return { ok: true };
}

export async function removeStatCounter(serverId: string, channelId: string): Promise<void> {
  await requireOwner(serverId);
  await removeCounter(channelId);
  revalidatePath(`/dashboard/${serverId}/statcounters`);
}
