import type { Channel, Client, Guild, GuildMember, Message, Interaction } from 'discord.js';
import type { ExecutionContext } from '../../discord/types.js';

export interface ContextSources {
  guild: ExecutionContext['guild'];
  channel: ExecutionContext['channel'];
  member: ExecutionContext['member'];
  author: ExecutionContext['author'];
  message: ExecutionContext['message'];
  channelId: string | null;
  channelName: string | null;
  threadId: string | null;
  userId: string;
  userName: string;
  messageId: string | null;
  botId: string;
  botTag: string;
}

export function buildExecutionContext(sources: ContextSources): ExecutionContext {
  const guild = sources.guild;
  return {
    guildId: guild.id,
    guildName: guild.name,
    channelId: sources.channelId,
    channelName: sources.channelName,
    threadId: sources.threadId,
    userId: sources.userId,
    userName: sources.userName,
    messageId: sources.messageId,
    botId: sources.botId,
    botTag: sources.botTag,
    guild,
    channel: sources.channel,
    member: sources.member,
    author: sources.author,
    message: sources.message,
  };
}

export function contextFromMessage(message: Message, botId: string, botTag: string): ExecutionContext {
  const guild = message.guild!;
  const channel = message.channel;
  return buildExecutionContext({
    guild,
    channel,
    member: message.member ?? null,
    author: message.author,
    message,
    channelId: message.channelId,
    channelName: 'name' in channel ? channel.name : null,
    threadId: message.channel.isThread() ? message.channel.id : null,
    userId: message.author.id,
    userName: message.author.tag,
    messageId: message.id,
    botId,
    botTag,
  });
}

export function contextFromInteraction(
  interaction: Interaction,
  botId: string,
  botTag: string,
): ExecutionContext {
  const guild = interaction.guild!;
  const channel = interaction.channel;
  const member = interaction.member;
  const user = interaction.user;

  const memberUserId = 'id' in user ? user.id : botId;
  const memberUserName = 'tag' in user ? user.tag : botTag;

  return buildExecutionContext({
    guild,
    channel,
    member: member && 'permissions' in member ? (member as GuildMember) : null,
    author: user,
    message: null,
    channelId: channel?.id ?? null,
    channelName: channel && 'name' in channel ? channel.name : null,
    threadId: channel && channel.isThread() ? channel.id : null,
    userId: memberUserId,
    userName: memberUserName,
    messageId: null,
    botId,
    botTag,
  });
}

/** Extracts the user-facing request text, stripping bot mentions. */
export function extractRequest(content: string, botId: string): string {
  return content
    .replace(new RegExp(`<@!?${botId}>`, 'g'), '')
    .trim();
}

/**
 * Builds a synthetic context with the bot itself as the actor. Used for
 * automations and scheduled tasks where there is no user message. The bot
 * member is the authorizing actor, so automations can only do what the bot is
 * permitted to do.
 */
export function syntheticExecutionContext(
  client: Client,
  guild: Guild,
  channel: Channel | null,
): ExecutionContext {
  const bot = client.user!;
  const botMember = guild.members.me ?? null;

  return buildExecutionContext({
    guild,
    channel,
    member: botMember,
    author: bot,
    message: null,
    channelId: channel?.id ?? null,
    channelName: channel && 'name' in channel ? channel.name : null,
    threadId: channel && channel.isThread() ? channel.id : null,
    userId: bot.id,
    userName: bot.tag,
    messageId: null,
    botId: bot.id,
    botTag: bot.tag,
  });
}
