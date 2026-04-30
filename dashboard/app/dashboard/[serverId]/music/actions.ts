'use server';

import { revalidatePath } from 'next/cache';
import { setGuildConfig } from '@/lib/queries/guildConfig';
import {
  requireOwner,
  parseRoleId,
  parseChannelId,
  collectIds,
} from '@/lib/forms';

export async function saveMusic(serverId: string, formData: FormData): Promise<void> {
  await requireOwner(serverId);

  // Empty/None clears the DJ role — every music control falls back to
  // requiring Manage Server. parseRoleId returns null for both cases.
  const djRoleId = parseRoleId(formData.get('djRoleId'));

  await setGuildConfig(serverId, {
    djRoleId,
    musicAllowedChannelIds: collectIds(formData, 'musicAllowedChannelIds', parseChannelId),
    musicExemptChannelIds: collectIds(formData, 'musicExemptChannelIds', parseChannelId),
    musicAllowedRoleIds: collectIds(formData, 'musicAllowedRoleIds', parseRoleId),
    musicExemptRoleIds: collectIds(formData, 'musicExemptRoleIds', parseRoleId),
  });

  revalidatePath(`/dashboard/${serverId}/music`);
  revalidatePath(`/dashboard/${serverId}`);
}
