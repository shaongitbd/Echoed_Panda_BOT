'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwner, parseBool, parseBoundedInt, parseChannelId } from '@/lib/forms';
import { getServerChannels } from '@/lib/botApi';
import { saveStarboard } from '@/lib/queries/community';

function back(serverId: string, query: string): never {
  revalidatePath(`/dashboard/${serverId}/starboard`);
  redirect(`/dashboard/${serverId}/starboard?${query}`);
}

export async function saveStarboardAction(serverId: string, formData: FormData): Promise<void> {
  await requireOwner(serverId);
  const enabled = parseBool(formData.get('enabled'));
  const channelId = parseChannelId(formData.get('channelId'));
  const emoji = String(formData.get('emoji') ?? '').trim() || '⭐';
  // The command's own limits: 1-50 reactions, an emoji up to 64 characters.
  const threshold = parseBoundedInt(formData.get('threshold'), 3, 1, 50);
  if (emoji.length > 64 || /\s/.test(emoji)) back(serverId, 'error=emoji');
  if (channelId && !(await getServerChannels(serverId)).some((c) => c.id === channelId)) back(serverId, 'error=channel');
  if (enabled && !channelId) back(serverId, 'error=needs-channel');
  await saveStarboard(serverId, { enabled, channelId, emoji, threshold });
  back(serverId, 'saved=1');
}
