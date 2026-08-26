import type { ToolDescriptor } from '../types.js';
import { registerTool } from '../registry.js';
import { memoryRepository } from '../../database/repositories/memoryRepository.js';
import { ok, fail } from './helpers.js';

export function registerMemoryTools(): void {
  registerTool({
    name: 'discord.memory.store',
    description:
      'Store a guild-scoped memory entry. Defaults to GUILD scope. Memory is always isolated to the current server.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Short key/name for this memory.' },
        value: { type: 'string', description: 'The content to remember.' },
        scope: { type: 'string', enum: ['GUILD', 'CHANNEL', 'USER'], description: 'Memory scope (default GUILD).' },
        channel_id: { type: 'string', description: 'Channel id for CHANNEL scope.' },
        user_id: { type: 'string', description: 'User id for USER scope.' },
      },
      required: ['key', 'value'],
    },
    risk: 'LOW',
    mutates: true,
    async execute(ctx, args) {
      const record = memoryRepository.store({
        guildId: ctx.guildId,
        scope: (args.scope as never) ?? 'GUILD',
        channelId: args.channel_id ? String(args.channel_id) : null,
        userId: args.user_id ? String(args.user_id) : null,
        key: String(args.key),
        value: String(args.value),
      });
      return ok(`Remembered "${record.key}".`, { id: record.id });
    },
  });

  registerTool({
    name: 'discord.memory.list',
    description: 'List memory entries for the current server (optionally filtered).',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['GUILD', 'CHANNEL', 'USER'] },
        query: { type: 'string' },
      },
      required: [],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const records = memoryRepository.list({
        guildId: ctx.guildId,
        scope: args.scope as never,
        query: args.query ? String(args.query) : undefined,
        limit: 100,
      });
      const lines = records.map((r) => `- [${r.scope}] ${r.key}: ${r.value}`);
      return ok(lines.length ? lines.join('\n') : 'No memories stored for this server.');
    },
  });

  registerTool({
    name: 'discord.memory.search',
    description: 'Search this server\'s memory for entries matching a query.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const records = memoryRepository.list({
        guildId: ctx.guildId,
        query: String(args.query),
        limit: 50,
      });
      const lines = records.map((r) => `- [${r.scope}] ${r.key}: ${r.value}`);
      return ok(lines.length ? lines.join('\n') : `No memories matched "${args.query}".`);
    },
  });

  registerTool({
    name: 'discord.memory.update',
    description: 'Update a memory entry by key.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        value: { type: 'string' },
        scope: { type: 'string', enum: ['GUILD', 'CHANNEL', 'USER'] },
      },
      required: ['key', 'value'],
    },
    risk: 'LOW',
    mutates: true,
    async execute(ctx, args) {
      const existing = memoryRepository.get({
        guildId: ctx.guildId,
        scope: (args.scope as never) ?? 'GUILD',
        key: String(args.key),
      });
      if (!existing) return fail(`No memory found with key "${args.key}".`);
      memoryRepository.update(existing.id, ctx.guildId, String(args.value));
      return ok(`Updated memory "${args.key}".`);
    },
  });

  registerTool({
    name: 'discord.memory.delete',
    description: 'Delete a memory entry by key.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        scope: { type: 'string', enum: ['GUILD', 'CHANNEL', 'USER'] },
      },
      required: ['key'],
    },
    risk: 'LOW',
    mutates: true,
    async execute(ctx, args) {
      const existing = memoryRepository.get({
        guildId: ctx.guildId,
        scope: (args.scope as never) ?? 'GUILD',
        key: String(args.key),
      });
      if (!existing) return fail(`No memory found with key "${args.key}".`);
      memoryRepository.delete(existing.id, ctx.guildId);
      return ok(`Forgot "${args.key}".`);
    },
  });
}
