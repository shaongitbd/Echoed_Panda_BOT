'use server';

import { revalidatePath } from 'next/cache';
import { setGuildConfig } from '@/lib/queries/guildConfig';
import {
  requireOwner,
  parseBool,
  parseBoundedInt,
  parseChannelId,
} from '@/lib/forms';

export async function saveModeration(serverId: string, formData: FormData): Promise<void> {
  await requireOwner(serverId);

  const modlogChannel = parseChannelId(formData.get('modlogChannel'));
  const antiRaidEnabled = parseBool(formData.get('antiRaidEnabled'));
  const antiRaidThreshold = parseBoundedInt(formData.get('antiRaidThreshold'), 10, 2, 200);
  const antiRaidWindowSeconds = parseBoundedInt(
    formData.get('antiRaidWindowSeconds'),
    30,
    5,
    600,
  );

  // We deliberately don't take antiRaidLockdownUntil from the form —
  // that value is bot-managed runtime state, not config. Admins clear
  // it via the dedicated "Clear lockdown" button below.
  await setGuildConfig(serverId, {
    modlogChannel,
    antiRaidEnabled,
    antiRaidThreshold,
    antiRaidWindowSeconds,
  });

  revalidatePath(`/dashboard/${serverId}/moderation`);
  revalidatePath(`/dashboard/${serverId}`);
}

// Separate action for the "Clear lockdown" button — it isn't part of
// the main form so the admin can hit it anytime without needing to
// also save other changes.
export async function clearLockdown(serverId: string): Promise<void> {
  await requireOwner(serverId);
  await setGuildConfig(serverId, { antiRaidLockdownUntil: null });
  revalidatePath(`/dashboard/${serverId}/moderation`);
}
