'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwner, parseBool, parseChannelId } from '@/lib/forms';
import { getServerChannels } from '@/lib/botApi';
import { resetCounting, saveCounting } from '@/lib/queries/community';

function back(serverId: string, query: string): never {
  revalidatePath(`/dashboard/${serverId}/counting`);
  redirect(`/dashboard/${serverId}/counting?${query}`);
}

export async function saveCountingAction(serverId: string, formData: FormData): Promise<void> {
  await requireOwner(serverId);
  const enabled = parseBool(formData.get('enabled'));
  const channelId = parseChannelId(formData.get('channelId'));
  const resetOnFail = parseBool(formData.get('resetOnFail'));
  if (channelId && !(await getServerChannels(serverId)).some((c) => c.id === channelId)) back(serverId, 'error=channel');
  if (enabled && !channelId) back(serverId, 'error=needs-channel');
  await saveCounting(serverId, { enabled, channelId, resetOnFail });
  back(serverId, 'saved=1');
}

export async function resetCountingAction(serverId: string): Promise<void> {
  await requireOwner(serverId);
  await resetCounting(serverId);
  back(serverId, 'saved=reset');
}
