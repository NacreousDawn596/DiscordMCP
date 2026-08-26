import type { ToolDescriptor } from '../types.js';
import { registerTool } from '../registry.js';
import { ok, fail, findChannel, truncate } from './helpers.js';

export function registerMessageTools(): void {
  registerTool({
    name: 'discord.message.send',
    description: 'Send a message to a channel (defaults to the current channel).',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Target channel name/id (defaults to current).' },
        content: { type: 'string', description: 'Message content (Markdown supported).' },
      },
      required: ['content'],
    },
    risk: 'LOW',
    capability: 'SEND_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const channel = args.channel
        ? findChannel(ctx.guild, args.channel as string)
        : ctx.channel ?? (ctx.guild as never);
      if (!channel || !('send' in channel)) return fail('Cannot send to this channel.');
      const msg = await (channel as unknown as { send(c: string): Promise<{ id: string }> }).send(
        truncate(String(args.content)),
      );
      return ok(`Sent message (${msg.id}).`, { messageId: msg.id });
    },
  });

  registerTool({
    name: 'discord.message.reply',
    description: 'Reply to the current message in the same channel/thread.',
    inputSchema: {
      type: 'object',
      properties: { content: { type: 'string' } },
      required: ['content'],
    },
    risk: 'LOW',
    capability: 'SEND_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      if (!ctx.message) return fail('No message to reply to in this context.');
      const msg = await ctx.message.reply(truncate(String(args.content)));
      return ok(`Replied (${msg.id}).`, { messageId: msg.id });
    },
  });

  registerTool({
    name: 'discord.message.edit',
    description: 'Edit a message previously sent by the bot.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name/id.' },
        message_id: { type: 'string', description: 'Message id.' },
        content: { type: 'string' },
      },
      required: ['channel', 'message_id', 'content'],
    },
    risk: 'LOW',
    capability: 'SEND_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.channel as string);
      if (!channel || !('messages' in channel)) return fail('Channel not found or not text-based.');
      const msg = await (channel as unknown as {
        messages: { fetch: (id: string) => Promise<{ edit(c: string): Promise<unknown> }> };
      }).messages.fetch(String(args.message_id));
      await msg.edit(truncate(String(args.content)));
      return ok('Message edited.');
    },
  });

  registerTool({
    name: 'discord.message.delete',
    description: 'Delete a message by id.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string' },
        message_id: { type: 'string' },
      },
      required: ['channel', 'message_id'],
    },
    risk: 'HIGH',
    capability: 'MANAGE_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.channel as string);
      if (!channel || !('messages' in channel)) return fail('Channel not found or not text-based.');
      const msg = await (channel as unknown as {
        messages: { fetch: (id: string) => Promise<{ delete(): Promise<unknown> }> };
      }).messages.fetch(String(args.message_id));
      await msg.delete();
      return ok('Message deleted.');
    },
  });

  registerTool({
    name: 'discord.message.fetch',
    description: 'Fetch a specific message by id.',
    inputSchema: {
      type: 'object',
      properties: { channel: { type: 'string' }, message_id: { type: 'string' } },
      required: ['channel', 'message_id'],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.channel as string);
      if (!channel || !('messages' in channel)) return fail('Channel not found or not text-based.');
      const msg = await (channel as unknown as {
        messages: { fetch: (id: string) => Promise<{ author: { tag: string }; content: string; createdAt: Date }> };
      }).messages.fetch(String(args.message_id));
      return ok(`[${msg.createdAt.toISOString()}] ${msg.author.tag}: ${msg.content}`);
    },
  });

  registerTool({
    name: 'discord.message.history',
    description: 'Read recent messages from a channel.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name/id (defaults to current).' },
        limit: { type: 'integer', description: 'Number of messages (default 25, max 100).' },
      },
      required: [],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const channel = args.channel
        ? findChannel(ctx.guild, args.channel as string)
        : ctx.channel;
      if (!channel || !('messages' in channel)) return fail('Channel not found or not text-based.');
      const limit = Math.min(Number(args.limit) || 25, 100);
      const msgs = await (channel as unknown as {
        messages: { fetch: (opts: { limit: number }) => Promise<Map<string, { author: { tag: string }; content: string; createdAt: Date }>> };
      }).messages.fetch({ limit });
      const lines = [...msgs.values()]
        .reverse()
        .map((m) => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}`);
      return ok(lines.length ? truncate(lines.join('\n'), 3500) : 'No messages.');
    },
  });

  registerTool({
    name: 'discord.message.pin',
    description: 'Pin a message in a channel.',
    inputSchema: {
      type: 'object',
      properties: { channel: { type: 'string' }, message_id: { type: 'string' } },
      required: ['channel', 'message_id'],
    },
    risk: 'LOW',
    capability: 'MANAGE_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.channel as string);
      if (!channel || !('messages' in channel)) return fail('Channel not found.');
      const msg = await (channel as unknown as {
        messages: { fetch: (id: string) => Promise<{ pin(): Promise<unknown> }> };
      }).messages.fetch(String(args.message_id));
      await msg.pin();
      return ok('Message pinned.');
    },
  });

  registerTool({
    name: 'discord.message.unpin',
    description: 'Unpin a message in a channel.',
    inputSchema: {
      type: 'object',
      properties: { channel: { type: 'string' }, message_id: { type: 'string' } },
      required: ['channel', 'message_id'],
    },
    risk: 'LOW',
    capability: 'MANAGE_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.channel as string);
      if (!channel || !('messages' in channel)) return fail('Channel not found.');
      const msg = await (channel as unknown as {
        messages: { fetch: (id: string) => Promise<{ unpin(): Promise<unknown> }> };
      }).messages.fetch(String(args.message_id));
      await msg.unpin();
      return ok('Message unpinned.');
    },
  });

  registerTool({
    name: 'discord.message.react',
    description: 'Add a reaction emoji to a message.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string' },
        message_id: { type: 'string' },
        emoji: { type: 'string', description: 'Emoji, e.g. "🐛" or ":bug:"' },
      },
      required: ['channel', 'message_id', 'emoji'],
    },
    risk: 'LOW',
    capability: 'SEND_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.channel as string);
      if (!channel || !('messages' in channel)) return fail('Channel not found.');
      const msg = await (channel as unknown as {
        messages: { fetch: (id: string) => Promise<{ react(e: string): Promise<unknown> }> };
      }).messages.fetch(String(args.message_id));
      await msg.react(String(args.emoji));
      return ok('Reacted.');
    },
  });

  registerTool({
    name: 'discord.message.remove_reaction',
    description: 'Remove the bot\'s reaction from a message.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string' },
        message_id: { type: 'string' },
        emoji: { type: 'string' },
      },
      required: ['channel', 'message_id', 'emoji'],
    },
    risk: 'LOW',
    capability: 'SEND_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.channel as string);
      if (!channel || !('messages' in channel)) return fail('Channel not found.');
      interface ReactionLike {
        emoji: { name: string | null; id: string | null };
        me: boolean;
        users: { remove: (id: string) => Promise<unknown> };
      }
      const msg = await (channel as unknown as {
        messages: {
          fetch: (id: string) => Promise<{ reactions: { cache: Map<string, ReactionLike> } }>;
        };
      }).messages.fetch(String(args.message_id));
      const emoji = String(args.emoji).replace(/^:|:$/g, '');
      const reaction = [...msg.reactions.cache.values()].find(
        (r) => r.emoji.name === emoji || r.emoji.id === emoji,
      );
      if (!reaction || !reaction.me) return fail('Bot has no such reaction to remove.');
      await reaction.users.remove(ctx.botId);
      return ok('Reaction removed.');
    },
  });
}
