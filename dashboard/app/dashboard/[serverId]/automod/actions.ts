'use server';

import { revalidatePath } from 'next/cache';
import { setAutomodConfig } from '@/lib/queries/automodConfig';
import {
  requireOwner,
  parseBool,
  parseBoundedInt,
  parseChannelId,
  parseRoleId,
  parseStringList,
  collectIds,
} from '@/lib/forms';

export async function saveAutomod(serverId: string, formData: FormData): Promise<void> {
  await requireOwner(serverId);

  await setAutomodConfig(serverId, {
    enabled: parseBool(formData.get('enabled')),

    invitesEnabled: parseBool(formData.get('invitesEnabled')),

    badWordsEnabled: parseBool(formData.get('badWordsEnabled')),
    badWords: parseStringList(formData.get('badWords'), 500),

    mentionsEnabled: parseBool(formData.get('mentionsEnabled')),
    mentionsThreshold: parseBoundedInt(formData.get('mentionsThreshold'), 5, 2, 50),

    linksEnabled: parseBool(formData.get('linksEnabled')),
    linkWhitelist: parseStringList(formData.get('linkWhitelist'), 200),

    capsEnabled: parseBool(formData.get('capsEnabled')),
    capsThresholdPct: parseBoundedInt(formData.get('capsThresholdPct'), 70, 30, 100),
    capsMinLength: parseBoundedInt(formData.get('capsMinLength'), 10, 1, 1000),

    emojiEnabled: parseBool(formData.get('emojiEnabled')),
    emojiThreshold: parseBoundedInt(formData.get('emojiThreshold'), 10, 2, 100),

    zalgoEnabled: parseBool(formData.get('zalgoEnabled')),

    spamEnabled: parseBool(formData.get('spamEnabled')),
    spamThreshold: parseBoundedInt(formData.get('spamThreshold'), 5, 2, 50),
    spamWindowSeconds: parseBoundedInt(formData.get('spamWindowSeconds'), 5, 1, 60),

    allowedChannelIds: collectIds(formData, 'allowedChannelIds', parseChannelId),
    exemptChannelIds: collectIds(formData, 'exemptChannelIds', parseChannelId),
    allowedRoleIds: collectIds(formData, 'allowedRoleIds', parseRoleId),
    exemptRoleIds: collectIds(formData, 'exemptRoleIds', parseRoleId),
  });

  revalidatePath(`/dashboard/${serverId}/automod`);
  revalidatePath(`/dashboard/${serverId}`);
}
