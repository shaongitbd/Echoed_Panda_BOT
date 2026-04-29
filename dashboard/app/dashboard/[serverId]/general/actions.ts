'use server';

import { revalidatePath } from 'next/cache';
import { setGuildConfig } from '@/lib/queries/guildConfig';
import { requireOwner, parseChannelId, parseTrimmedString } from '@/lib/forms';

// "General" covers the small server-wide settings that don't fit
// any other section: command-prefix override and suggestions
// channel. Both are simple TEXT columns on guild_config.
//
// Prefix has special handling — it's a free-form short string, not
// an ID or mention. We cap at 5 chars to prevent absurd input
// (a 100-char prefix would defeat the whole purpose).
const MAX_PREFIX_LENGTH = 5;

export async function saveGeneral(serverId: string, formData: FormData): Promise<void> {
  await requireOwner(serverId);

  // Treat 'none' / blank as "clear the override" — the bot will
  // fall back to the env COMMAND_PREFIX.
  const prefixRaw = formData.get('prefix');
  let prefix: string | null = null;
  if (typeof prefixRaw === 'string') {
    const trimmed = prefixRaw.trim();
    if (trimmed.length > 0 && trimmed.toLowerCase() !== 'none') {
      prefix = parseTrimmedString(prefixRaw, MAX_PREFIX_LENGTH);
    }
  }

  const suggestionsChannel = parseChannelId(formData.get('suggestionsChannel'));

  await setGuildConfig(serverId, {
    prefix,
    suggestionsChannel,
  });

  revalidatePath(`/dashboard/${serverId}/general`);
  revalidatePath(`/dashboard/${serverId}`);
}
