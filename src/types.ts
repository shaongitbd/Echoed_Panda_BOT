// Bare payload Echoed's socket server emits on MESSAGE_CREATE.
// The event name itself is the type discriminator — there's no
// {type, data} envelope.
export interface MessageCreatedData {
  id: string;
  channelId: string;
  serverId: string;
  senderId: string;
  content: string;
  messageType: string;
  createdAt: string;
  author?: { id: string; name: string; avatarUrl?: string | null };
}

// Payload of SERVER_MEMBER_ADD. Echoed only ships IDs + the post-join
// member count; user-facing fields like display name or avatar aren't
// included, so welcome flows have to mention by ID (`<@id>`) or do an
// extra profile lookup if they want a rendered name.
export interface MemberJoinedData {
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
