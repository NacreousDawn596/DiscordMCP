import { EmbedBuilder } from 'discord.js';
import { registerTool } from '../registry.js';
import { ok, fail, findChannel } from './helpers.js';
import { REACTIONS, fetchGif, buildCaption, resolveReaction } from '../../discord/gifs.js';

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
        const result = await fetchGif(String(args.reaction));
        return ok(`GIF for "${result.reaction}": ${result.url}`, result);
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
        result = await fetchGif(String(args.reaction));
      } catch (err) {
        return fail((err as Error).message);
      }

      const actor = ctx.member?.displayName ?? ctx.author?.username ?? ctx.userName;
      const caption =
        args.caption !== undefined
          ? String(args.caption)
          : buildCaption(result.reaction, actor, args.target ? String(args.target) : undefined);

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

      return ok(`Sent "${result.reaction}" GIF.`, { messageId: msg.id, reaction: result.reaction, url: result.url });
    },
  });
}
