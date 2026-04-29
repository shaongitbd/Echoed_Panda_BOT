'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { fetchUserinfo } from '@/lib/echoed';
import { setGuildConfig } from '@/lib/queries/guildConfig';

async function requireOwner(serverId: string): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/login');
  const user = await fetchUserinfo(session.accessToken);
  const owns = (user.owned_servers ?? []).some((s) => s.id === serverId);
  if (!owns) redirect('/dashboard');
}

function parseChannelId(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === 'none') return null;
  const m = /^<#([a-zA-Z0-9_-]+)>$/.exec(trimmed);
  if (m?.[1]) return m[1];
  return /^[a-zA-Z0-9_-]{8,}$/.test(trimmed) ? trimmed : null;
}

function parseRoleId(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === 'none') return null;
  const m = /^<@&([a-zA-Z0-9_-]+)>$/.exec(trimmed);
  if (m?.[1]) return m[1];
  return /^[a-zA-Z0-9_-]{8,}$/.test(trimmed) ? trimmed : null;
}

export async function saveWelcome(serverId: string, formData: FormData): Promise<void> {
  await requireOwner(serverId);

  const welcomeChannel = parseChannelId(formData.get('welcomeChannel'));
  const autoroleId = parseRoleId(formData.get('autoroleId'));

  const rawMsg = formData.get('welcomeMessage');
  const welcomeMessage =
    typeof rawMsg === 'string' && rawMsg.trim().length > 0 ? rawMsg.trim().slice(0, 1000) : null;

  await setGuildConfig(serverId, {
    welcomeChannel,
    welcomeMessage,
    autoroleId,
  });

  revalidatePath(`/dashboard/${serverId}/welcome`);
  revalidatePath(`/dashboard/${serverId}`);
}
