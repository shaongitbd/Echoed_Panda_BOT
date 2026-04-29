'use server';

import { revalidatePath } from 'next/cache';
import { setLevelSettings } from '@/lib/queries/levelSettings';
import { setReward, removeReward } from '@/lib/queries/levelRewards';
import {
  requireOwner,
  parseBool,
  parseBoundedInt,
  parseChannelId,
  parseRoleId,
  parseTrimmedString,
} from '@/lib/forms';

// Save the level-settings form. Each field comes from the page's
// single big <form>; we read whatever's present and let parsers
// coerce / clamp / null-out.
export async function saveLevels(serverId: string, formData: FormData): Promise<void> {
  await requireOwner(serverId);

  const enabled = parseBool(formData.get('enabled'));
  const stackRewards = parseBool(formData.get('stackRewards'));
  const levelUpChannel = parseChannelId(formData.get('levelUpChannel'));
  // ChannelScope (modes: all | except) — 'all' clears the list,
  // 'except' stores the picked channels as the no-XP set.
  const noXpMode = (formData.get('noXpChannelIds_mode') as string | null) ?? 'all';
  const noXpChannelIds =
    noXpMode === 'except'
      ? formData
          .getAll('noXpChannelIds')
          .map((v) => parseChannelId(v))
          .filter((v): v is string => v != null)
      : [];
  const levelUpMessage = parseTrimmedString(formData.get('levelUpMessage'), 500);

  const xpPerMessageMin = parseBoundedInt(formData.get('xpPerMessageMin'), 15, 1, 200);
  // Max must be ≥ Min. We bound Max above by 500 and use the just-
  // parsed Min as its lower bound so the form can't save a state
  // where max < min.
  const xpPerMessageMax = parseBoundedInt(
    formData.get('xpPerMessageMax'),
    Math.max(25, xpPerMessageMin),
    xpPerMessageMin,
    500,
  );
  const cooldownSeconds = parseBoundedInt(formData.get('cooldownSeconds'), 60, 0, 3600);

  await setLevelSettings(serverId, {
    enabled,
    stackRewards,
    levelUpChannel,
    levelUpMessage,
    noXpChannelIds,
    xpPerMessageMin,
    xpPerMessageMax,
    cooldownSeconds,
  });

  revalidatePath(`/dashboard/${serverId}/levels`);
  revalidatePath(`/dashboard/${serverId}`);
}

// ─── Level rewards ─────────────────────────────────────────────────────
//
// Add / remove role rewards at a level threshold. Validation: level
// must be 1-1000, role must parse. Replacing an existing reward at
// the same level is allowed (upsert).

export interface AddRewardResult {
  ok: boolean;
  error?: string;
}

export async function addLevelReward(
  serverId: string,
  formData: FormData,
): Promise<AddRewardResult> {
  await requireOwner(serverId);

  const level = parseBoundedInt(formData.get('level'), -1, 1, 1000);
  if (level < 1) return { ok: false, error: 'Level must be between 1 and 1000.' };

  const roleId = parseRoleId(formData.get('roleId'));
  if (!roleId) return { ok: false, error: 'Role is required.' };

  await setReward(serverId, level, roleId);
  revalidatePath(`/dashboard/${serverId}/levels`);
  return { ok: true };
}

export async function removeLevelReward(serverId: string, level: number): Promise<void> {
  await requireOwner(serverId);
  await removeReward(serverId, level);
  revalidatePath(`/dashboard/${serverId}/levels`);
}
