import type { ToolDescriptor } from '../types.js';
import { registerTool } from '../registry.js';
import { ok, fail, findRole, toId, clampInt, resolveMember, fetchAllMembers, canManageRole } from './helpers.js';

export function registerMemberTools(): void {
  registerTool({
    name: 'discord.member.get',
    description: 'Get detailed information about a member (id, username, nickname, bot flag, joined date, avatar, roles).',
    inputSchema: { type: 'object', properties: { user: { type: 'string' } }, required: ['user'] },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const member = await resolveMember(ctx.guild, args.user as string);
      if (!member) return fail(`Member not found: ${args.user}`);
      const roles = member.roles.cache.filter((r) => r.id !== ctx.guild.roles.everyone.id);
      const info = {
        id: member.id,
        username: member.user.username,
        tag: member.user.tag,
        display_name: member.nickname ?? member.user.displayName ?? member.user.username,
        nickname: member.nickname,
        bot: member.user.bot,
        joined_at: member.joinedAt?.toISOString() ?? null,
        avatar: member.displayAvatarURL(),
        roles: roles.map((r) => ({ id: r.id, name: r.name })),
      };
      return ok(
        [
          `${info.display_name} (@${info.username}) (${info.id})`,
          `Tag: ${info.tag}${info.bot ? ' [BOT]' : ''}`,
          `Nickname: ${info.nickname ?? '(none)'}`,
          `Joined: ${info.joined_at ?? 'unknown'}`,
          `Avatar: ${info.avatar}`,
          `Roles: ${info.roles.map((r) => r.name).join(', ') || 'none'}`,
        ].join('\n'),
        info,
      );
    },
  });

  registerTool({
    name: 'discord.member.search',
    description: 'Search for members by username or nickname fragment.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'integer' } },
      required: ['query'],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const q = String(args.query).toLowerCase();
      const limit = Math.min(Number(args.limit) || 20, 100);
      const { members, note } = await fetchAllMembers(ctx.guild);
      const matches = members
        .filter(
          (m) =>
            m.user.username.toLowerCase().includes(q) ||
            (m.nickname ?? '').toLowerCase().includes(q) ||
            m.user.tag.toLowerCase().includes(q),
        )
        .first(limit)
        .map((m) => `- ${m.user.tag} (${m.id})`);
      return ok(
        (matches.length ? matches.join('\n') : 'No members matched.') + (note ? `\n\n${note}` : ''),
      );
    },
  });

  registerTool({
    name: 'discord.member.list',
    description: 'List all members in the server (fetches the full roster).',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer' } },
      required: [],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const limit = Math.min(Number(args.limit) || 100, 500);
      const { members, note } = await fetchAllMembers(ctx.guild);
      const lines = members
        .first(limit)
        .map((m) => `- ${m.user.tag} (${m.id})${m.nickname ? ` aka ${m.nickname}` : ''}`);
      return ok((lines.length ? lines.join('\n') : 'No members.') + (note ? `\n\n${note}` : ''));
    },
  });

  registerTool({
    name: 'discord.member.roles',
    description: 'List the roles held by a member.',
    inputSchema: { type: 'object', properties: { user: { type: 'string' } }, required: ['user'] },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const member = await resolveMember(ctx.guild, args.user as string);
      if (!member) return fail(`Member not found: ${args.user}`);
      const roles = member.roles.cache.filter((r) => r.id !== ctx.guild.roles.everyone.id);
      return ok(roles.map((r) => `- ${r.name} (${r.id})`).join('\n') || 'No roles.');
    },
  });

  registerTool({
    name: 'discord.member.add_role',
    description: 'Add a role to a member.',
    inputSchema: {
      type: 'object',
      properties: { user: { type: 'string' }, role: { type: 'string' } },
      required: ['user', 'role'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_ROLES',
    mutates: true,
    async execute(ctx, args) {
      const member = await resolveMember(ctx.guild, args.user as string);
      const role = findRole(ctx.guild, args.role as string);
      if (!member) return fail(`Member not found: ${args.user}`);
      if (!role) return fail(`Role not found: ${args.role}`);
      const can = canManageRole(ctx.guild.members.me ?? null, role);
      if (!can.ok) return fail(can.reason);
      await member.roles.add(role);
      return ok(`Added role "${role.name}" to ${member.user.tag}.`);
    },
  });

  registerTool({
    name: 'discord.member.remove_role',
    description: 'Remove a role from a member.',
    inputSchema: {
      type: 'object',
      properties: { user: { type: 'string' }, role: { type: 'string' } },
      required: ['user', 'role'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_ROLES',
    mutates: true,
    async execute(ctx, args) {
      const member = await resolveMember(ctx.guild, args.user as string);
      const role = findRole(ctx.guild, args.role as string);
      if (!member) return fail(`Member not found: ${args.user}`);
      if (!role) return fail(`Role not found: ${args.role}`);
      const can = canManageRole(ctx.guild.members.me ?? null, role);
      if (!can.ok) return fail(can.reason);
      await member.roles.remove(role);
      return ok(`Removed role "${role.name}" from ${member.user.tag}.`);
    },
  });

  registerTool({
    name: 'discord.member.set_nickname',
    description: 'Set a member nickname (empty string to reset).',
    inputSchema: {
      type: 'object',
      properties: { user: { type: 'string' }, nickname: { type: 'string' } },
      required: ['user', 'nickname'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_MEMBERS',
    mutates: true,
    async execute(ctx, args) {
      const member = await resolveMember(ctx.guild, args.user as string);
      if (!member) return fail(`Member not found: ${args.user}`);
      const nick = String(args.nickname).slice(0, 32);
      await member.setNickname(nick || null);
      return ok(`Set nickname for ${member.user.tag}${nick ? ` to "${nick}"` : ' (reset)'}.`);
    },
  });

  registerTool({
    name: 'discord.member.timeout',
    description: 'Timeout a member for a number of minutes (max 40320 = 28 days).',
    inputSchema: {
      type: 'object',
      properties: {
        user: { type: 'string' },
        minutes: { type: 'integer' },
        reason: { type: 'string' },
      },
      required: ['user', 'minutes'],
    },
    risk: 'HIGH',
    capability: 'MODERATE',
    isModerationAction: true,
    mutates: true,
    async execute(ctx, args) {
      const member = await resolveMember(ctx.guild, args.user as string);
      if (!member) return fail(`Member not found: ${args.user}`);
      const minutes = clampInt(args.minutes, 1, 40320, 10);
      await member.timeout(minutes * 60_000, args.reason ? String(args.reason) : undefined);
      return ok(`Timed out ${member.user.tag} for ${minutes} minutes.`);
    },
  });

  registerTool({
    name: 'discord.member.remove_timeout',
    description: 'Remove a timeout from a member.',
    inputSchema: {
      type: 'object',
      properties: { user: { type: 'string' } },
      required: ['user'],
    },
    risk: 'LOW',
    capability: 'MODERATE',
    isModerationAction: true,
    mutates: true,
    async execute(ctx, args) {
      const member = await resolveMember(ctx.guild, args.user as string);
      if (!member) return fail(`Member not found: ${args.user}`);
      await member.timeout(null);
      return ok(`Removed timeout from ${member.user.tag}.`);
    },
  });

  registerTool({
    name: 'discord.member.kick',
    description: 'Kick a member from the server.',
    inputSchema: {
      type: 'object',
      properties: { user: { type: 'string' }, reason: { type: 'string' } },
      required: ['user'],
    },
    risk: 'DESTRUCTIVE',
    capability: 'MANAGE_MEMBERS',
    isModerationAction: true,
    mutates: true,
    async execute(ctx, args) {
      const member = await resolveMember(ctx.guild, args.user as string);
      if (!member) return fail(`Member not found: ${args.user}`);
      await member.kick(args.reason ? String(args.reason) : undefined);
      return ok(`Kicked ${member.user.tag}.`);
    },
  });

  registerTool({
    name: 'discord.member.ban',
    description: 'Ban a member from the server.',
    inputSchema: {
      type: 'object',
      properties: {
        user: { type: 'string' },
        reason: { type: 'string' },
        delete_message_days: { type: 'integer', description: 'Days of messages to delete (0-7).' },
      },
      required: ['user'],
    },
    risk: 'DESTRUCTIVE',
    capability: 'MANAGE_MEMBERS',
    isModerationAction: true,
    mutates: true,
    async execute(ctx, args) {
      const member = await resolveMember(ctx.guild, args.user as string);
      const userId = member?.id ?? toId(args.user as string);
      if (!userId) return fail(`Member not found: ${args.user}`);
      const days = clampInt(args.delete_message_days, 0, 7, 0);
      await ctx.guild.members.ban(userId, {
        reason: args.reason ? String(args.reason) : undefined,
        deleteMessageSeconds: days * 24 * 3600,
      });
      return ok(`Banned ${member?.user.tag ?? userId}.`);
    },
  });

  registerTool({
    name: 'discord.member.unban',
    description: 'Unban a user by id.',
    inputSchema: {
      type: 'object',
      properties: { user_id: { type: 'string' } },
      required: ['user_id'],
    },
    risk: 'HIGH',
    capability: 'MANAGE_MEMBERS',
    isModerationAction: true,
    mutates: true,
    async execute(ctx, args) {
      await ctx.guild.members.unban(String(args.user_id));
      return ok(`Unbanned ${args.user_id}.`);
    },
  });
}
