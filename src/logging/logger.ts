import type { EchoedClient, EmbedField } from '../client/echoedClient.js';
import { buildEmbed, COLORS, truncate } from '../client/embeds.js';
import { rememberUser, renderTokens, resolveChannel, resolveUser } from '../client/names.js';
import { formatDuration } from '../mod/duration.js';
import { log } from '../log.js';
import type {
  MemberDepartedData,
  MemberJoinedData,
  MemberRemovedData,
  MessageDeletedData,
  MessagesBulkDeletedData,
  MessageUpdatedData,
  NicknameUpdatedData,
} from '../types.js';
import { getLogConfig, logChannelFor, type LogConfig, type LogEvent } from './config.js';
import { forgetMessage, recentMessage, updateRecentContent } from './recent.js';

// The server log: one embed per event, posted to the channel the server
// chose for that half (messages / members). Everything here is best-effort —
// a log post that fails is logged and dropped, never retried into a storm.
//
// Embeds, not message content: an embed never resolves or pings a mention,
// so a deleted "@everyone" or a member's name can't notify anyone from here.
// That is also why every name is resolved to text first.

// A field value holds at most ~1000 characters; leave room for the ellipsis.
const FIELD_TEXT = 1_000;
// How many messages a bulk-delete entry reproduces from memory.
const BULK_TRANSCRIPT_LINES = 20;
// Accounts younger than this are called out on join — the usual alt tell.
const NEW_ACCOUNT_SECONDS = 7 * 24 * 60 * 60;

// The kick/ban events carry a sentence written for the removed member when
// no moderator gave a reason. It says nothing a log reader needs.
const BOILERPLATE_REASON = /^you have been (kicked|banned) from this server\.?$/i;

async function post(
  api: EchoedClient,
  serverId: string,
  channelId: string,
  event: LogEvent,
  embed: ReturnType<typeof buildEmbed>,
): Promise<void> {
  try {
    await api.sendMessage(
      { serverId, channelId, content: '', embeds: [embed] },
      { priority: 'background' },
    );
  } catch (err) {
    log.warn({ err, serverId, channelId, event }, 'Server-log post failed');
  }
}

// Message events from the log channel itself are never logged: deleting a
// log entry would otherwise post a log entry about it.
function messageEventWanted(cfg: LogConfig, channelId: string, target: string): boolean {
  return channelId !== target && !cfg.ignoredChannelIds.includes(channelId);
}

// Message text for an embed: mention tokens become names, and empty text
// says so rather than leaving a blank field.
async function renderText(api: EchoedClient, serverId: string, text: string | undefined): Promise<string> {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return '*No text*';
  return truncate(await renderTokens(api, serverId, trimmed), FIELD_TEXT);
}

async function nameOf(api: EchoedClient, serverId: string, userId: string, known?: string | null): Promise<string> {
  if (known) return known;
  return resolveUser(api, serverId, userId);
}

function idFooter(label: string, id: string): string {
  return `${label} ID: ${id}`;
}

// ─── Messages ───────────────────────────────────────────────────────────

export async function logMessageEdit(
  api: EchoedClient,
  botUserId: string,
  data: MessageUpdatedData,
): Promise<void> {
  if (data.isDirect || !data.serverId || !data.id) return;
  const serverId = data.serverId;

  // The backend sends the old text only when the text changed. Without it
  // (an older backend, or an update that only trimmed an attachment), the
  // cached copy decides — and no copy means there is nothing to compare.
  const cached = recentMessage(data.id);
  const before = data.previousContent ?? cached?.content;
  const after = data.content ?? '';
  updateRecentContent(data.id, after);
  if (before === undefined || before === after) return;
  if (data.senderId === botUserId) return;

  const cfg = await getLogConfig(serverId);
  const target = logChannelFor(cfg, 'message_edit');
  if (!target || !messageEventWanted(cfg, data.channelId, target)) return;
  if (cfg.ignoreBots && cached?.isBot) return;

  const [author, channel, beforeText, afterText] = await Promise.all([
    nameOf(api, serverId, data.senderId, cached?.authorName),
    resolveChannel(api, serverId, data.channelId),
    renderText(api, serverId, before),
    renderText(api, serverId, after),
  ]);

  await post(api, serverId, target, 'message_edit', buildEmbed({
    title: `Message edited in ${channel}`,
    color: COLORS.WARNING,
    fields: [
      { name: 'Author', value: author, inline: true },
      { name: 'Before', value: beforeText },
      { name: 'After', value: afterText },
    ],
    footer: `${idFooter('Message', data.id)} · ${idFooter('Author', data.senderId)}`,
  }));
}

export async function logMessageDelete(
  api: EchoedClient,
  botUserId: string,
  data: MessageDeletedData,
): Promise<void> {
  if (data.isDirect || !data.serverId || !data.id) return;
  const serverId = data.serverId;
  const cached = recentMessage(data.id);
  forgetMessage(data.id);

  if (data.senderId === botUserId) return;
  // Deletes the bot made itself — auto-mod hits and !purge — are already in
  // the mod-log, with the reason. Repeating them here only buries the rest.
  if (data.deletedBy === botUserId) return;

  const cfg = await getLogConfig(serverId);
  const target = logChannelFor(cfg, 'message_delete');
  if (!target || !messageEventWanted(cfg, data.channelId, target)) return;
  if (cfg.ignoreBots && cached?.isBot) return;

  const [author, channel, text] = await Promise.all([
    nameOf(api, serverId, data.senderId, cached?.authorName),
    resolveChannel(api, serverId, data.channelId),
    renderText(api, serverId, data.content ?? cached?.content),
  ]);

  const fields: EmbedField[] = [{ name: 'Author', value: author, inline: true }];
  const attachments = Array.isArray(data.attachmentIds) ? data.attachmentIds.length : 0;
  if (attachments > 0) {
    fields.push({ name: 'Attachments', value: String(attachments), inline: true });
  }
  if (data.deletedBy === 'automod') {
    fields.push({ name: 'Deleted by', value: 'Echoed auto-mod', inline: true });
  } else if (data.deletedBy && data.deletedBy !== data.senderId) {
    fields.push({ name: 'Deleted by', value: await nameOf(api, serverId, data.deletedBy), inline: true });
  }

  await post(api, serverId, target, 'message_delete', buildEmbed({
    title: `Message deleted in ${channel}`,
    description: text,
    color: COLORS.DANGER,
    fields,
    footer: `${idFooter('Message', data.id)} · ${idFooter('Author', data.senderId)}`,
  }));
}

export async function logBulkDelete(
  api: EchoedClient,
  botUserId: string,
  data: MessagesBulkDeletedData,
): Promise<void> {
  const ids = Array.isArray(data.messageIds) ? data.messageIds : [];
  if (!data.serverId || !data.channelId || ids.length === 0) return;
  const serverId = data.serverId;

  const known = ids.map((id) => recentMessage(id)).filter((m) => m !== undefined);
  for (const id of ids) forgetMessage(id);

  // A !purge through this bot: the mod-log has it.
  if (data.deletedBy === botUserId) return;

  const cfg = await getLogConfig(serverId);
  const target = logChannelFor(cfg, 'message_bulk_delete');
  if (!target || !messageEventWanted(cfg, data.channelId, target)) return;

  const channel = await resolveChannel(api, serverId, data.channelId);
  const fields: EmbedField[] = [];
  if (data.deletedBy) {
    fields.push({ name: 'Deleted by', value: await nameOf(api, serverId, data.deletedBy), inline: true });
  }

  // What we still remember of them, oldest first. Anything older than the
  // cache (or from before a restart) is only counted.
  const shown = known.slice(0, BULK_TRANSCRIPT_LINES);
  const lines = await Promise.all(
    shown.map(async (m) => {
      const who = await nameOf(api, serverId, m.senderId, m.authorName);
      const text = (await renderTokens(api, serverId, m.content.trim())) || '*No text*';
      return `**${who}:** ${truncate(text.replace(/\s+/g, ' '), 180)}`;
    }),
  );
  const unseen = ids.length - shown.length;
  if (lines.length > 0 && unseen > 0) {
    lines.push(`*…and ${unseen} more not held in memory*`);
  }

  await post(api, serverId, target, 'message_bulk_delete', buildEmbed({
    title: `${ids.length} message${ids.length === 1 ? '' : 's'} deleted in ${channel}`,
    description: lines.length > 0 ? lines.join('\n') : undefined,
    color: COLORS.DANGER,
    fields,
  }));
}

// ─── Members ────────────────────────────────────────────────────────────

export async function logMemberJoin(api: EchoedClient, data: MemberJoinedData): Promise<void> {
  const cfg = await getLogConfig(data.serverId);
  const target = logChannelFor(cfg, 'member_join');
  if (!target) return;

  const fields: EmbedField[] = [];
  let name: string | null = null;
  try {
    const profile = await api.getMemberProfile(data.serverId, data.userId);
    name = profile.displayName || profile.username || null;
    rememberUser(data.serverId, data.userId, name ?? undefined);
    const age = profile.accountAgeSeconds;
    if (typeof age === 'number' && age >= 0) {
      fields.push({
        name: 'Account age',
        value: age < NEW_ACCOUNT_SECONDS ? `${formatDuration(age)} — new account` : formatDuration(age),
        inline: true,
      });
    }
  } catch (err) {
    log.debug({ err, serverId: data.serverId, userId: data.userId }, 'Join-log profile lookup failed');
  }
  if (typeof data.memberCount === 'number') {
    fields.push({ name: 'Members', value: String(data.memberCount), inline: true });
  }

  await post(api, data.serverId, target, 'member_join', buildEmbed({
    title: 'Member joined',
    description: name ?? (await resolveUser(api, data.serverId, data.userId)),
    color: COLORS.ONLINE,
    fields,
    footer: idFooter('User', data.userId),
  }));
}

export async function logMemberLeave(api: EchoedClient, data: MemberDepartedData): Promise<void> {
  if (!data.serverId || !data.userId) return;
  const cfg = await getLogConfig(data.serverId);
  const target = logChannelFor(cfg, 'member_leave');
  if (!target) return;

  await post(api, data.serverId, target, 'member_leave', buildEmbed({
    title: 'Member left',
    description: await nameOf(api, data.serverId, data.userId, data.userName),
    color: COLORS.MUTED,
    footer: idFooter('User', data.userId),
  }));
}

export async function logMemberRemoved(
  api: EchoedClient,
  kind: 'kick' | 'ban',
  data: MemberRemovedData,
): Promise<void> {
  if (!data.serverId || !data.userId) return;
  const event: LogEvent = kind === 'kick' ? 'member_kick' : 'member_ban';
  const cfg = await getLogConfig(data.serverId);
  const target = logChannelFor(cfg, event);
  if (!target) return;

  const actorId = kind === 'kick' ? data.kickedBy : data.bannedBy;
  const fields: EmbedField[] = [];
  if (actorId) {
    fields.push({ name: 'By', value: await nameOf(api, data.serverId, actorId), inline: true });
  }
  const reason = data.reason?.trim();
  if (reason && !BOILERPLATE_REASON.test(reason)) {
    fields.push({ name: 'Reason', value: truncate(reason, FIELD_TEXT) });
  }

  await post(api, data.serverId, target, event, buildEmbed({
    title: kind === 'kick' ? 'Member kicked' : 'Member banned',
    description: await nameOf(api, data.serverId, data.userId),
    color: COLORS.DANGER,
    fields,
    footer: idFooter('User', data.userId),
  }));
}

export async function logNicknameChange(api: EchoedClient, data: NicknameUpdatedData): Promise<void> {
  if (!data.serverId || !data.userId) return;
  const cfg = await getLogConfig(data.serverId);
  const target = logChannelFor(cfg, 'member_nickname');
  if (!target) return;

  const nickname = data.nickname?.trim() ?? '';
  const fields: EmbedField[] = [
    { name: 'Nickname', value: nickname ? truncate(nickname, FIELD_TEXT) : '*Cleared*', inline: true },
  ];
  if (data.updatedBy && data.updatedBy !== data.userId) {
    fields.push({ name: 'Changed by', value: await nameOf(api, data.serverId, data.updatedBy), inline: true });
  }

  await post(api, data.serverId, target, 'member_nickname', buildEmbed({
    title: 'Nickname changed',
    description: await nameOf(api, data.serverId, data.userId),
    color: COLORS.ACCENT,
    fields,
    footer: idFooter('User', data.userId),
  }));
}
