import type { ToolDescriptor } from '../types.js';
import { registerTool } from '../registry.js';
import { ok, fail, toId, clampInt, findChannel } from './helpers.js';

async function resolveMember(ctx: Parameters<ToolDescriptor['execute']>[0], nameOrId: string) {
  const id = toId(nameOrId);
  if (!id) return null;
  const byId = ctx.guild.members.cache.get(id) ?? (await ctx.guild.members.fetch(id).catch(() => null));
  if (byId) return byId;
  const lower = id.toLowerCase();
  return ctx.guild.members.cache.find((m) => m.user.username.toLowerCase() === lower) ?? null;
}

export function registerModerationTools(): void {
  registerTool({
    name: 'discord.moderation.warn',
    description:
      'Record a warning for a member in the audit trail (does not apply a Discord action).',
    inputSchema: {
      type: 'object',
      properties: { user: { type: 'string' }, reason: { type: 'string' } },
      required: ['user', 'reason'],
    },
    risk: 'LOW',
    capability: 'MODERATE',
    isModerationAction: true,
    mutates: true,
    async execute(ctx, args) {
      const member = await resolveMember(ctx, args.user as string);
      const userId = member?.id ?? toId(args.user as string);
      if (!userId) return fail(`Member not found: ${args.user}`);
      return ok(`Warning recorded for ${member?.user.tag ?? userId}: ${args.reason}`);
    },
  });

  registerTool({
    name: 'discord.moderation.timeout',
    description: 'Timeout a member (minutes).',
    inputSchema: {
      type: 'object',
      properties: { user: { type: 'string' }, minutes: { type: 'integer' }, reason: { type: 'string' } },
      required: ['user', 'minutes'],
    },
    risk: 'HIGH',
    capability: 'MODERATE',
    isModerationAction: true,
    mutates: true,
    async execute(ctx, args) {
      const member = await resolveMember(ctx, args.user as string);
      if (!member) return fail(`Member not found: ${args.user}`);
      const minutes = clampInt(args.minutes, 1, 40320, 10);
      await member.timeout(minutes * 60_000, args.reason ? String(args.reason) : undefined);
      return ok(`Timed out ${member.user.tag} for ${minutes} minutes.`);
    },
  });

  registerTool({
    name: 'discord.moderation.kick',
    description: 'Kick a member.',
    inputSchema: {
      type: 'object',
      properties: { user: { type: 'string' }, reason: { type: 'string' } },
      required: ['user'],
    },
    risk: 'DESTRUCTIVE',
    capability: 'MODERATE',
    isModerationAction: true,
    mutates: true,
    async execute(ctx, args) {
      const member = await resolveMember(ctx, args.user as string);
      if (!member) return fail(`Member not found: ${args.user}`);
      await member.kick(args.reason ? String(args.reason) : undefined);
      return ok(`Kicked ${member.user.tag}.`);
    },
  });

  registerTool({
    name: 'discord.moderation.ban',
    description: 'Ban a member.',
    inputSchema: {
      type: 'object',
      properties: { user: { type: 'string' }, reason: { type: 'string' } },
      required: ['user'],
    },
    risk: 'DESTRUCTIVE',
    capability: 'MODERATE',
    isModerationAction: true,
    mutates: true,
    async execute(ctx, args) {
      const member = await resolveMember(ctx, args.user as string);
      const userId = member?.id ?? toId(args.user as string);
      if (!userId) return fail(`Member not found: ${args.user}`);
      await ctx.guild.members.ban(userId, { reason: args.reason ? String(args.reason) : undefined });
      return ok(`Banned ${member?.user.tag ?? userId}.`);
    },
  });

  registerTool({
    name: 'discord.moderation.unban',
    description: 'Unban a user by id.',
    inputSchema: {
      type: 'object',
      properties: { user_id: { type: 'string' } },
      required: ['user_id'],
    },
    risk: 'HIGH',
    capability: 'MODERATE',
    isModerationAction: true,
    mutates: true,
    async execute(ctx, args) {
      await ctx.guild.members.unban(String(args.user_id));
      return ok(`Unbanned ${args.user_id}.`);
    },
  });

  registerTool({
    name: 'discord.moderation.purge',
    description: 'Bulk delete recent messages from a channel.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name/id (defaults to current).' },
        count: { type: 'integer', description: 'Number of messages to delete (2-100).' },
      },
      required: ['count'],
    },
    risk: 'DESTRUCTIVE',
    capability: 'MANAGE_MESSAGES',
    isModerationAction: true,
    mutates: true,
    async execute(ctx, args) {
      const channel = args.channel ? findChannel(ctx.guild, args.channel as string) : ctx.channel;
      if (!channel || !('bulkDelete' in channel)) return fail('Channel not found or not text-based.');
      const count = clampInt(args.count, 2, 100, 10);
      const deleted = await (channel as unknown as {
        bulkDelete: (n: number, filterOld?: boolean) => Promise<{ size: number }>;
      }).bulkDelete(count, true);
      return ok(`Purged ${deleted.size} messages from #${channel.name}.`);
    },
  });

  registerTool({
    name: 'discord.moderation.audit',
    description: 'List recent moderation actions recorded by the agent for this server.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer' } },
      required: [],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const limit = Math.min(Number(args.limit) || 20, 100);
      const logs = await ctx.guild.fetchAuditLogs({ limit });
      const lines = logs.entries
        .filter((e) =>
          ['MEMBER_KICK', 'MEMBER_BAN_ADD', 'MEMBER_BAN_REMOVE', 'MEMBER_UPDATE'].includes(
            e.actionType,
          ),
        )
        .map((e) => `- ${e.actionType} by ${e.executor?.tag ?? 'unknown'} at ${e.createdAt.toISOString()}`);
      return ok(lines.length ? lines.join('\n') : 'No recent moderation actions.');
    },
  });
}
