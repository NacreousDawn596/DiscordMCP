import { ChannelType } from 'discord.js';
import type { ToolDescriptor } from '../types.js';
import { registerTool } from '../registry.js';
import { ok, fail, findChannel } from './helpers.js';

export function registerAnalyticsTools(): void {
  registerTool({
    name: 'discord.analytics.activity',
    description: 'Summarize recent message activity per channel (based on cached/fetchable history).',
    inputSchema: {
      type: 'object',
      properties: { channel: { type: 'string', description: 'Optional channel name/id.' } },
      required: [],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const channels = args.channel
        ? [findChannel(ctx.guild, args.channel as string)].filter(Boolean)
        : [...ctx.guild.channels.cache.values()].filter(
            (c) => c.type === ChannelType.GuildText && 'messages' in c,
          );
      const lines: string[] = [];
      for (const channel of channels) {
        if (!channel) continue;
        try {
          const msgs = await (channel as unknown as {
            messages: { fetch: (opts: { limit: number }) => Promise<Map<string, { createdAt: Date }>> };
          }).messages.fetch({ limit: 100 });
          const now = Date.now();
          const recent = [...msgs.values()].filter((m) => now - m.createdAt.getTime() < 7 * 24 * 3600_000);
          lines.push(`#${channel.name}: ${recent.length} messages in the last 7 days`);
        } catch {
          lines.push(`#${channel.name}: unavailable`);
        }
      }
      return ok(lines.join('\n') || 'No text channels.');
    },
  });

  registerTool({
    name: 'discord.analytics.channels',
    description: 'List channels ordered by position with type and topic summary.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      const channels = [...ctx.guild.channels.cache.values()]
        .filter((c) => !c.isThread())
        .sort(
          (a, b) =>
            (a as import('discord.js').GuildChannel).position -
            (b as import('discord.js').GuildChannel).position,
        );
      const lines = channels.map((c) => {
        const topic = 'topic' in c && c.topic ? ` — ${c.topic.slice(0, 60)}` : '';
        return `#${c.name} (${ChannelType[c.type] ?? c.type})${topic}`;
      });
      return ok(lines.join('\n') || 'No channels.');
    },
  });

  registerTool({
    name: 'discord.analytics.members',
    description: 'Summarize member counts (bots vs humans, online status).',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      const members = [...ctx.guild.members.cache.values()];
      const bots = members.filter((m) => m.user.bot).length;
      const humans = members.length - bots;
      return ok(
        [
          `Total cached members: ${members.length}`,
          `Humans: ${humans}`,
          `Bots: ${bots}`,
          `Server memberCount: ${ctx.guild.memberCount}`,
        ].join('\n'),
      );
    },
  });

  registerTool({
    name: 'discord.analytics.messages',
    description: 'Count recent messages in a channel (defaults to current channel).',
    inputSchema: {
      type: 'object',
      properties: { channel: { type: 'string' }, hours: { type: 'integer' } },
      required: [],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const channel = args.channel ? findChannel(ctx.guild, args.channel as string) : ctx.channel;
      if (!channel || !('messages' in channel)) return fail('Channel not found.');
      const hours = Math.min(Number(args.hours) || 24, 24 * 30);
      const msgs = await (channel as unknown as {
        messages: { fetch: (opts: { limit: number }) => Promise<Map<string, { createdAt: Date }>> };
      }).messages.fetch({ limit: 100 });
      const cutoff = Date.now() - hours * 3600_000;
      const count = [...msgs.values()].filter((m) => m.createdAt.getTime() >= cutoff).length;
      return ok(`#${(channel as { name: string }).name}: ${count} messages in the last ${hours}h.`);
    },
  });

  registerTool({
    name: 'discord.analytics.threads',
    description: 'Count active/archived threads per channel.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      const lines: string[] = [];
      for (const channel of ctx.guild.channels.cache.values()) {
        if (!('threads' in channel)) continue;
        try {
          const active = await (channel as unknown as {
            threads: { fetchActive: () => Promise<{ threads: { size: number } }> };
          }).threads.fetchActive();
          lines.push(`#${channel.name}: ${active.threads.size} active threads`);
        } catch {
          /* skip */
        }
      }
      return ok(lines.join('\n') || 'No thread-capable channels.');
    },
  });

  registerTool({
    name: 'discord.analytics.reactions',
    description: 'Summarize reactions on recent messages in a channel.',
    inputSchema: {
      type: 'object',
      properties: { channel: { type: 'string' } },
      required: ['channel'],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.channel as string);
      if (!channel || !('messages' in channel)) return fail('Channel not found.');
      const msgs = await (channel as unknown as {
        messages: {
          fetch: (opts: { limit: number }) => Promise<
            Map<string, { reactions: { cache: Map<string, { emoji: { name?: string }; count: number }> } }>
          >;
        };
      }).messages.fetch({ limit: 100 });
      const counts = new Map<string, number>();
      for (const msg of msgs.values()) {
        for (const [, r] of msg.reactions.cache) {
          const key = r.emoji.name ?? 'custom';
          counts.set(key, (counts.get(key) ?? 0) + r.count);
        }
      }
      const lines = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([emoji, count]) => `${emoji}: ${count}`);
      return ok(lines.length ? lines.join('\n') : 'No reactions in recent messages.');
    },
  });
}
