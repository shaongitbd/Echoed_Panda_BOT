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

interface SendMessageInput {
  serverId: string;
  channelId: string;
  content: string;
  replyToId?: string;
  attachmentIds?: string[];
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

  // ─── Identity ────────────────────────────────────────────────────────
  async getProfile(): Promise<BotProfileResponse> {
    return this.request('GET', '/v1/bots/profile');
  }

  // ─── Messaging ───────────────────────────────────────────────────────
  async sendMessage(input: SendMessageInput): Promise<SendMessageResponse> {
    const { serverId, channelId, content, replyToId, attachmentIds } = input;
    return this.request('POST', `/v1/bots/${serverId}/messages/send`, {
      channelId,
      content,
      ...(replyToId ? { replyToId } : {}),
      ...(attachmentIds ? { attachmentIds } : {}),
    });
  }

  async getMessage(serverId: string, messageId: string): Promise<ChannelMessage> {
    return this.request('GET', `/v1/bots/${serverId}/messages/${messageId}`);
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
  async getMemberPermissions(
    serverId: string,
    userId: string,
  ): Promise<MemberPermissionsResponse> {
    return this.request('GET', `/v1/bots/${serverId}/members/${userId}/permissions`);
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

  // ─── Roles ───────────────────────────────────────────────────────────
  async addRole(serverId: string, userId: string, roleId: string): Promise<DeleteResponse> {
    return this.request('POST', `/v1/bots/${serverId}/members/${userId}/roles/${roleId}`);
  }

  async removeRole(serverId: string, userId: string, roleId: string): Promise<DeleteResponse> {
    return this.request('DELETE', `/v1/bots/${serverId}/members/${userId}/roles/${roleId}`);
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
