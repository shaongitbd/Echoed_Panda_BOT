'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  saveCommandRule,
  setCommandEnabled,
  deleteCommandRule,
  MAX_COOLDOWN_SECONDS,
  MAX_LIST,
} from '@/lib/queries/commandSettings';
import { listCommands } from '@/lib/queries/customCommands';
import { describeScope } from '@/lib/commandCatalog';
import { requireOwner, parseBool, collectIds, parseChannelId, parseRoleId } from '@/lib/forms';

// A scope from the URL or a form is only written if it names something the
// bot knows: every command, a category, a built-in, or one of this server's
// custom commands.
async function assertKnownScope(serverId: string, scope: string): Promise<void> {
  if (describeScope(scope)) return;
  const custom = await listCommands(serverId);
  if (custom.some((cmd) => cmd.name === scope)) return;
  throw new Error(`Unknown command scope: ${scope}`);
}

function parseCooldown(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(MAX_COOLDOWN_SECONDS, Math.floor(n)));
}

export async function saveRule(serverId: string, scope: string, formData: FormData): Promise<void> {
  await requireOwner(serverId);
  await assertKnownScope(serverId, scope);

  const ignoredChannelIds = collectIds(formData, 'ignoredChannelIds', parseChannelId).slice(0, MAX_LIST);
  const ignoredRoleIds = collectIds(formData, 'ignoredRoleIds', parseRoleId).slice(0, MAX_LIST);
  await saveCommandRule(serverId, {
    scope,
    enabled: parseBool(formData.get('enabled')),
    // An id in both lists is ignored (the ignore list wins), so keep it
    // out of the allow list rather than store a contradiction.
    allowedChannelIds: collectIds(formData, 'allowedChannelIds', parseChannelId)
      .filter((id) => !ignoredChannelIds.includes(id))
      .slice(0, MAX_LIST),
    ignoredChannelIds,
    allowedRoleIds: collectIds(formData, 'allowedRoleIds', parseRoleId)
      .filter((id) => !ignoredRoleIds.includes(id))
      .slice(0, MAX_LIST),
    ignoredRoleIds,
    cooldownSeconds: parseCooldown(formData.get('cooldownSeconds')),
    deleteInvocation: parseBool(formData.get('deleteInvocation')),
  });

  revalidatePath(`/dashboard/${serverId}/commands`);
  revalidatePath(`/dashboard/${serverId}/commands/edit`);
}

export async function toggleRule(serverId: string, scope: string, enabled: boolean): Promise<void> {
  await requireOwner(serverId);
  await assertKnownScope(serverId, scope);
  await setCommandEnabled(serverId, scope, enabled);
  revalidatePath(`/dashboard/${serverId}/commands`);
}

export async function resetRule(serverId: string, scope: string): Promise<void> {
  await requireOwner(serverId);
  await assertKnownScope(serverId, scope);
  await deleteCommandRule(serverId, scope);
  revalidatePath(`/dashboard/${serverId}/commands`);
  redirect(`/dashboard/${serverId}/commands`);
}
