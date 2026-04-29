'use server';

import { revalidatePath } from 'next/cache';
import { removeReactionRole, setMode, type ReactRoleMode } from '@/lib/queries/reactionRoles';
import { requireOwner } from '@/lib/forms';

const VALID_MODES: ReadonlySet<string> = new Set(['normal', 'unique', 'verify']);

export async function deleteMapping(
  serverId: string,
  messageId: string,
  emoji: string,
): Promise<void> {
  await requireOwner(serverId);
  await removeReactionRole(serverId, messageId, emoji);
  revalidatePath(`/dashboard/${serverId}/reactionroles`);
}

export async function changeMode(
  serverId: string,
  messageId: string,
  formData: FormData,
): Promise<void> {
  await requireOwner(serverId);
  const raw = formData.get('mode');
  if (typeof raw !== 'string' || !VALID_MODES.has(raw)) return;
  await setMode(serverId, messageId, raw as ReactRoleMode);
  revalidatePath(`/dashboard/${serverId}/reactionroles`);
}
