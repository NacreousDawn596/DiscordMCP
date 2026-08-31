import type { ToolDescriptor } from '../types.js';
import { registerTool } from '../registry.js';
import { ok, okPosted, fail, findChannel, truncate } from './helpers.js';
import { buildEmbed, type EmbedInput } from '../../discord/embeds.js';

const EMBED_SCHEMA_PROPERTIES = {
  title: { type: 'string', description: 'Title of the embed.' },
  description: { type: 'string', description: 'Main text description of the embed.' },
  url: { type: 'string', description: 'URL for the embed title link.' },
  color: {
    type: 'string',
    description: 'Color hex (e.g. #FF0000), integer (0xFF0000), or name (e.g. Red, Blue, Gold).',
  },
  timestamp: { type: 'boolean', description: 'Whether to include current timestamp.' },
  footer: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      icon_url: { type: 'string' },
    },
    required: ['text'],
    description: 'Footer text and optional icon URL.',
  },
  image: { type: 'string', description: 'Image URL.' },
  thumbnail: { type: 'string', description: 'Thumbnail image URL.' },
  author: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      url: { type: 'string' },
      icon_url: { type: 'string' },
    },
    required: ['name'],
    description: 'Author name, link URL, and icon URL.',
  },
  fields: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        value: { type: 'string' },
        inline: { type: 'boolean' },
      },
      required: ['name', 'value'],
    },
    description: 'List of field objects.',
  },
};

function prepareMessageOptions(
  content?: unknown,
  embedInput?: unknown,
  embedsInput?: unknown,
): { content?: string; embeds?: ReturnType<typeof buildEmbed>[] } {
  const options: { content?: string; embeds?: ReturnType<typeof buildEmbed>[] } = {};

  if (content !== undefined && content !== null && String(content).trim()) {
    options.content = truncate(String(content));
  }

  const embedsList: ReturnType<typeof buildEmbed>[] = [];

  if (embedInput && typeof embedInput === 'object') {
    embedsList.push(buildEmbed(embedInput as EmbedInput));
  }

  if (Array.isArray(embedsInput)) {
    for (const e of embedsInput) {
      if (e && typeof e === 'object') {
        embedsList.push(buildEmbed(e as EmbedInput));
      }
    }
  }

  if (embedsList.length > 0) {
    options.embeds = embedsList;
  }

  return options;
}

export function registerMessageTools(): void {
  registerTool({
    name: 'discord.embed.send',
    description:
      'Send a rich Discord Embed to a channel (with title, description, color, fields, footer, image, thumbnail, author, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Target channel name/id (defaults to current channel).' },
        content: { type: 'string', description: 'Optional text message content outside the embed.' },
        embed: {
          type: 'object',
          properties: EMBED_SCHEMA_PROPERTIES,
          description: 'Embed parameters (title, description, color, fields, etc.).',
        },
      },
      required: ['embed'],
    },
    risk: 'LOW',
    capability: 'SEND_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const channel = args.channel
        ? findChannel(ctx.guild, args.channel as string)
        : ctx.channel ?? (ctx.guild as never);
      if (!channel || !('send' in channel)) return fail('Cannot send to this channel.');

      const opts = prepareMessageOptions(args.content, args.embed);
      if (!opts.content && (!opts.embeds || opts.embeds.length === 0)) {
        return fail('Must provide embed properties or message content.');
      }

      const textChannel = channel as unknown as {
        send(o: typeof opts): Promise<{ id: string }>;
      };
      const msg = await textChannel.send(opts);
      return okPosted(`Sent embed message (${msg.id}).`, channel.id, { messageId: msg.id });
    },
  });

  registerTool({
    name: 'discord.message.send',
    description: 'Send a message or embed to a channel (defaults to the current channel).',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Target channel name/id (defaults to current).' },
        content: { type: 'string', description: 'Message content (Markdown supported).' },
        embed: {
          type: 'object',
          properties: EMBED_SCHEMA_PROPERTIES,
          description: 'Optional embed object.',
        },
        embeds: {
          type: 'array',
          items: { type: 'object', properties: EMBED_SCHEMA_PROPERTIES },
          description: 'Optional array of embed objects.',
        },
      },
      required: [],
    },
    risk: 'LOW',
    capability: 'SEND_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const channel = args.channel
        ? findChannel(ctx.guild, args.channel as string)
        : ctx.channel ?? (ctx.guild as never);
      if (!channel || !('send' in channel)) return fail('Cannot send to this channel.');

      const opts = prepareMessageOptions(args.content, args.embed, args.embeds);
      if (!opts.content && (!opts.embeds || opts.embeds.length === 0)) {
        return fail('Must provide content or an embed to send.');
      }

      const textChannel = channel as unknown as {
        send(o: typeof opts): Promise<{ id: string }>;
      };
      const msg = await textChannel.send(opts);
      return okPosted(`Sent message (${msg.id}).`, channel.id, { messageId: msg.id });
    },
  });

  registerTool({
    name: 'discord.message.reply',
    description: 'Reply to the current message with content or an embed.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        embed: {
          type: 'object',
          properties: EMBED_SCHEMA_PROPERTIES,
          description: 'Optional embed object.',
        },
      },
      required: [],
    },
    risk: 'LOW',
    capability: 'SEND_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      if (!ctx.message) return fail('No message to reply to in this context.');

      const opts = prepareMessageOptions(args.content, args.embed);
      if (!opts.content && (!opts.embeds || opts.embeds.length === 0)) {
        return fail('Must provide content or an embed to reply.');
      }

      const msg = await ctx.message.reply(opts);
      return okPosted(`Replied (${msg.id}).`, ctx.message.channelId, { messageId: msg.id });
    },
  });

  registerTool({
    name: 'discord.message.edit',
    description: 'Edit a message previously sent by the bot (content and/or embed).',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name/id.' },
        message_id: { type: 'string', description: 'Message id.' },
        content: { type: 'string' },
        embed: {
          type: 'object',
          properties: EMBED_SCHEMA_PROPERTIES,
          description: 'Optional updated embed object.',
        },
      },
      required: ['channel', 'message_id'],
    },
    risk: 'LOW',
    capability: 'SEND_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.channel as string);
      if (!channel || !('messages' in channel)) return fail('Channel not found or not text-based.');

      const opts = prepareMessageOptions(args.content, args.embed);
      if (!opts.content && (!opts.embeds || opts.embeds.length === 0)) {
        return fail('Must provide updated content or embed.');
      }

      const msg = await (channel as unknown as {
        messages: { fetch: (id: string) => Promise<{ edit(o: typeof opts): Promise<unknown> }> };
      }).messages.fetch(String(args.message_id));
      await msg.edit(opts);
      return ok('Message edited.');
    },
  });

  registerTool({
    name: 'discord.message.delete',
    description: 'Delete a message by id. channel is optional — if omitted, the current channel is used.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name/id. Defaults to the current channel.' },
        message_id: { type: 'string', description: 'ID of the message to delete.' },
      },
      required: ['message_id'],
    },
    risk: 'HIGH',
    capability: 'MANAGE_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const channel = args.channel
        ? findChannel(ctx.guild, args.channel as string)
        : (ctx.channel as typeof ctx.channel & { messages?: unknown }) ?? null;
      if (!channel || !('messages' in channel)) return fail('Channel not found or not text-based.');
      try {
        const msg = await (channel as unknown as {
          messages: { fetch: (id: string) => Promise<{ delete(): Promise<unknown> }> };
        }).messages.fetch(String(args.message_id));
        await msg.delete();
        return ok(`Message ${args.message_id} deleted.`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail(`Failed to delete message: ${msg}`);
      }
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
