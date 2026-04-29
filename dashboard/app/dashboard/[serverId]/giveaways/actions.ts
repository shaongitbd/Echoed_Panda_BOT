'use server';

import { revalidatePath } from 'next/cache';
import { listActive, nudgeEndNow, insertGiveaway } from '@/lib/queries/giveaways';
import { botSendMessage, botAddReaction } from '@/lib/botApi';
import { requireOwner, parseChannelId, parseTrimmedString, parseBoundedInt } from '@/lib/forms';
import { getSession } from '@/lib/auth';
import { fetchUserinfo } from '@/lib/echoed';

const GIVEAWAY_EMOJI = '🎉';
const ACCENT_COLOR = 0xffc928;
const MAX_PRIZE_LEN = 200;
const MAX_WINNERS = 20;
const MIN_DURATION = 30; // seconds
const MAX_DURATION = 30 * 24 * 3600; // 30 days

export interface StartResult {
  ok: boolean;
  error?: string;
}

// Mirrors !gstart from the bot. The dashboard:
//   1. Posts the giveaway embed via the bot API (so the bot owns the
//      message — winners can only be picked from reactions on its own
//      messages).
//   2. Seeds the 🎉 reaction so people don't need to click for the first
//      reaction to register on the message.
//   3. Inserts the row into panda.giveaways. The bot's 15s tick will
//      pick it up at end_at and announce winners.
export async function startGiveaway(
  serverId: string,
  formData: FormData,
): Promise<StartResult> {
  await requireOwner(serverId);

  const channelId = parseChannelId(formData.get('channelId'));
  if (!channelId) return { ok: false, error: 'Pick a channel.' };

  const winnerCount = parseBoundedInt(formData.get('winnerCount'), 1, 1, MAX_WINNERS);
  const durationSeconds = parseBoundedInt(
    formData.get('durationSeconds'),
    -1,
    MIN_DURATION,
    MAX_DURATION,
  );
  if (durationSeconds < MIN_DURATION) {
    return { ok: false, error: `Duration must be between ${MIN_DURATION}s and 30 days.` };
  }

  const prize = parseTrimmedString(formData.get('prize'), MAX_PRIZE_LEN);
  if (!prize) return { ok: false, error: 'Prize is required.' };

  // Pull the dashboard user's ID so the "Hosted by" mention resolves.
  // Fall back to "—" if userinfo fails; not worth bouncing the form for it.
  let hostId = '';
  try {
    const session = await getSession();
    if (session) {
      const u = await fetchUserinfo(session.accessToken);
      hostId = u.sub;
    }
  } catch {
    /* host stays empty — embed shows the bot itself */
  }

  const endAt = new Date(Date.now() + durationSeconds * 1000);
  const human = formatDuration(durationSeconds);

  const sent = await botSendMessage(serverId, channelId, {
    embeds: [
      {
        type: 'rich',
        title: `🎉 ${prize}`,
        description: `React with ${GIVEAWAY_EMOJI} to enter!`,
        color: ACCENT_COLOR,
        fields: [
          { name: 'Winners', value: String(winnerCount), inline: true },
          { name: 'Ends in', value: human, inline: true },
          ...(hostId ? [{ name: 'Hosted by', value: `<@${hostId}>`, inline: true }] : []),
        ],
        footer: { text: 'Giveaway ends' },
        timestamp: endAt.toISOString(),
      },
    ],
  });
  if (!sent) return { ok: false, error: 'Could not post the giveaway message.' };

  // Best-effort reaction seed; not fatal if it fails (users can still
  // react manually).
  await botAddReaction(serverId, sent.messageId, GIVEAWAY_EMOJI);

  await insertGiveaway({
    serverId,
    channelId,
    messageId: sent.messageId,
    prize,
    winnerCount,
    endAt,
    createdBy: hostId || 'dashboard',
  });

  revalidatePath(`/dashboard/${serverId}/giveaways`);
  return { ok: true };
}

// "End now": bump end_at to now() so the bot's tick claims and announces
// winners on the next 15s cycle. We don't flip ended ourselves — see
// nudgeEndNow's comment.
export async function endGiveawayNow(serverId: string, id: number): Promise<void> {
  await requireOwner(serverId);
  await nudgeEndNow(serverId, id);
  revalidatePath(`/dashboard/${serverId}/giveaways`);
}

// Just used so a Server Component re-renders with fresh state — no-op
// with side effect (revalidate). Useful for the "Refresh" button until
// we wire a real subscription.
export async function refreshGiveaways(serverId: string): Promise<void> {
  await requireOwner(serverId);
  // Touch the listActive query so any DB-level cache warms; ignored.
  await listActive(serverId);
  revalidatePath(`/dashboard/${serverId}/giveaways`);
}

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins && !days) parts.push(`${mins}m`);
  if (secs && !days && !hours) parts.push(`${secs}s`);
  return parts.join(' ') || '0s';
}
