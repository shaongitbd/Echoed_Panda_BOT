'use server';

import { revalidatePath } from 'next/cache';
import { LOG_EVENTS, saveLogConfig, type LogEventName } from '@/lib/queries/logConfig';
import { requireOwner, parseBool, parseChannelId, collectIds } from '@/lib/forms';

export async function saveLogging(serverId: string, formData: FormData): Promise<void> {
  await requireOwner(serverId);

  // Each event is a checkbox named `event:<name>`; an unchecked box is absent
  // from the form, which is what "switched off" means here.
  const disabledEvents: LogEventName[] = LOG_EVENTS.filter(
    (e) => !parseBool(formData.get(`event:${e.name}`)),
  ).map((e) => e.name);

  await saveLogConfig({
    serverId,
    messageChannel: parseChannelId(formData.get('messageChannel')),
    memberChannel: parseChannelId(formData.get('memberChannel')),
    disabledEvents,
    ignoredChannelIds: [...new Set(collectIds(formData, 'ignoredChannelIds', parseChannelId))],
    // The toggle reads "Log messages written by bots", the column stores the
    // opposite.
    ignoreBots: !parseBool(formData.get('logBots')),
  });

  revalidatePath(`/dashboard/${serverId}/logging`);
}
