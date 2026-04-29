'use server';

import { revalidatePath } from 'next/cache';
import { addCommand, removeCommand, isValidName, isReservedName } from '@/lib/queries/customCommands';
import { requireOwner, parseTrimmedString } from '@/lib/forms';

export interface AddCmdResult {
  ok: boolean;
  error?: string;
}

export async function addCustomCommand(
  serverId: string,
  userId: string,
  formData: FormData,
): Promise<AddCmdResult> {
  await requireOwner(serverId);

  const rawName = formData.get('name');
  const name = typeof rawName === 'string' ? rawName.trim().toLowerCase() : '';
  const response = parseTrimmedString(formData.get('response'), 1900);

  if (!name || !response) {
    return { ok: false, error: 'Name and response are required.' };
  }
  if (!isValidName(name)) {
    return {
      ok: false,
      error: 'Name must be lowercase a-z / 0-9 / dash / underscore, max 32 chars.',
    };
  }
  if (isReservedName(name)) {
    return { ok: false, error: `\`${name}\` is a built-in command.` };
  }

  await addCommand({ serverId, name, response, createdBy: userId });
  revalidatePath(`/dashboard/${serverId}/customcommands`);
  return { ok: true };
}

export async function removeCustomCommand(serverId: string, name: string): Promise<void> {
  await requireOwner(serverId);
  await removeCommand(serverId, name);
  revalidatePath(`/dashboard/${serverId}/customcommands`);
}
