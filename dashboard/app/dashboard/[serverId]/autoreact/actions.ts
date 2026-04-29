'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { addAutoReact, removeAutoReact } from '@/lib/queries/autoReact';
import { requireOwner, parseChannelId, parseTrimmedString } from '@/lib/forms';
import { getSession } from '@/lib/auth';
import { fetchUserinfo } from '@/lib/echoed';

export interface AddResult {
  ok: boolean;
  error?: string;
}

export async function addAutoReactRule(
  serverId: string,
  formData: FormData,
): Promise<AddResult> {
  await requireOwner(serverId);

  const channelId = parseChannelId(formData.get('channelId'));
  const emoji = parseTrimmedString(formData.get('emoji'), 100);

  if (!channelId) return { ok: false, error: 'Channel is required.' };
  if (!emoji) return { ok: false, error: 'Emoji is required.' };

  const session = await getSession();
  if (!session) redirect('/login');
  const user = await fetchUserinfo(session.accessToken);

  await addAutoReact({ serverId, channelId, emoji, createdBy: user.sub });
  revalidatePath(`/dashboard/${serverId}/autoreact`);
  return { ok: true };
}

export async function removeAutoReactRule(
  serverId: string,
  channelId: string,
  emoji: string,
): Promise<void> {
  await requireOwner(serverId);
  await removeAutoReact(serverId, channelId, emoji);
  revalidatePath(`/dashboard/${serverId}/autoreact`);
}
