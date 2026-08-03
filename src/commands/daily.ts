import type { Handler } from './index.js';
import { claimDaily, utcDateString } from '../daily/store.js';
import { addBonusXp } from '../levels/grant.js';
import { getLevelSettings } from '../db/levelSettings.js';
import { handleLevelUp } from '../levels/levelUp.js';
import { buildEmbed, COLORS, field } from '../client/embeds.js';

const BASE_XP = 100;
const PER_STREAK_XP = 10;
const STREAK_CAP = 30; // bonus stops growing past 30-day streaks

// Fun flavor at streak milestones.
function milestone(streak: number): string | null {
  switch (streak) {
    case 3: return '3 days — warming up. 🔥';
    case 7: return 'A full week! 🔥🔥';
    case 14: return 'Two weeks straight. Dedicated. 🔥🔥🔥';
    case 30: return '30 days! You basically live here now. 🏆';
    case 100: return '💯 ONE HUNDRED DAYS. Legendary.';
    case 365: return '365 days. A full year. We should be paying YOU. 👑';
    default: return null;
  }
}

export const handleDaily: Handler = async (ctx, svc) => {
  const now = new Date();
  const today = utcDateString(now);
  const yesterday = utcDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  const result = await claimDaily(ctx.serverId, ctx.senderId, today, yesterday);

  if (result.alreadyClaimed) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `🕐 You've already checked in today. Current streak: **${result.streak} day${result.streak === 1 ? '' : 's'}** — come back after **00:00 UTC**.`,
    });
    return;
  }

  // XP bonus scales with streak (capped). Only actually grant XP when the
  // server has leveling enabled; the streak itself is tracked regardless.
  const amount = BASE_XP + Math.min(result.streak, STREAK_CAP) * PER_STREAK_XP;
  let leveledTo: number | null = null;
  let xpAwarded = 0;
  try {
    const settings = await getLevelSettings(ctx.serverId);
    if (settings.enabled) {
      xpAwarded = amount;
      const bonus = await addBonusXp(ctx.serverId, ctx.senderId, amount);
      if (bonus.leveledUp) {
        leveledTo = bonus.newLevel;
        await handleLevelUp(svc.api, {
          serverId: ctx.serverId,
          userId: ctx.senderId,
          fallbackChannelId: ctx.channelId,
          oldLevel: bonus.oldLevel,
          newLevel: bonus.newLevel,
        });
      }
    }
  } catch {
    // XP is a bonus on top of the streak — never fail the check-in over it.
  }

  const streakLine = result.continued
    ? `🔥 Streak: **${result.streak} days** (best: ${result.bestStreak})`
    : result.streak === 1 && result.totalClaims === 1
      ? '👋 First check-in! Come back tomorrow to start a streak.'
      : `🔥 New streak started — day **${result.streak}**.`;

  const fields = [field('Streak', `${result.streak} 🔥`, true), field('Best', `${result.bestStreak}`, true)];
  if (xpAwarded > 0) fields.push(field('Reward', `+${xpAwarded} XP`, true));

  const ms = milestone(result.streak);
  const desc = [streakLine, ms ? `\n**${ms}**` : '', leveledTo !== null ? `\n🎉 You reached **level ${leveledTo}**!` : '']
    .filter(Boolean)
    .join('\n');

  // Whose check-in this is has to be visible: the card is otherwise
  // identical for everyone. Reply to the invoking message and name them in
  // the title — deliberately no mention, since self-pinging someone for
  // running their own command is just noise.
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    replyToId: ctx.messageId,
    content: '',
    embeds: [
      buildEmbed({
        title: `✅ Daily check-in · ${ctx.senderName}`,
        description: desc,
        color: COLORS.ONLINE,
        fields,
      }),
    ],
  });
};
