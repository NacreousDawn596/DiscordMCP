import type { ToolDescriptor } from '../types.js';
import { registerTool } from '../registry.js';
import { ok, fail, findChannel, toId, clampInt } from './helpers.js';

export function registerThreadTools(): void {
  registerTool({
    name: 'discord.thread.create',
    description: 'Create a thread in a text channel.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Parent channel name/id.' },
        name: { type: 'string', description: 'Thread name.' },
        auto_archive_minutes: { type: 'integer', description: 'Auto-archive duration in minutes (default 60).' },
      },
      required: ['channel', 'name'],
    },
    risk: 'LOW',
    capability: 'SEND_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.channel as string);
      if (!channel || !('threads' in channel)) return fail('Channel not found or cannot host threads.');
      const minutes = clampInt(args.auto_archive_minutes, 60, 10080, 60);
      const thread = await (channel as unknown as {
        threads: { create: (opts: { name: string; autoArchiveDuration: number }) => Promise<{ id: string; name: string }> };
      }).threads.create({ name: String(args.name).slice(0, 100), autoArchiveDuration: minutes });
      return ok(`Created thread "${thread.name}" (${thread.id}).`, { id: thread.id });
    },
  });

  registerTool({
    name: 'discord.thread.get',
    description: 'Get info about a thread.',
    inputSchema: {
      type: 'object',
      properties: { channel: { type: 'string' }, name: { type: 'string' } },
      required: ['channel', 'name'],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const parent = findChannel(ctx.guild, args.channel as string);
      if (!parent || !('threads' in parent)) return fail('Parent channel not found.');
      const threads = await (parent as unknown as {
        threads: { fetchActive: () => Promise<{ threads: { values: () => Iterable<{ name: string; id: string; archived: boolean; locked: boolean; memberCount: number }> } }> };
      }).threads.fetchActive();
      const match = [...threads.threads.values()].find(
        (t) => t.id === toId(args.name as string) || t.name.toLowerCase() === String(args.name).toLowerCase(),
      );
      if (!match) return fail(`Thread not found: ${args.name}`);
      return ok(
        `Thread "${match.name}" (${match.id})\nArchived: ${match.archived}\nLocked: ${match.locked}\nMembers: ${match.memberCount}`,
      );
    },
  });

  registerTool({
    name: 'discord.thread.list',
    description: 'List threads in a channel.',
    inputSchema: {
      type: 'object',
      properties: { channel: { type: 'string' } },
      required: ['channel'],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const parent = findChannel(ctx.guild, args.channel as string);
      if (!parent || !('threads' in parent)) return fail('Parent channel not found.');
      const threads = await (parent as unknown as {
        threads: { fetchActive: () => Promise<{ threads: { values: () => Iterable<{ name: string; id: string; archived: boolean }> } }> };
      }).threads.fetchActive();
      const lines = [...threads.threads.values()].map(
        (t) => `- ${t.name} (${t.id})${t.archived ? ' [archived]' : ''}`,
      );
      return ok(lines.length ? lines.join('\n') : 'No active threads.');
    },
  });

  registerTool({
    name: 'discord.thread.archive',
    description: 'Archive a thread.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Thread name/id.' } },
      required: ['name'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const thread = await findThread(ctx, args.name as string);
      if (!thread) return fail(`Thread not found: ${args.name}`);
      await thread.setArchived(true);
      return ok(`Archived thread "${thread.name}".`);
    },
  });

  registerTool({
    name: 'discord.thread.unarchive',
    description: 'Unarchive a thread.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const thread = await findThread(ctx, args.name as string);
      if (!thread) return fail(`Thread not found: ${args.name}`);
      await thread.setArchived(false);
      return ok(`Unarchived thread "${thread.name}".`);
    },
  });

  registerTool({
    name: 'discord.thread.lock',
    description: 'Lock a thread.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, locked: { type: 'boolean' } },
      required: ['name'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const thread = await findThread(ctx, args.name as string);
      if (!thread) return fail(`Thread not found: ${args.name}`);
      await thread.setLocked(args.locked !== undefined ? Boolean(args.locked) : true);
      return ok(`Set lock on "${thread.name}" to ${Boolean(args.locked ?? true)}.`);
    },
  });

  registerTool({
    name: 'discord.thread.delete',
    description: 'Delete a thread.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
    risk: 'DESTRUCTIVE',
    capability: 'MANAGE_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const thread = await findThread(ctx, args.name as string);
      if (!thread) return fail(`Thread not found: ${args.name}`);
      await thread.delete();
      return ok(`Deleted thread "${thread.name}".`);
    },
  });

  registerTool({
    name: 'discord.thread.join',
    description: 'Join a thread.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
    risk: 'LOW',
    mutates: true,
    async execute(ctx, args) {
      const thread = await findThread(ctx, args.name as string);
      if (!thread) return fail(`Thread not found: ${args.name}`);
      await thread.join();
      return ok(`Joined thread "${thread.name}".`);
    },
  });

  registerTool({
    name: 'discord.thread.leave',
    description: 'Leave a thread.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
    risk: 'LOW',
    mutates: true,
    async execute(ctx, args) {
      const thread = await findThread(ctx, args.name as string);
      if (!thread) return fail(`Thread not found: ${args.name}`);
      await thread.leave();
      return ok(`Left thread "${thread.name}".`);
    },
  });
}

async function findThread(ctx: Parameters<ToolDescriptor['execute']>[0], nameOrId: string) {
  const id = toId(nameOrId);
  if (!id) return null;
  const active = await ctx.guild.channels.fetchActiveThreads().catch(() => null);
  const all = active?.threads ?? new Map();
  const byId = all.get(id);
  if (byId) return byId;
  const lower = id.toLowerCase();
  for (const [, t] of all) if (t.name.toLowerCase() === lower) return t;
  return null;
}
