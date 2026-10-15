'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwner, parseBool, parseChannelId, parseRoleId } from '@/lib/forms';
import { getServerChannels, getServerRoles } from '@/lib/botApi';
import { MAX_BIRTHDAY_MESSAGE, normaliseDailyTime, saveBirthdays } from '@/lib/queries/community';

function back(serverId: string, query: string): never {
  revalidatePath(`/dashboard/${serverId}/birthdays`);
  redirect(`/dashboard/${serverId}/birthdays?${query}`);
}

export async function saveBirthdaysAction(serverId: string, formData: FormData): Promise<void> {
  await requireOwner(serverId);
  const enabled = parseBool(formData.get('enabled'));
  const channelId = parseChannelId(formData.get('channelId'));
  const roleId = parseRoleId(formData.get('roleId'));
  const dailyTime = normaliseDailyTime(String(formData.get('dailyTime') ?? ''));
  const message = String(formData.get('message') ?? '').trim();

  if (!dailyTime) back(serverId, 'error=time');
  if (message.length > MAX_BIRTHDAY_MESSAGE) back(serverId, 'error=long');
  if (channelId && !(await getServerChannels(serverId)).some((c) => c.id === channelId)) back(serverId, 'error=channel');
  if (roleId && !(await getServerRoles(serverId)).some((r) => r.id === roleId)) back(serverId, 'error=role');
  if (enabled && !channelId) back(serverId, 'error=needs-channel');

  // An empty message means "Panda's default".
  await saveBirthdays(serverId, { enabled, channelId, dailyTime, roleId, message: message || null });
  back(serverId, 'saved=1');
}
