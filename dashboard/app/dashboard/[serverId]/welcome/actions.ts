'use server';

import { revalidatePath } from 'next/cache';
import { setGuildConfig } from '@/lib/queries/guildConfig';
import {
  requireOwner,
  parseChannelId,
  parseRoleId,
  parseTrimmedString,
} from '@/lib/forms';

export async function saveWelcome(serverId: string, formData: FormData): Promise<void> {
  await requireOwner(serverId);

  const welcomeChannel = parseChannelId(formData.get('welcomeChannel'));
  const autoroleId = parseRoleId(formData.get('autoroleId'));
  const welcomeMessage = parseTrimmedString(formData.get('welcomeMessage'), 1000);

  await setGuildConfig(serverId, {
    welcomeChannel,
    welcomeMessage,
    autoroleId,
  });

  revalidatePath(`/dashboard/${serverId}/welcome`);
  revalidatePath(`/dashboard/${serverId}`);
}
