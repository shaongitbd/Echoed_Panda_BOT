'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwner, parseBool, parseChannelId } from '@/lib/forms';
import { getSession } from '@/lib/auth';
import { fetchUserinfo } from '@/lib/echoed';
import { getServerChannels } from '@/lib/botApi';
import {
  addQotdQuestion,
  MAX_QUESTION_LEN,
  normaliseDailyTime,
  removeQotdQuestion,
  saveQotd,
} from '@/lib/queries/community';

function back(serverId: string, query: string): never {
  revalidatePath(`/dashboard/${serverId}/qotd`);
  redirect(`/dashboard/${serverId}/qotd?${query}`);
}

export async function saveQotdAction(serverId: string, formData: FormData): Promise<void> {
  await requireOwner(serverId);
  const enabled = parseBool(formData.get('enabled'));
  const channelId = parseChannelId(formData.get('channelId'));
  const dailyTime = normaliseDailyTime(String(formData.get('dailyTime') ?? ''));
  if (!dailyTime) back(serverId, 'error=time');
  if (channelId && !(await getServerChannels(serverId)).some((c) => c.id === channelId)) back(serverId, 'error=channel');
  if (enabled && !channelId) back(serverId, 'error=needs-channel');
  await saveQotd(serverId, { enabled, channelId, dailyTime });
  back(serverId, 'saved=1');
}

export async function addQuestionAction(serverId: string, formData: FormData): Promise<void> {
  await requireOwner(serverId);
  const question = String(formData.get('question') ?? '').trim();
  if (!question) back(serverId, 'error=empty');
  if (question.length > MAX_QUESTION_LEN) back(serverId, 'error=long');
  const session = await getSession();
  if (!session) redirect('/login');
  const user = await fetchUserinfo(session.accessToken);
  await addQotdQuestion(serverId, question, user.sub);
  back(serverId, 'saved=1');
}

export async function removeQuestionAction(serverId: string, id: number): Promise<void> {
  await requireOwner(serverId);
  await removeQotdQuestion(serverId, id);
  back(serverId, 'saved=1');
}
