import type { ToolDescriptor } from '../types.js';
import { registerTool } from '../registry.js';
import { ok, fail, findChannel, truncate } from './helpers.js';

export function registerSearchTools(): void {
  registerTool({
    name: 'discord.search.messages',
    description:
      'Search recent messages across channels for a query. Filters by author, channel, and time.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text to search for.' },
        channel: { type: 'string', description: 'Optional channel name/id to limit search.' },
        author: { type: 'string', description: 'Optional author name/id.' },
        limit: { type: 'integer', description: 'Max messages to scan per channel (default 100).' },
      },
      required: ['query'],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const query = String(args.query).toLowerCase();
      const authorFilter = args.author ? String(args.author).toLowerCase() : undefined;
      const limit = Math.min(Number(args.limit) || 100, 200);

      const channels = args.channel
        ? [findChannel(ctx.guild, args.channel as string)].filter(Boolean)
        : [...ctx.guild.channels.cache.values()].filter((c) => 'messages' in c);

      const results: string[] = [];

      for (const channel of channels) {
        if (!channel || results.length >= 50) break;
        let messages;
        try {
          messages = await (channel as unknown as {
            messages: { fetch: (opts: { limit: number }) => Promise<Map<string, { content: string; author: { tag: string; username: string; id: string }; createdAt: Date }>> };
          }).messages.fetch({ limit });
        } catch {
          continue;
        }
        for (const msg of messages.values()) {
          const authorName = `${msg.author.tag} ${msg.author.username}`.toLowerCase();
          if (authorFilter && !authorName.includes(authorFilter) && msg.author.id !== authorFilter) continue;
          if (msg.content.toLowerCase().includes(query)) {
            results.push(
              `#${channel.name} | ${msg.author.tag}: ${msg.content.slice(0, 200)}`,
            );
          }
        }
      }

      return ok(results.length ? truncate(results.join('\n'), 3500) : `No messages matched "${args.query}".`);
    },
  });
}
