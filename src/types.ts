// Replayable events carry a monotonically increasing per-session sequence
// number. We track the highest one seen so a reconnect can ask for
// everything after it. Ephemeral events (reactions, typing, presence) are
// not replayable and arrive without it.
export interface Sequenced {
  _seq?: number;
}

// Bare payload Echoed's socket server emits on MESSAGE_CREATE.
// The event name itself is the type discriminator — there's no
// {type, data} envelope.
export interface MessageCreatedData extends Sequenced {
  id: string;
  channelId: string;
  serverId: string;
  senderId: string;
  content: string;
  messageType: string;
  createdAt: string;
  author?: { id: string; name: string; avatarUrl?: string | null; isBot?: boolean };
}

// MESSAGE_UPDATE. `previousContent` is the text before this edit — present
// only when the text changed, and only from backends that send it.
export interface MessageUpdatedData extends Sequenced {
  id: string;
  channelId: string;
  serverId?: string;
  senderId: string;
  content: string;
  previousContent?: string;
  isDirect?: boolean;
  threadPostId?: string;
}

// MESSAGE_DELETE. Carries the deleted text and who deleted it ('automod'
// for the platform's own filter).
export interface MessageDeletedData extends Sequenced {
  id: string;
  channelId: string;
  serverId?: string;
  senderId: string;
  content?: string;
  deletedBy?: string;
  attachmentIds?: unknown[] | null;
  isDirect?: boolean;
  threadPostId?: string;
}

// MESSAGE_DELETE_BULK — ids only.
export interface MessagesBulkDeletedData extends Sequenced {
  channelId: string;
  serverId: string;
  messageIds: string[];
  deletedBy?: string;
}

// SERVER_MEMBER_KICK / SERVER_MEMBER_BAN. `reason` is either the
// moderator's text (bot API) or a fixed sentence written for the removed
// member ("You have been kicked from this server"), which says nothing.
export interface MemberRemovedData extends Sequenced {
  serverId: string;
  userId: string;
  kickedBy?: string;
  bannedBy?: string;
  reason?: string;
}

// server:member_departed — a member left on their own. Sent to bots only.
export interface MemberDepartedData extends Sequenced {
  serverId: string;
  userId: string;
  userName?: string;
}

// SERVER_MEMBER_NICKNAME_UPDATE. An empty nickname means it was cleared.
export interface NicknameUpdatedData extends Sequenced {
  serverId: string;
  userId: string;
  nickname?: string;
  updatedBy?: string;
}

// Payload of SERVER_MEMBER_ADD. Echoed only ships IDs + the post-join
// member count; user-facing fields like display name or avatar aren't
// included, so welcome flows have to mention by ID (`<@id>`) or do an
// extra profile lookup if they want a rendered name.
export interface MemberJoinedData extends Sequenced {
  serverId: string;
  userId: string;
  memberCount?: number;
  updatedAt?: string;
}

// Payload of MESSAGE_REACTION_ADD / MESSAGE_REACTION_REMOVE. `reactionType`
// is the emoji string (Unicode codepoint or `:name:` form for custom emoji).
export interface ReactionEventData {
  messageId: string;
  channelId: string;
  serverId: string;
  userId: string;
  userName?: string;
  reactionType: string;
  isDirect?: boolean;
}

// What command handlers receive after dispatch parses the message.
export interface CommandContext {
  serverId: string;
  channelId: string;
  senderId: string;
  senderName: string;
  messageId: string;
  args: string[];
  rawContent: string;
  // The prefix that triggered this dispatch (per-guild, may differ from
  // config.defaultPrefix). Handy for help text and error messages.
  prefix: string;
}
