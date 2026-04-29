'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { addRule, removeRule } from '@/lib/queries/keywords';
import { requireOwner, parseChannelId, parseTrimmedString } from '@/lib/forms';
import { getSession } from '@/lib/auth';
import { fetchUserinfo } from '@/lib/echoed';

const MAX_PHRASE = 80;
const MAX_RESPONSE = 1900;

export interface AddResult {
  ok: boolean;
  error?: string;
}

export async function addKeyword(serverId: string, formData: FormData): Promise<AddResult> {
  await requireOwner(serverId);

  const phrase = parseTrimmedString(formData.get('phrase'), MAX_PHRASE);
  const response = parseTrimmedString(formData.get('response'), MAX_RESPONSE);
  // Channel is optional — null means "any channel".
  const channelId = parseChannelId(formData.get('channelId'));

  if (!phrase) return { ok: false, error: 'Phrase is required.' };
  if (!response) return { ok: false, error: 'Response is required.' };

  const session = await getSession();
  if (!session) redirect('/login');
  const user = await fetchUserinfo(session.accessToken);

  await addRule({
    serverId,
    phrase,
    response,
    channelId,
    createdBy: user.sub,
  });
  revalidatePath(`/dashboard/${serverId}/keywords`);
  return { ok: true };
}

export async function removeKeyword(serverId: string, id: number): Promise<void> {
  await requireOwner(serverId);
  await removeRule(serverId, id);
  revalidatePath(`/dashboard/${serverId}/keywords`);
}
