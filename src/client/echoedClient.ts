import { Blob } from 'node:buffer';
import { config } from '../config.js';
import { log } from '../log.js';

// Echoed wraps every bot-auth failure in { message, code, type }; non-auth
// errors are usually { message, code } with an occasional { error } for 5xx.
// We normalize to { status, code, message } so callers don't have to care.
export class EchoedApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'EchoedApiError';
  }
}

// Echoed's rich-embed shape. Mirrors the backend's `RichEmbed`
// struct field-for-field — anything we omit here means a client
// renders the field empty. Use `buildEmbed()` below for sane defaults.
export interface EmbedMedia {
  url: string;
  proxy_url?: string;
  width?: number;
  height?: number;
}

export interface EmbedAuthor {
  name?: string;
  url?: string;
  icon_url?: string;
}

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface EmbedFooter {
  text: string;
  icon_url?: string;
}

export interface Embed {
  type?: 'rich' | 'image' | 'video' | 'gifv' | 'article' | 'link' | 'audio';
  url?: string;
  title?: string;
  description?: string;
  // Decimal RGB int. Build with `(r << 16) | (g << 8) | b`.
  color?: number;
  // RFC3339 string.
  timestamp?: string;
  thumbnail?: EmbedMedia;
  image?: EmbedMedia;
  author?: EmbedAuthor;
  fields?: EmbedField[];
  footer?: EmbedFooter;
}

interface SendMessageInput {
  serverId: string;
  channelId: string;
  content: string;
  replyToId?: string;
  attachmentIds?: string[];
  embeds?: Embed[];
}

interface SendMessageResponse {
  message: string;
  messageId: string;
  channelId: string;
  content: string;
}

interface BotProfileResponse {
  id: string;
  name: string;
  username: string;
  isBot: true;
}

interface MemberPermissionsResponse {
  userId: string;
  serverId: string;
  permissions: string[];
}

interface DeleteResponse {
  success?: boolean;
  message?: string;
}

interface BulkDeleteResponse {
  success: boolean;
  deleted: string[];
  count: number;
}

interface TimeoutResponse {
  success: boolean;
  userId: string;
  timeoutUntil: string;
  durationSeconds: number;
  reason?: string;
}

// Bare-minimum profile data used by heuristic anti-raid checks. Only
// what the bot needs — explicitly excludes email and any PII the bot
// shouldn't see.
export interface MemberProfileResponse {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  hasAvatar: boolean;
  accountAgeSeconds: number;
  createdAt?: string;
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  serverId: string;
  content: string;
  timestamp?: string;
  createdAt?: string;
  author?: { id: string; name: string; isBot?: boolean };
  // emoji → array of userIds who reacted with it.
  reactions?: Record<string, string[]>;
}

interface GetMessagesResponse {
  messages: ChannelMessage[];
  total: number;
  limit: number;
  channelId: string;
  hasMore: boolean;
}

export interface ServerInfo {
  id: string;
  name: string;
  description?: string;
  ownerId?: string;
  memberCount?: number;
  channelCount?: number;
  iconUrl?: string;
  createdAt?: string;
}

export interface ChannelInfo {
  id: string;
  serverId: string;
  name: string;
  type: string;
  description?: string;
  categoryId?: string;
  position?: number;
  isPrivate?: boolean;
  isNsfw?: boolean;
  slowModeSeconds?: number;
}

interface ChannelEditResponse {
  success: boolean;
  channel: ChannelInfo;
  message?: string;
}

export class EchoedClient {
  constructor(
    private readonly token: string,
    private readonly baseUrl: string = config.apiUrl,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: {
        'X-Bot-Token': this.token,
        'Content-Type': 'application/json',
        'User-Agent': 'panda-bot/0.1',
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);

    const res = await fetch(url, init);
    let parsed: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
      const message =
        (typeof obj.message === 'string' && obj.message) ||
        (typeof obj.error === 'string' && obj.error) ||
        `HTTP ${res.status}`;
      const code = typeof obj.code === 'number' ? obj.code : undefined;
      log.warn({ method, path, status: res.status, message, body: obj }, 'Echoed API error');
      throw new EchoedApiError(res.status, code, message);
    }
    return parsed as T;
  }

  // Multipart upload — kept separate from `request()` so `Content-Type`
  // can be set by the runtime (with the boundary). The form field is
  // always named `file` to match the backend's getFileFromRequest().
  private async upload<T>(
    path: string,
    file: { data: Buffer | Uint8Array; filename: string; contentType?: string },
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const form = new FormData();
    const blob = new Blob([file.data], {
      type: file.contentType ?? 'application/octet-stream',
    });
    // FormData.append's Blob overload comes from undici's web types; node's
    // node:buffer.Blob is structurally compatible at runtime.
    form.append('file', blob as unknown as Blob, file.filename);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Bot-Token': this.token,
        'User-Agent': 'panda-bot/0.1',
      },
      body: form,
    });
    let parsed: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!res.ok) {
      const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
      const message =
        (typeof obj.message === 'string' && obj.message) ||
        (typeof obj.error === 'string' && obj.error) ||
        `HTTP ${res.status}`;
      const code = typeof obj.code === 'number' ? obj.code : undefined;
      log.warn({ path, status: res.status, message }, 'Echoed upload error');
      throw new EchoedApiError(res.status, code, message);
    }
    return parsed as T;
  }

  // ─── Identity ────────────────────────────────────────────────────────
  async getProfile(): Promise<BotProfileResponse> {
    return this.request('GET', '/v1/bots/profile');
  }

  // Update the bot's global display name and/or avatar URL. At least one
  // field must be supplied; pass an empty string for `avatar` to clear.
  async updateProfile(input: {
    name?: string;
    avatar?: string;
  }): Promise<{ success: true; name?: string; avatar?: string }> {
    return this.request('PATCH', '/v1/bots/me', input);
  }

  // Set the bot's per-server nickname. Pass an empty string (or use
  // clearServerNickname) to revert to the global name.
  async setServerNickname(
    serverId: string,
    nickname: string,
  ): Promise<{ success: true; nickname: string }> {
    return this.request('PATCH', `/v1/bots/${serverId}/nickname`, { nickname });
  }

  async clearServerNickname(serverId: string): Promise<{ success: true }> {
    return this.request('DELETE', `/v1/bots/${serverId}/nickname`);
  }

  // Set the bot's per-server avatar by uploading an image. Allowed
  // formats: png, jpg, jpeg, gif, webp. The returned `url` is the full
  // CDN URL the avatar resolves to.
  async setServerAvatar(
    serverId: string,
    file: { data: Buffer | Uint8Array; filename: string; contentType?: string },
  ): Promise<{ success: true; path: string; url: string; timestamp: number }> {
    return this.upload(`/v1/bots/${serverId}/server-avatar`, file);
  }

  async clearServerAvatar(serverId: string): Promise<{ success: true }> {
    return this.request('DELETE', `/v1/bots/${serverId}/server-avatar`);
  }

  // ─── Member customization (admin-style) ──────────────────────────────
  // Bot needs MANAGE_SERVER to call these; the command-issuing user's
  // authority is the bot's responsibility to verify before invoking.

  async setMemberNickname(
    serverId: string,
    userId: string,
    nickname: string,
  ): Promise<{ success: true; userId: string; nickname: string }> {
    return this.request('PATCH', `/v1/bots/${serverId}/members/${userId}/nickname`, {
      nickname,
    });
  }

  async clearMemberNickname(
    serverId: string,
    userId: string,
  ): Promise<{ success: true; userId: string }> {
    return this.request('DELETE', `/v1/bots/${serverId}/members/${userId}/nickname`);
  }

  async setMemberServerAvatar(
    serverId: string,
    userId: string,
    file: { data: Buffer | Uint8Array; filename: string; contentType?: string },
  ): Promise<{ success: true; userId: string; path: string; url: string; timestamp: number }> {
    return this.upload(`/v1/bots/${serverId}/members/${userId}/server-avatar`, file);
  }

  async clearMemberServerAvatar(
    serverId: string,
    userId: string,
  ): Promise<{ success: true; userId: string }> {
    return this.request('DELETE', `/v1/bots/${serverId}/members/${userId}/server-avatar`);
  }

  // ─── Voice ───────────────────────────────────────────────────────────
  // Mint a LiveKit AccessToken for the bot to join a voice channel and
  // publish audio. Returns the SFU URL + token + room name.
  async joinVoiceChannel(
    serverId: string,
    channelId: string,
  ): Promise<{
    success: true;
    url: string;
    token: string;
    room: string;
    callId: string;
    identity: string;
    expiresIn: number;
  }> {
    return this.request('POST', `/v1/bots/${serverId}/voice/${channelId}/join`);
  }

  async leaveVoiceChannel(
    serverId: string,
    channelId: string,
  ): Promise<{ success: true; callId: string }> {
    return this.request('POST', `/v1/bots/${serverId}/voice/${channelId}/leave`);
  }

  // Look up which voice channel a member is currently in, scoped to a
  // server. Returns null when they aren't in any voice — used by !play
  // to auto-follow the requester.
  async getMemberVoiceChannel(
    serverId: string,
    userId: string,
  ): Promise<string | null> {
    const res = await this.request<{ channelId: string | null }>(
      'GET',
      `/v1/bots/${serverId}/members/${userId}/voice-channel`,
    );
    return res.channelId;
  }

  // ─── Messaging ───────────────────────────────────────────────────────
  async sendMessage(input: SendMessageInput): Promise<SendMessageResponse> {
    const { serverId, channelId, content, replyToId, attachmentIds, embeds } = input;
    return this.request('POST', `/v1/bots/${serverId}/messages/send`, {
      channelId,
      content,
      ...(replyToId ? { replyToId } : {}),
      ...(attachmentIds ? { attachmentIds } : {}),
      ...(embeds && embeds.length > 0 ? { embeds } : {}),
    });
  }

  async getMessage(serverId: string, messageId: string): Promise<ChannelMessage> {
    return this.request('GET', `/v1/bots/${serverId}/messages/${messageId}`);
  }

  // Edit a message authored by the bot (or by anyone if the bot has
  // MANAGE_MESSAGES). Either content or embeds (or both) must be set.
  async editMessage(input: {
    serverId: string;
    messageId: string;
    content?: string;
    embeds?: Embed[];
  }): Promise<{ messageId: string; content?: string; embeds?: Embed[] }> {
    const { serverId, messageId, content, embeds } = input;
    const body: Record<string, unknown> = {};
    if (content !== undefined) body.content = content;
    if (embeds !== undefined) body.embeds = embeds;
    return this.request('PUT', `/v1/bots/${serverId}/messages/${messageId}`, body);
  }

  async deleteMessage(serverId: string, messageId: string): Promise<DeleteResponse> {
    return this.request('DELETE', `/v1/bots/${serverId}/messages/${messageId}`);
  }

  async getChannelMessages(
    serverId: string,
    channelId: string,
    limit = 50,
  ): Promise<ChannelMessage[]> {
    const cap = Math.min(Math.max(1, limit), 100);
    const res = await this.request<GetMessagesResponse>(
      'GET',
      `/v1/bots/${serverId}/messages?channel_id=${encodeURIComponent(channelId)}&limit=${cap}`,
    );
    return res.messages ?? [];
  }

  async bulkDeleteMessages(
    serverId: string,
    channelId: string,
    messageIds: string[],
  ): Promise<BulkDeleteResponse> {
    return this.request(
      'POST',
      `/v1/bots/${serverId}/channels/${channelId}/messages/bulk-delete`,
      { messageIds },
    );
  }

  // ─── Reactions ───────────────────────────────────────────────────────
  async addReaction(serverId: string, messageId: string, emoji: string): Promise<DeleteResponse> {
    return this.request(
      'PUT',
      `/v1/bots/${serverId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
    );
  }

  async removeReaction(
    serverId: string,
    messageId: string,
    emoji: string,
  ): Promise<DeleteResponse> {
    return this.request(
      'DELETE',
      `/v1/bots/${serverId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
    );
  }

  // ─── Members ─────────────────────────────────────────────────────────
  // When `channelId` is supplied, the returned permissions reflect channel
  // overrides; otherwise the response is server-level.
  async getMemberPermissions(
    serverId: string,
    userId: string,
    channelId?: string,
  ): Promise<MemberPermissionsResponse> {
    const path = channelId
      ? `/v1/bots/${serverId}/members/${userId}/permissions?channel_id=${encodeURIComponent(channelId)}`
      : `/v1/bots/${serverId}/members/${userId}/permissions`;
    return this.request('GET', path);
  }

  async kickMember(serverId: string, userId: string, reason?: string): Promise<DeleteResponse> {
    return this.request('POST', `/v1/bots/${serverId}/members/${userId}/kick`, {
      reason: reason ?? '',
    });
  }

  async banMember(serverId: string, userId: string, reason?: string): Promise<DeleteResponse> {
    return this.request('POST', `/v1/bots/${serverId}/members/${userId}/ban`, {
      reason: reason ?? '',
    });
  }

  async unbanMember(serverId: string, userId: string): Promise<DeleteResponse> {
    return this.request('POST', `/v1/bots/${serverId}/members/${userId}/unban`);
  }

  async timeoutMember(
    serverId: string,
    userId: string,
    durationSeconds: number,
    reason?: string,
  ): Promise<TimeoutResponse> {
    return this.request('POST', `/v1/bots/${serverId}/members/${userId}/timeout`, {
      durationSeconds,
      reason: reason ?? '',
    });
  }

  async clearTimeout(serverId: string, userId: string): Promise<DeleteResponse> {
    return this.request('DELETE', `/v1/bots/${serverId}/members/${userId}/timeout`);
  }

  // ─── Trust & Safety ────────────────────────────────────────────────
  //
  // These hit the platform-level safety knobs introduced for the
  // anti-raid system: server lockdown (rejects all joins at the API
  // edge), verification-level bump (raises the entry bar without a
  // full halt), and a member-profile fetch (used for heuristic checks
  // on join — account age, avatar presence). The detector calls these
  // when its rolling join window trips.

  async setLockdown(
    serverId: string,
    untilSeconds: number,
    reason: string,
  ): Promise<{ until: string; reason: string }> {
    return this.request('POST', `/v1/bots/${serverId}/lockdown`, {
      untilSeconds,
      reason,
    });
  }

  async clearLockdown(serverId: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/v1/bots/${serverId}/lockdown`);
  }

  // Returns { level, previous } so the caller can snapshot the prior
  // value and restore it when the lockdown ends.
  async setVerificationLevel(
    serverId: string,
    level: 0 | 1 | 2 | 3,
  ): Promise<{ level: number; previous: number }> {
    return this.request('PATCH', `/v1/bots/${serverId}/verification-level`, { level });
  }

  async getMemberProfile(
    serverId: string,
    userId: string,
  ): Promise<MemberProfileResponse> {
    return this.request('GET', `/v1/bots/${serverId}/members/${userId}/profile`);
  }

  // ─── Roles ───────────────────────────────────────────────────────────
  async addRole(serverId: string, userId: string, roleId: string): Promise<DeleteResponse> {
    return this.request('POST', `/v1/bots/${serverId}/members/${userId}/roles/${roleId}`);
  }

  async removeRole(serverId: string, userId: string, roleId: string): Promise<DeleteResponse> {
    return this.request('DELETE', `/v1/bots/${serverId}/members/${userId}/roles/${roleId}`);
  }

  // Returns the role IDs assigned to a member. Used by the DJ-role check
  // and any future role-gated commands.
  async getMemberRoles(
    serverId: string,
    userId: string,
  ): Promise<{ userId: string; serverId: string; roles: string[] }> {
    return this.request('GET', `/v1/bots/${serverId}/members/${userId}/roles`);
  }

  // ─── Server / Channels ───────────────────────────────────────────────
  async getServerInfo(serverId: string): Promise<ServerInfo> {
    return this.request('GET', `/v1/bots/${serverId}/info`);
  }

  async createChannel(input: {
    serverId: string;
    name: string;
    type: 'text' | 'video' | 'tasks' | 'calendar';
    description?: string;
    isPrivate?: boolean;
    isNsfw?: boolean;
    categoryId?: string;
    position?: number;
  }): Promise<{ success: boolean; channel: ChannelInfo }> {
    const { serverId, ...body } = input;
    return this.request('POST', `/v1/bots/${serverId}/channels`, body);
  }

  async editChannel(
    serverId: string,
    channelId: string,
    fields: {
      name?: string;
      description?: string;
      isPrivate?: boolean;
      isNsfw?: boolean;
      slowModeSeconds?: number;
      categoryId?: string;
      position?: number;
    },
  ): Promise<ChannelEditResponse> {
    return this.request('PUT', `/v1/bots/${serverId}/channels/${channelId}`, fields);
  }

  async deleteChannel(serverId: string, channelId: string): Promise<DeleteResponse> {
    return this.request('DELETE', `/v1/bots/${serverId}/channels/${channelId}`);
  }
}
