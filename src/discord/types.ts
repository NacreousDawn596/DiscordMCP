import type {
  Channel,
  Guild,
  GuildMember,
  Message,
  User,
} from 'discord.js';

/**
 * The immutable execution context for a single invocation. Every tool call is
 * scoped to this context. No cross-guild leakage is possible because all tools
 * resolve their guild from here rather than from LLM-supplied arguments.
 */
export interface ExecutionContext {
  guildId: string;
  guildName: string;
  channelId: string | null;
  channelName: string | null;
  threadId: string | null;
  userId: string;
  userName: string;
  messageId: string | null;
  botId: string;
  botTag: string;

  /** Runtime Discord objects (never serialized into the LLM prompt). */
  guild: Guild;
  channel: Channel | null;
  member: GuildMember | null;
  author: User | null;
  message: Message | null;
}

export interface ToolResult {
  success: boolean;
  output: string;
  data?: unknown;
  /**
   * When set, the tool posted a visible message to this Discord channel id.
   * The runtime uses this to avoid sending a redundant second reply.
   */
  postedChannelId?: string;
}

export const Capabilities = [
  'READ_MESSAGES',
  'SEND_MESSAGES',
  'MANAGE_MESSAGES',
  'MANAGE_CHANNELS',
  'MANAGE_ROLES',
  'MANAGE_PERMISSIONS',
  'MANAGE_MEMBERS',
  'MODERATE',
  'MANAGE_WEBHOOKS',
  'MANAGE_GUILD',
] as const;

export type Capability = (typeof Capabilities)[number];

export interface ExecutionOutcome {
  success: boolean;
  result: string;
  runId: string;
  plan?: unknown;
  toolsUsed: string[];
  actions: Array<{
    tool: string;
    target: string;
    risk: string;
    success: boolean;
    result: string;
  }>;
}
