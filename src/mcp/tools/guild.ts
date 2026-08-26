import { ChannelType } from 'discord.js';
import type { ToolDescriptor } from '../types.js';
import { registerTool } from '../registry.js';
import { ok, fail } from './helpers.js';
import { formatGuild, formatRoles, formatChannelSummary } from './format.js';

export function registerGuildTools(): void {
  registerTool({
    name: 'discord.guild.get',
    description:
      'Get basic information about the current Discord server (guild): name, id, member count, owner, boost level.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      const g = ctx.guild;
      return ok(
        [
          `Server: ${g.name}`,
          `ID: ${g.id}`,
          `Owner: <@${g.ownerId}>`,
          `Members: ${g.memberCount}`,
          `Boost level: ${g.premiumTier}`,
          `Channels: ${g.channels.cache.size}`,
          `Roles: ${g.roles.cache.size}`,
        ].join('\n'),
        { id: g.id, name: g.name, memberCount: g.memberCount, ownerId: g.ownerId },
      );
    },
  });

  registerTool({
    name: 'discord.guild.inspect',
    description:
      'Inspect the full structure of the current server in an LLM-friendly form: categories, channels, and roles. Use this to understand the server before making changes.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      const g = ctx.guild;
      const structure = formatGuild(g);
      const roles = formatRoles(g);
      return ok(
        `${structure}\n\nRoles:\n${roles}`,
        { channels: g.channels.cache.size, roles: g.roles.cache.size },
      );
    },
  });

  registerTool({
    name: 'discord.guild.get_settings',
    description: 'Get the current server settings (verification level, default notifications, etc.).',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      const g = ctx.guild;
      return ok(
        [
          `Verification level: ${g.verificationLevel}`,
          `Default notifications: ${g.defaultMessageNotifications}`,
          `Explicit content filter: ${g.explicitContentFilter}`,
          `NSFW level: ${g.nsfwLevel}`,
          `AFK timeout: ${g.afkTimeout}s`,
          `Max members: ${g.maximumMembers}`,
        ].join('\n'),
      );
    },
  });

  registerTool({
    name: 'discord.guild.list_channels',
    description: 'List all channels in the current server with their ids and types.',
    inputSchema: {
      type: 'object',
      properties: { category: { type: 'string', description: 'Optional category name/id to filter by.' } },
      required: [],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const g = ctx.guild;
      let channels = [...g.channels.cache.values()].filter((c) => !c.isThread());
      if (args.category) {
        const cat = g.channels.cache.find(
          (c) =>
            c.type === ChannelType.GuildCategory &&
            (c.id === args.category || c.name.toLowerCase() === String(args.category).toLowerCase()),
        );
        channels = channels.filter((c) => c.parentId === cat?.id);
      }
      const lines = channels
        .sort((a, b) => (a as import('discord.js').GuildChannel).position - (b as import('discord.js').GuildChannel).position)
        .map((c) => formatChannelSummary(c));
      return ok(lines.length ? lines.join('\n') : 'No channels found.', { count: lines.length });
    },
  });

  registerTool({
    name: 'discord.guild.list_categories',
    description: 'List all categories in the current server.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      const cats = ctx.guild.channels.cache
        .filter((c) => c.type === ChannelType.GuildCategory)
        .sort((a, b) => a.position - b.position)
        .map((c) => `- ${c.name} (${c.id})`);
      return ok(cats.length ? cats.join('\n') : 'No categories.');
    },
  });

  registerTool({
    name: 'discord.guild.list_roles',
    description: 'List all roles in the current server with ids, colors, and permissions.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      return ok(formatRoles(ctx.guild));
    },
  });

  registerTool({
    name: 'discord.guild.list_members',
    description: 'List members of the current server (paginated).',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', description: 'Max members to return (default 100).' } },
      required: [],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const limit = Math.min(Number(args.limit) || 100, 500);
      const members = ctx.guild.members.cache
        .filter((m) => !m.user.bot)
        .first(limit)
        .map((m) => `- ${m.user.tag} (${m.id})${m.nickname ? ` aka ${m.nickname}` : ''}`);
      return ok(members.length ? members.join('\n') : 'No members cached.');
    },
  });

  registerTool({
    name: 'discord.guild.list_emojis',
    description: 'List custom emojis in the current server.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      const emojis = ctx.guild.emojis.cache.map((e) => `${e.name} (${e.id})`);
      return ok(emojis.length ? emojis.join('\n') : 'No custom emojis.');
    },
  });

  registerTool({
    name: 'discord.guild.list_stickers',
    description: 'List stickers in the current server.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      const stickers = ctx.guild.stickers.cache.map((s) => `${s.name} (${s.id})`);
      return ok(stickers.length ? stickers.join('\n') : 'No stickers.');
    },
  });

  registerTool({
    name: 'discord.guild.get_audit_log',
    description: 'Fetch recent entries from the server audit log.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', description: 'Number of entries (default 20).' } },
      required: [],
    },
    risk: 'READ',
    capability: 'MANAGE_GUILD',
    mutates: false,
    async execute(ctx, args) {
      const limit = Math.min(Number(args.limit) || 20, 100);
      const logs = await ctx.guild.fetchAuditLogs({ limit });
      const lines = logs.entries.map(
        (e) => `- ${e.action} by ${e.executor?.tag ?? 'unknown'} at ${e.createdAt.toISOString()}`,
      );
      return ok(lines.length ? lines.join('\n') : 'No audit log entries.');
    },
  });

  registerTool({
    name: 'discord.guild.get_invites',
    description: 'List active invites for the current server.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    capability: 'MANAGE_GUILD',
    mutates: false,
    async execute(ctx) {
      const invites = await ctx.guild.invites.fetch();
      const lines = invites.map((i) => `- ${i.code} -> #${i.channel?.name ?? '?'} (${i.uses ?? 0} uses)`);
      return ok(lines.length ? lines.join('\n') : 'No invites.');
    },
  });
}
