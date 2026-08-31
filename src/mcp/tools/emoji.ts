import { registerTool } from '../registry.js';
import { ok, okPosted, fail, findChannel, toId } from './helpers.js';

export function registerEmojiTools(): void {
  registerTool({
    name: 'discord.emoji.list',
    description:
      'List custom emojis in the server, in a ready-to-use <:name:id> format you can paste directly into message content (or <a:name:id> for animated emojis).',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      const emojis = [...ctx.guild.emojis.cache.values()];
      if (emojis.length === 0) return ok('No custom emojis in this server.');
      const lines = emojis.map((e) => {
        const tag = e.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`;
        return `- ${e.name} (${e.id}) → ${tag}`;
      });
      return ok(lines.join('\n'), {
        emojis: emojis.map((e) => ({ name: e.name, id: e.id, animated: e.animated })),
      });
    },
  });

  registerTool({
    name: 'discord.emoji.get',
    description: 'Resolve a custom emoji by name or id to its <:name:id> tag (usable in message content).',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Emoji name or id.' } },
      required: ['name'],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const id = toId(args.name as string);
      const emoji = ctx.guild.emojis.cache.get(id ?? '') ?? ctx.guild.emojis.cache.find((e) => e.name.toLowerCase() === id?.toLowerCase());
      if (!emoji) return fail(`Emoji not found: ${args.name}`);
      const tag = emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
      return ok(`Emoji "${emoji.name}" → ${tag}`, { name: emoji.name, id: emoji.id, tag });
    },
  });

  registerTool({
    name: 'discord.sticker.list',
    description: 'List stickers available in the server.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      const stickers = [...ctx.guild.stickers.cache.values()];
      if (stickers.length === 0) return ok('No stickers in this server.');
      const lines = stickers.map((s) => `- ${s.name} (${s.id})`);
      return ok(lines.join('\n'), { stickers: stickers.map((s) => ({ name: s.name, id: s.id })) });
    },
  });

  registerTool({
    name: 'discord.sticker.send',
    description: 'Send a server sticker to a channel by name or id.',
    inputSchema: {
      type: 'object',
      properties: {
        sticker: { type: 'string', description: 'Sticker name or id.' },
        channel: { type: 'string', description: 'Target channel name/id (defaults to current).' },
      },
      required: ['sticker'],
    },
    risk: 'LOW',
    capability: 'SEND_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const id = toId(args.sticker as string);
      const sticker =
        ctx.guild.stickers.cache.get(id ?? '') ??
        ctx.guild.stickers.cache.find((s) => s.name.toLowerCase() === id?.toLowerCase());
      if (!sticker) return fail(`Sticker not found: ${args.sticker}`);

      const channel = args.channel
        ? findChannel(ctx.guild, args.channel as string)
        : ctx.channel ?? (ctx.guild as never);
      if (!channel || !('send' in channel)) return fail('Cannot send to this channel.');

      const textChannel = channel as unknown as {
        send(o: { stickers: string[] }): Promise<{ id: string }>;
      };
      const msg = await textChannel.send({ stickers: [sticker.id] });

      return okPosted(`Sent sticker "${sticker.name}".`, channel.id, { messageId: msg.id, stickerId: sticker.id });
    },
  });
}
