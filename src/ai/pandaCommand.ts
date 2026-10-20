// `!panda` — talk to the moderation AI.
//
//   !panda <anything>         a moderator asks in plain words: "who spams the
//                             most here?", "what's going on in #general?",
//                             "delete everything this guy posted today and
//                             time him out". The agent (ai/agent.ts) looks
//                             things up with tools and answers; any action is
//                             shown as a preview that the same moderator must
//                             confirm with ✅.
//   (plain reply)             replying to one of Panda's answers continues the
//                             conversation — no prefix needed.
//   !panda context [text|clear]   this channel's rules for the AI (Manage Server)
//   !panda on | off               AI moderation in this channel (Manage Server)
//   !panda status                 how this channel is set up, today's usage
//
// Safety — keep these when changing this file (ai/agent.ts has the rest):
//   1. WHO is acting is the backend's senderId for the request and the
//      backend's userId for the ✅ reaction. No text and no model output can
//      change it, and only that same moderator can confirm.
//   2. WHAT may happen is a fixed vocabulary of actions, shown in a preview,
//      confirmed, and re-checked against THAT moderator's permissions by the
//      executor at execution time. The model only proposes.
//   3. FOLLOW-UPS read this moderator's own recent exchanges in this channel
//      (ai/conversation.ts, Postgres, scoped server + channel + moderator);
//      people carry over by the exact ids Panda recorded, never by name.

import type { Handler, Services } from '../commands/index.js';
import type { CommandContext, ReactionEventData } from '../types.js';
import type { ChannelMessage } from '../client/echoedClient.js';
import type { Permission } from '../auth/permissions.js';
import { checkModerator } from '../mod/authority.js';
import { buildEmbed, COLORS } from '../client/embeds.js';
import { resolveUser } from '../client/names.js';
import { log } from '../log.js';
import { config } from '../config.js';
import { getGuildConfig } from '../db/guildConfig.js';
import {
  getAiChannelRule,
  getAiCredentials,
  getAiSettings,
  getAiChannelScope,
  ALL_CHANNELS,
  MAX_CONTEXT_CHARS,
  setAiChannelContext,
  setAiChannelEnabled,
} from './settings.js';
import { checksToday, claimDailyCheck } from './usage.js';
import { isAnswerTo, recallTurns, rememberTurn, turnsInLastHour } from './conversation.js';
import { performAction, type ActionRequest } from './executor.js';
import { describeRequest, runAgent, type Proposal } from './agent.js';
import { announceChanges, applyPlan, changesInLastHour, describePlan, overHourlyCap, planTouchesRoles, type ConfigPlan } from './configTools.js';

const CONFIRM = '✅';
const CANCEL = '❌';
const CONFIRM_TTL_MS = 2 * 60_000;
const MAX_REQUEST_CHARS = 1000;

// ── Entry ──────────────────────────────────────────────────────────────────

export const handlePanda: Handler = async (ctx, svc) => {
  const sub = ctx.args[0]?.toLowerCase();
  if (!sub || sub === 'help') return reply(ctx, svc, helpText(ctx.prefix));
  if (sub === 'context') return handleContext(ctx, svc);
  if (sub === 'on' || sub === 'off') return handleToggle(ctx, svc, sub === 'on');
  if (sub === 'status') return handleStatus(ctx, svc);
  return handleRequest(ctx, svc);
};

function helpText(prefix: string): string {
  return [
    '**Panda AI moderation**',
    `\`${prefix}panda <anything>\` — ask in plain words: "who spams the most here?", "what happened in #general last night?", "delete this guy's messages from today and time him out". I look things up and answer; for an action I show a preview and wait for your ✅.`,
    `To follow up, just reply to my answer — "time out #1 for a day" — no \`${prefix}panda\` needed.`,
    `Admins can also set Panda up in plain words — "make #staff-log the mod-log", "turn on counting in a new #counting channel" — if the server owner allowed it on the dashboard. Every change is previewed, needs your ✅, and is posted to the mod-log.`,
    `\`${prefix}panda context <rules>\` — set this channel's rules for the AI (\`${prefix}panda context\` shows them, \`clear\` removes them).`,
    `\`${prefix}panda on\` / \`off\` — AI moderation in this channel. \`${prefix}panda on all\` / \`off all\` — in every channel (a channel switched off stays off). \`${prefix}panda status\` — how it's set up.`,
    'The server owner adds the OpenRouter key and model at https://panda.echoed.gg.',
  ].join('\n');
}

async function reply(ctx: CommandContext, svc: Services, content: string): Promise<void> {
  await send(ctx, svc, content);
}

/** Reply to the command; the sent message's id, or null if it failed. */
async function send(ctx: CommandContext, svc: Services, content: string): Promise<string | null> {
  try {
    const sent = await svc.api.sendMessage({ serverId: ctx.serverId, channelId: ctx.channelId, replyToId: ctx.messageId, content });
    return sent.messageId ?? null;
  } catch (err) {
    log.warn({ err, serverId: ctx.serverId }, '!panda reply failed');
    return null;
  }
}

// Rules for the AI are instructions to it, so only admins write them —
// Manage Server itself, not a moderator role.
async function requireAdmin(ctx: CommandContext, svc: Services): Promise<boolean> {
  const verdict = await svc.perms.check(ctx.serverId, ctx.senderId, 'MANAGE_SERVER');
  if (verdict === 'granted') return true;
  await reply(
    ctx, svc,
    verdict === 'unavailable'
      ? "I couldn't verify your permissions just now — try again in a moment."
      : 'You need the **Manage Server** permission to change AI moderation.',
  );
  return false;
}

// ── context / on / off / status ────────────────────────────────────────────

async function handleContext(ctx: CommandContext, svc: Services): Promise<void> {
  const text = argumentText(ctx, 2);
  if (!text) {
    // Showing the rules is fine for moderators; setting them is admin-only.
    if (!(await isModerator(ctx, svc))) return reply(ctx, svc, 'Only moderators can see the AI rules.');
    const rule = await getAiChannelRule(ctx.serverId, ctx.channelId);
    return reply(
      ctx, svc,
      rule?.context
        ? `**AI rules for this channel${rule.inherited ? ' (the every-channel rules)' : ''}:**\n${rule.context}`
        : `No AI rules for this channel yet. Set them with \`${ctx.prefix}panda context <rules>\`.`,
    );
  }
  if (!(await requireAdmin(ctx, svc))) return;
  if (text.toLowerCase() === 'clear') {
    await setAiChannelContext(ctx.serverId, ctx.channelId, '');
    return reply(ctx, svc, 'Cleared the AI rules for this channel.');
  }
  if (text.length > MAX_CONTEXT_CHARS) {
    return reply(ctx, svc, `That's ${text.length} characters — the limit is ${MAX_CONTEXT_CHARS}.`);
  }
  await setAiChannelContext(ctx.serverId, ctx.channelId, text);
  const settings = await getAiSettings(ctx.serverId);
  const rule = await getAiChannelRule(ctx.serverId, ctx.channelId);
  const live = settings?.enabled && settings.keyHint && settings.model && rule?.enabled;
  return reply(
    ctx, svc,
    `Saved the AI rules for this channel.${live ? '' : `\nAI moderation isn't running here yet — ${setupHint(ctx.prefix, settings, rule?.enabled ?? false)}`}`,
  );
}

async function handleToggle(ctx: CommandContext, svc: Services, on: boolean): Promise<void> {
  if (!(await requireAdmin(ctx, svc))) return;
  const everywhere = ctx.args[1]?.toLowerCase() === 'all';
  // Every channel on sends every channel's messages to OpenRouter — the
  // owner's call (as on the dashboard, which only the owner can use).
  // Turning it off only ever narrows that, so any admin may.
  if (everywhere && on) {
    const info = await svc.api.getServerInfo(ctx.serverId).catch(() => null);
    if (!info?.ownerId || info.ownerId !== ctx.senderId) {
      return reply(ctx, svc, 'Only the server owner can turn AI moderation on for every channel (it sends every channel\'s messages to the AI). They can do it here or on the dashboard.');
    }
  }
  await setAiChannelEnabled(ctx.serverId, everywhere ? ALL_CHANNELS : ctx.channelId, on);
  if (everywhere && !on) {
    return reply(ctx, svc, 'AI moderation is **off** for every channel. Channels switched on one by one stay on.');
  }
  if (!on) return reply(ctx, svc, 'AI moderation is **off** in this channel.');
  const settings = await getAiSettings(ctx.serverId);
  const ready = settings?.enabled && settings.keyHint && settings.model;
  const what = everywhere
    ? `AI moderation is **on** in every channel. Turn a channel off with \`${ctx.prefix}panda off\` there; the every-channel rules are on the dashboard.`
    : 'AI moderation is **on** in this channel.';
  return reply(ctx, svc, `${what}${ready ? '' : `\nIt won't run until ${setupHint(ctx.prefix, settings, true)}`}`);
}

function setupHint(prefix: string, settings: Awaited<ReturnType<typeof getAiSettings>>, channelOn: boolean): string {
  if (!settings?.keyHint || !settings.model) return 'the server owner adds an OpenRouter key and model at https://panda.echoed.gg.';
  if (!settings.enabled) return 'the server owner turns AI moderation on at https://panda.echoed.gg.';
  if (!channelOn) return `it's switched on for this channel with \`${prefix}panda on\`.`;
  return 'its settings are saved.';
}

async function handleStatus(ctx: CommandContext, svc: Services): Promise<void> {
  if (!(await isModerator(ctx, svc))) return reply(ctx, svc, 'Only moderators can see the AI moderation status.');
  const [settings, rule] = await Promise.all([
    getAiSettings(ctx.serverId),
    getAiChannelRule(ctx.serverId, ctx.channelId),
  ]);
  const used = settings ? await checksToday(ctx.serverId) : 0;
  const lines = [
    `**Server:** ${settings?.enabled ? 'on' : 'off'} · model ${settings?.model ? `\`${settings.model}\`` : '—'} · key ${settings?.keyHint ? `…${settings.keyHint}` : '—'}`,
    `**Today:** ${used} / ${settings?.dailyCheckCap ?? 0} AI checks`,
    `**This channel:** ${rule?.enabled ? 'on' : 'off'}${rule?.inherited ? ' (every-channel rules)' : ''}${rule ? ` · reads the last ${rule.historySize} messages · may ${rule.allowedActions.join(', ') || 'do nothing'} · needs ${rule.minConfidence}% (kick/ban ${rule.kickbanMinConfidence}%)` : ''}`,
    rule?.context ? `**Rules:** ${rule.context.slice(0, 300)}${rule.context.length > 300 ? '…' : ''}` : '**Rules:** none',
  ];
  return reply(ctx, svc, lines.join('\n'));
}

// ── Moderator requests ─────────────────────────────────────────────────────

/** Any moderation authority in this channel: enough to ASK. Each action is still checked on its own. */
async function isModerator(ctx: CommandContext, svc: Services): Promise<boolean> {
  const checks: [Permission, string | undefined][] = [
    ['MANAGE_MESSAGES', ctx.channelId],
    ['MUTE_MEMBERS', undefined],
    ['MODERATE_MEMBERS', undefined],
    ['KICK_MEMBERS', undefined],
    ['BAN_MEMBERS', undefined],
  ];
  for (const [perm, channelId] of checks) {
    if ((await checkModerator(svc.api, svc.perms, ctx.serverId, ctx.senderId, perm, channelId)) === 'granted') {
      return true;
    }
  }
  return false;
}

/** The command's own words after `!panda` (and after `skip` more tokens). */
function argumentText(ctx: CommandContext, skip: number): string {
  // Re-derive from rawContent (not args) so spacing and quotes survive.
  const body = ctx.rawContent.trim().slice(ctx.prefix.length).trim();
  const parts = body.split(/\s+/);
  let rest = body;
  for (let i = 0; i < skip && parts[i]; i++) rest = rest.slice(rest.indexOf(parts[i]!) + parts[i]!.length).trim();
  return rest.replace(/^["“](.*)["”]$/s, '$1').trim();
}

const convoKey = (ctx: CommandContext) => ({ serverId: ctx.serverId, channelId: ctx.channelId, userId: ctx.senderId });

/**
 * A moderator's plain reply (no `!panda`) to one of Panda's answers to
 * THEM, in this channel, within the follow-up window: handled exactly as
 * `!panda <their text>`. Anything else is ignored before any model call —
 * the check is one indexed lookup, and only runs for replies.
 */
export async function handlePandaFollowUp(
  svc: Services,
  msg: Omit<CommandContext, 'args' | 'prefix'>,
): Promise<void> {
  if (!msg.replyToId) return;
  const text = msg.rawContent.trim();
  if (!text) return;
  // Most servers don't use AI moderation: stop at the cached setting before
  // touching the database for every reply.
  if (!(await getAiSettings(msg.serverId))?.enabled) return;
  // A reply that's a command is the dispatcher's, not a follow-up.
  const prefix = (await getGuildConfig(msg.serverId)).prefix ?? config.defaultPrefix;
  if (text.startsWith(prefix)) return;
  const ctx: CommandContext = { ...msg, args: [], prefix };
  if (!(await isAnswerTo(convoKey(ctx), msg.replyToId))) return;
  await handleRequest(ctx, svc, text);
}

async function handleRequest(ctx: CommandContext, svc: Services, text?: string): Promise<void> {
  // Manage Server counts as staff here even without moderation permissions.
  const isAdmin = (await svc.perms.check(ctx.serverId, ctx.senderId, 'MANAGE_SERVER')) === 'granted';
  if (!isAdmin && !(await isModerator(ctx, svc))) {
    return reply(ctx, svc, 'Only moderators can ask me to moderate.');
  }
  const creds = await getAiCredentials(ctx.serverId);
  const settings = await getAiSettings(ctx.serverId);
  if (!creds || !settings) {
    return reply(ctx, svc, `AI moderation isn't set up here — ${setupHint(ctx.prefix, settings, true)}`);
  }
  const request = (text ?? argumentText(ctx, 1)).slice(0, MAX_REQUEST_CHARS);
  if (!request) return reply(ctx, svc, helpText(ctx.prefix));
  // Messages are read only from AI-moderated channels (the agent enforces
  // it); Panda's own records and setup work without any.
  const aiChannels = await getAiChannelScope(ctx.serverId);
  // Settings changes: the owner's switch AND this person's Manage Server.
  const configAllowed = settings.allowConfig && isAdmin;
  // The moderation record: the same bar as !modlogs / !case.
  const recordsAllowed = isAdmin
    || (await checkModerator(svc.api, svc.perms, ctx.serverId, ctx.senderId, 'KICK_MEMBERS')) === 'granted';
  // Cost limits per person (the daily cap is per server): one question at a
  // time, and MAX_QUESTIONS_PER_HOUR an hour.
  const runKey = `${ctx.serverId}:${ctx.senderId}`;
  if (running.has(runKey)) {
    return reply(ctx, svc, "I'm still working on your last question — give me a moment.");
  }
  if ((await turnsInLastHour(ctx.serverId, ctx.senderId)) >= MAX_QUESTIONS_PER_HOUR) {
    return reply(ctx, svc, `That's ${MAX_QUESTIONS_PER_HOUR} questions in the last hour — please wait a bit before asking more.`);
  }
  if (!(await claimDailyCheck(ctx.serverId, settings.dailyCheckCap))) {
    return reply(ctx, svc, "Today's AI check limit for this server is used up. The owner can raise it on the dashboard.");
  }
  running.add(runKey);
  try {
    await answerRequest(ctx, svc, request, creds, settings.dailyCheckCap, aiChannels, configAllowed, recordsAllowed);
  } finally {
    running.delete(runKey);
  }
}

/** Questions running right now, by server:person — at most one each; entries leave when the question ends. */
const running = new Set<string>();
const MAX_QUESTIONS_PER_HOUR = 30;

async function answerRequest(
  ctx: CommandContext,
  svc: Services,
  request: string,
  creds: { apiKey: string; model: string },
  dailyCap: number,
  aiChannels: Awaited<ReturnType<typeof getAiChannelScope>>,
  configAllowed: boolean,
  recordsAllowed: boolean,
): Promise<void> {
  // The replied-to message, if it's in this channel (a follow-up replies to
  // Panda's own answer — the agent leaves that one out).
  let replied: ChannelMessage | null = null;
  if (ctx.replyToId) {
    try {
      const msg = await svc.api.getMessage(ctx.serverId, ctx.replyToId);
      if (msg.channelId === ctx.channelId && msg.author?.id) replied = msg;
    } catch (err) {
      log.debug({ err, replyToId: ctx.replyToId }, '!panda: replied message lookup failed');
    }
  }

  // Say something at once; the agent edits its progress, then the answer, into it.
  const statusId = await send(ctx, svc, '🔎 Looking into it…');
  const edit = async (content: string) => {
    if (!statusId) return;
    await svc.api.editMessage({ serverId: ctx.serverId, messageId: statusId, content });
  };

  const [history, rule] = await Promise.all([
    recallTurns(convoKey(ctx)),
    getAiChannelRule(ctx.serverId, ctx.channelId),
  ]);
  const outcome = await runAgent({
    svc,
    ctx,
    request,
    creds,
    dailyCap,
    sampleSize: rule?.historySize || 8,
    aiChannels,
    configAllowed,
    recordsAllowed,
    history,
    replied,
    onProgress: edit,
  });

  // The answer replaces the progress line (or is sent fresh if that failed).
  let answerId = statusId;
  try {
    if (statusId) await edit(outcome.answer);
    else answerId = await send(ctx, svc, outcome.answer);
  } catch (err) {
    log.debug({ err, serverId: ctx.serverId }, '!panda: editing the answer in failed');
    answerId = await send(ctx, svc, outcome.answer);
  }
  await rememberTurn({ ...convoKey(ctx), userName: ctx.senderName }, { request, answer: outcome.answer, people: outcome.people }, answerId);

  if (outcome.proposal) await postPreview(ctx, svc, request, outcome.proposal, outcome.channelNames, outcome.people);
  if (outcome.configPlan && configAllowed) await postConfigPreview(ctx, svc, request, outcome.configPlan, outcome.people);
}

// ── The preview ────────────────────────────────────────────────────────────

interface Pending {
  serverId: string;
  channelId: string;
  /** The backend's id of the moderator who asked — the only one who can confirm. */
  invokerId: string;
  invokerName: string;
  /** Moderation actions, or a settings plan (never both in one preview). */
  requests: ActionRequest[];
  config: ConfigPlan | null;
  request: string;
  expiresAt: number;
}

/**
 * Previews awaiting ✅ / ❌, keyed by the preview message's id. Each one
 * removes itself after CONFIRM_TTL_MS, so this never holds more than the
 * last two minutes' previews.
 */
const pending = new Map<string, Pending>();

async function postPreview(
  ctx: CommandContext,
  svc: Services,
  request: string,
  proposal: Proposal,
  channelNames: Map<string, string>,
  people: Map<string, string>,
): Promise<void> {
  const lines: string[] = [];
  if (proposal.requests.length > 0) {
    lines.push('**I’ll do this:**');
    for (const r of proposal.requests) lines.push(`• ${await describeRequest(svc, r, channelNames)}`);
  }
  if (proposal.refused.length > 0) {
    lines.push('', '**I can’t:**', ...proposal.refused.map((x) => `• ${x}`));
  }
  if (proposal.requests.length === 0) {
    await send(ctx, svc, lines.join('\n').trim());
    return;
  }
  const invokerName = await resolveUser(svc.api, ctx.serverId, ctx.senderId);
  lines.push('', `React ${CONFIRM} to run it or ${CANCEL} to cancel. Only **${invokerName}** can confirm; this expires in 2 minutes.`);

  let previewId: string;
  try {
    const sent = await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: '',
      embeds: [buildEmbed({ title: 'Confirm moderation', description: lines.join('\n'), color: COLORS.WARNING, timestamp: null })],
    });
    previewId = sent.messageId;
  } catch (err) {
    log.warn({ err, serverId: ctx.serverId }, '!panda preview failed');
    return;
  }
  pending.set(previewId, {
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    invokerId: ctx.senderId,
    invokerName,
    requests: proposal.requests,
    config: null,
    request,
    expiresAt: Date.now() + CONFIRM_TTL_MS,
  });
  setTimeout(() => void expire(svc, previewId), CONFIRM_TTL_MS).unref();
  await svc.api.addReaction(ctx.serverId, previewId, CONFIRM).catch(() => undefined);
  await svc.api.addReaction(ctx.serverId, previewId, CANCEL).catch(() => undefined);
  // Replying to the preview ("make it two days") is a follow-up too.
  await rememberTurn({ ...convoKey(ctx), userName: ctx.senderName }, { request, answer: lines.join('\n'), people }, previewId);
}

/**
 * A settings preview: every change as before → after, creations listed,
 * a bold warning when member text was read on the way here, and who will
 * be told. Nothing is written until the same admin confirms.
 */
async function postConfigPreview(
  ctx: CommandContext,
  svc: Services,
  request: string,
  plan: ConfigPlan,
  people: Map<string, string>,
): Promise<void> {
  const size = plan.creates.length + plan.changes.length;
  if (overHourlyCap(size, await changesInLastHour(ctx.serverId))) {
    await send(ctx, svc, 'That would go over the limit of settings changes through me in an hour. Try again later, or use the dashboard.');
    return;
  }
  const invokerName = await resolveUser(svc.api, ctx.serverId, ctx.senderId);
  const lines = ['**I’ll change this:**', ...describePlan(plan)];
  if (plan.tainted) {
    lines.push('', '⚠️ **I read members’ messages while working on this.** Only confirm if these are exactly the changes you asked for.');
  }
  lines.push(
    '',
    `React ${CONFIRM} to apply or ${CANCEL} to cancel. Only **${invokerName}** can confirm; this expires in 2 minutes.`,
    'Changes are posted to the mod-log and sent to the server owner.',
  );

  let previewId: string;
  try {
    const sent = await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: '',
      embeds: [buildEmbed({ title: 'Confirm settings changes', description: lines.join('\n').slice(0, 4000), color: COLORS.WARNING, timestamp: null })],
    });
    previewId = sent.messageId;
  } catch (err) {
    log.warn({ err, serverId: ctx.serverId }, '!panda settings preview failed');
    return;
  }
  pending.set(previewId, {
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    invokerId: ctx.senderId,
    invokerName,
    requests: [],
    config: plan,
    request,
    expiresAt: Date.now() + CONFIRM_TTL_MS,
  });
  setTimeout(() => void expire(svc, previewId), CONFIRM_TTL_MS).unref();
  await svc.api.addReaction(ctx.serverId, previewId, CONFIRM).catch(() => undefined);
  await svc.api.addReaction(ctx.serverId, previewId, CANCEL).catch(() => undefined);
  await rememberTurn({ ...convoKey(ctx), userName: ctx.senderName }, { request, answer: lines.join('\n'), people }, previewId);
}

/**
 * Apply a confirmed settings plan — only if, at THIS moment, the owner's
 * switch is still on and the admin still has Manage Server.
 */
async function applyConfig(svc: Services, p: Pending, previewId: string): Promise<void> {
  const [settings, verdict] = await Promise.all([
    getAiSettings(p.serverId),
    svc.perms.check(p.serverId, p.invokerId, 'MANAGE_SERVER'),
  ]);
  if (!settings?.allowConfig) {
    await finish(svc, p.serverId, previewId, 'Not applied — changing settings through !panda was switched off.', COLORS.MUTED);
    return;
  }
  if (verdict !== 'granted') {
    await finish(svc, p.serverId, previewId, verdict === 'unavailable'
      ? "Not applied — I couldn't verify your permissions just now. Try again in a moment."
      : 'Not applied — you no longer have Manage Server.', COLORS.MUTED);
    return;
  }
  const plan = p.config!;
  if (planTouchesRoles(plan) && (await svc.perms.check(p.serverId, p.invokerId, 'MANAGE_ROLES')) !== 'granted') {
    await finish(svc, p.serverId, previewId, 'Not applied — creating or handing out roles needs Manage Roles, which you no longer have.', COLORS.MUTED);
    return;
  }
  if (overHourlyCap(plan.creates.length + plan.changes.length, await changesInLastHour(p.serverId))) {
    await finish(svc, p.serverId, previewId, 'Not applied — that would go over the hourly limit for settings changes.', COLORS.MUTED);
    return;
  }
  const actor = { id: p.invokerId, name: p.invokerName };
  const { lines, applied } = await applyPlan(svc, p.serverId, actor, plan, p.request);
  await finish(svc, p.serverId, previewId, lines.join('\n') || 'Nothing changed.', applied.length > 0 ? COLORS.ONLINE : COLORS.MUTED);
  const where = (await svc.api.listChannels(p.serverId).catch(() => [])).find((c) => c.id === p.channelId)?.name ?? 'a channel';
  await announceChanges(svc, p.serverId, actor, where, applied);
}

// ── Confirmation ───────────────────────────────────────────────────────────

/** Reaction hook: ✅ / ❌ on a preview, from the moderator who asked. */
export async function handlePandaReaction(svc: Services, data: ReactionEventData): Promise<void> {
  const p = pending.get(data.messageId);
  if (!p) return;
  // The backend's userId — the only identity that can confirm.
  if (data.userId !== p.invokerId || data.serverId !== p.serverId) return;
  if (data.reactionType !== CONFIRM && data.reactionType !== CANCEL) return;
  // Claim it before acting, so a duplicate event can't run it twice.
  pending.delete(data.messageId);
  if (Date.now() > p.expiresAt) {
    await finish(svc, p.serverId, data.messageId, 'Expired — nothing was done.', COLORS.MUTED);
    return;
  }

  if (data.reactionType === CANCEL) {
    await finish(svc, p.serverId, data.messageId, 'Cancelled — nothing was done.', COLORS.MUTED);
    return;
  }
  if (p.config) return applyConfig(svc, p, data.messageId);
  const actor = { kind: 'moderator' as const, userId: p.invokerId };
  const results: string[] = [];
  for (const r of p.requests) {
    // Re-checked at execution time: permissions can change in two minutes.
    const out = await performAction(svc, actor, r);
    results.push(out.ok ? `✓ ${out.summary}` : `✗ ${out.error}`);
  }
  await finish(svc, p.serverId, data.messageId, results.join('\n'), COLORS.ONLINE);
}

async function expire(svc: Services, previewId: string): Promise<void> {
  const p = pending.get(previewId);
  if (!p) return;
  pending.delete(previewId);
  await finish(svc, p.serverId, previewId, 'Expired — nothing was done.', COLORS.MUTED);
}

async function finish(svc: Services, serverId: string, previewId: string, text: string, color: number): Promise<void> {
  try {
    await svc.api.editMessage({
      serverId,
      messageId: previewId,
      embeds: [buildEmbed({ title: 'Moderation', description: text, color, timestamp: null })],
    });
  } catch (err) {
    log.debug({ err, serverId }, '!panda preview edit failed');
  }
}
