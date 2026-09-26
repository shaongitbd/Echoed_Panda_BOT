'use server';

import { revalidatePath } from 'next/cache';
import { setGuildConfig } from '@/lib/queries/guildConfig';
import {
  replaceEscalations,
  parseDuration,
  MAX_RULES,
  MAX_WARN_COUNT,
  MAX_TIMEOUT_SECONDS,
  type EscalationAction,
  type EscalationRule,
} from '@/lib/queries/escalation';
import {
  requireOwner,
  parseBool,
  parseBoundedInt,
  parseChannelId,
  parseRoleId,
  collectIds,
} from '@/lib/forms';

// Escalation rows arrive as esc_count_<i> / esc_action_<i> / esc_duration_<i>.
// A row with no count or no action is an empty slot. Two rows for the same
// count: the later one wins. A timeout without a readable duration (or
// under a minute) is dropped rather than guessed.
function parseEscalationRows(formData: FormData): EscalationRule[] {
  const byCount = new Map<number, EscalationRule>();
  for (let i = 0; i < MAX_RULES; i++) {
    const count = Number(formData.get(`esc_count_${i}`));
    const action = String(formData.get(`esc_action_${i}`) ?? '') as EscalationAction | '';
    if (!Number.isInteger(count) || count < 1 || count > MAX_WARN_COUNT) continue;
    if (action !== 'timeout' && action !== 'kick' && action !== 'ban') continue;
    let durationSeconds: number | null = null;
    if (action === 'timeout') {
      durationSeconds = parseDuration(String(formData.get(`esc_duration_${i}`) ?? ''));
      if (!durationSeconds || durationSeconds < 60) continue;
      durationSeconds = Math.min(durationSeconds, MAX_TIMEOUT_SECONDS);
    }
    byCount.set(count, { warnCount: count, action, durationSeconds });
  }
  return [...byCount.values()].sort((a, b) => a.warnCount - b.warnCount).slice(0, MAX_RULES);
}

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
    modRoleIds: [...new Set(collectIds(formData, 'modRoleIds', parseRoleId))].slice(0, 25),
    protectedRoleIds: [...new Set(collectIds(formData, 'protectedRoleIds', parseRoleId))].slice(0, 25),
  });
  await replaceEscalations(serverId, parseEscalationRows(formData));

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
