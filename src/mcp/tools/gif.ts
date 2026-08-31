import { EmbedBuilder } from 'discord.js';
import { registerTool } from '../registry.js';
import type { ToolDescriptor } from '../types.js';
import type { ExecutionContext } from '../../discord/types.js';
import { ok, okPosted, fail, findChannel } from './helpers.js';
import {
  REACTIONS,
  NEKOS_BEST_IMAGE_CATEGORIES,
  fetchReactionGif,
  fetchImage,
  buildCaption,
} from '../../discord/gifs.js';

/** Resolves a target string (mention / raw id / name) to a display name. */
export function resolveTargetName(ctx: ExecutionContext, target: string): string {
  const raw = target.trim();
  const mention = /^<@!?(\d+)>$/.exec(raw);
  if (mention) {
    const m = ctx.guild.members.cache.get(mention[1]!);
    return m ? (m.displayName ?? m.user.username) : mention[1]!;
  }
  if (/^\d{15,22}$/.test(raw)) {
    const m = ctx.guild.members.cache.get(raw);
    return m ? (m.displayName ?? m.user.username) : raw;
  }
  return raw;
}

function actorName(ctx: ExecutionContext): string {
  return ctx.member?.displayName ?? ctx.author?.username ?? ctx.userName;
}

export function registerGifTools(): void {
  registerTool({
    name: 'discord.gif.get',
    description:
      'Resolve a reaction/animation (e.g. "kiss", "hug", "hit", "punch", "wave", "pat") to a hosted anime GIF URL. Read-only — does not post anything.',
    inputSchema: {
      type: 'object',
      properties: {
        reaction: {
          type: 'string',
          description: `The reaction or intent, e.g. "kiss", "hug", "hit", "punch", "wave", "pat", "cry". Any of: ${REACTIONS.join(', ')}.`,
        },
      },
      required: ['reaction'],
    },
    risk: 'READ',
    mutates: false,
    async execute(_ctx, args) {
      try {
        const result = await fetchReactionGif(String(args.reaction));
        return ok(`GIF for "${result.reaction}" [${result.source}]: ${result.url}`, result);
      } catch (err) {
        return fail((err as Error).message);
      }
    },
  });

  registerTool({
    name: 'discord.gif.send',
    description:
      'Send an anime reaction GIF in an embed with a playful caption. Use when a user asks to kiss/hug/hit/wave/pat someone (e.g. "kiss @user") or requests a reaction gif.',
    inputSchema: {
      type: 'object',
      properties: {
        reaction: {
          type: 'string',
          description: `The reaction or intent, e.g. "kiss", "hug", "hit", "punch", "wave", "pat", "cry". Any of: ${REACTIONS.join(', ')}.`,
        },
        target: {
          type: 'string',
          description: 'Optional user to direct the gif at (mention or name).',
        },
        caption: {
          type: 'string',
          description: 'Optional custom caption. If omitted, a playful caption is generated automatically.',
        },
        channel: {
          type: 'string',
          description: 'Target channel name/id (defaults to the current channel).',
        },
      },
      required: ['reaction'],
    },
    risk: 'LOW',
    capability: 'SEND_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      let result;
      try {
        result = await fetchReactionGif(String(args.reaction));
      } catch (err) {
        return fail((err as Error).message);
      }

      const actor = actorName(ctx);
      const targetName = args.target ? resolveTargetName(ctx, String(args.target)) : undefined;
      const caption =
        args.caption !== undefined
          ? String(args.caption)
          : buildCaption(result.reaction, actor, targetName);

      const channel = args.channel
        ? findChannel(ctx.guild, args.channel as string)
        : ctx.channel ?? (ctx.guild as never);
      if (!channel || !('send' in channel)) return fail('Cannot send to this channel.');

      const embed = new EmbedBuilder()
        .setImage(result.url)
        .setColor(0x9b59b6);

      const textChannel = channel as unknown as {
        send(o: { content?: string; embeds?: EmbedBuilder[] }): Promise<{ id: string }>;
      };
      const msg = await textChannel.send({ content: caption, embeds: [embed] });

      return okPosted(`Sent "${result.reaction}" GIF.`, channel.id, { messageId: msg.id, reaction: result.reaction, url: result.url, source: result.source });
    },
  });

  registerTool({
    name: 'discord.image.send',
    description:
      'Send a cute anime image (neko, kitsune, husband, or waifu) in an embed. Use when a user asks for a neko/waifu/kitsune image.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: [...NEKOS_BEST_IMAGE_CATEGORIES],
          description: 'Image category.',
        },
        channel: {
          type: 'string',
          description: 'Target channel name/id (defaults to the current channel).',
        },
      },
      required: ['category'],
    },
    risk: 'LOW',
    capability: 'SEND_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      let img;
      try {
        img = await fetchImage(String(args.category));
      } catch (err) {
        return fail((err as Error).message);
      }

      const channel = args.channel
        ? findChannel(ctx.guild, args.channel as string)
        : ctx.channel ?? (ctx.guild as never);
      if (!channel || !('send' in channel)) return fail('Cannot send to this channel.');

      const embed = new EmbedBuilder().setImage(img.url).setColor(0x5865f2);
      const textChannel = channel as unknown as {
        send(o: { embeds?: EmbedBuilder[] }): Promise<{ id: string }>;
      };
      const msg = await textChannel.send({ embeds: [embed] });

      return okPosted(`Sent ${img.category} image.`, channel.id, { messageId: msg.id, category: img.category, url: img.url });
    },
  });
}
