import { ChannelType, PermissionsBitField } from 'discord.js';
import type { ToolDescriptor } from '../types.js';
import { registerTool } from '../registry.js';
import { ok, fail, findChannel, findRole, toId } from './helpers.js';

export function registerPermissionTools(): void {
  registerTool({
    name: 'discord.permission.inspect',
    description:
      'Inspect effective permissions for a member (defaults to the invoking user) in a given channel or the whole server.',
    inputSchema: {
      type: 'object',
      properties: {
        user: { type: 'string', description: 'Member name/id/@mention (defaults to you).' },
        channel: { type: 'string', description: 'Channel name/id (optional).' },
      },
      required: [],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const member = args.user ? await resolveMember(ctx, args.user as string) : ctx.member;
      if (!member) return fail('Could not resolve member.');
      const channel: import('discord.js').NonThreadGuildBasedChannel | null = (
        args.channel
          ? findChannel(ctx.guild, args.channel as string)
          : (ctx.channel as import('discord.js').NonThreadGuildBasedChannel | null)
      ) ?? null;
      const perms = channel ? channel.permissionsFor(member) : member.permissions;
      const lines = [
        `Effective permissions for ${member.user.tag}`,
        `In ${channel ? `#${channel.name}` : 'server'}:`,
        ...(perms?.toArray().map((p) => `  ✓ ${p}`) ?? []),
      ];
      return ok(lines.join('\n'), { userId: member.id, permissions: perms?.toArray() ?? [] });
    },
  });

  registerTool({
    name: 'discord.permission.explain',
    description:
      'Explain why a user can or cannot perform an action in a channel. E.g. "Why can\'t John send messages in #general?".',
    inputSchema: {
      type: 'object',
      properties: {
        user: { type: 'string', description: 'Member name/id/@mention.' },
        channel: { type: 'string', description: 'Channel name/id.' },
        permission: { type: 'string', description: 'Permission name, e.g. "SendMessages".' },
      },
      required: ['user', 'channel', 'permission'],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const member = await resolveMember(ctx, args.user as string);
      if (!member) return fail(`Member not found: ${args.user}`);
      const channel = findChannel(ctx.guild, args.channel as string);
      if (!channel) return fail(`Channel not found: ${args.channel}`);

      const permName = String(args.permission);
      const flag = (PermissionsBitField.Flags as Record<string, bigint>)[permName];
      if (flag === undefined) return fail(`Unknown permission: ${permName}`);

      const lines: string[] = [`Permission analysis for ${member.user.tag} in #${channel.name}:`];

      const isAdmin = member.permissions.has('Administrator');
      lines.push(`- Administrator: ${isAdmin ? 'YES (overrides everything)' : 'no'}`);

      if (!isAdmin) {
        const everyone = ctx.guild.roles.everyone;
        const everyoneAllow = everyone.permissions.has(flag);
        lines.push(`- @everyone role: ${everyoneAllow ? 'allows' : 'does not allow'} ${permName}`);

        const roleLines: string[] = [];
        for (const role of [...member.roles.cache.values()].sort((a, b) => b.position - a.position)) {
          roleLines.push(
            `- Role "${role.name}": ${role.permissions.has(flag) ? 'allows' : 'does not allow'} ${permName}`,
          );
        }
        lines.push(...roleLines);

        const memberOverwrite = channel.permissionOverwrites.cache.get(member.id);
        if (memberOverwrite) {
          lines.push(
            `- Member-specific overwrite: allow=[${memberOverwrite.allow.toArray().join(', ')}] deny=[${memberOverwrite.deny.toArray().join(', ')}]`,
          );
        }
        for (const role of member.roles.cache.values()) {
          const ow = channel.permissionOverwrites.cache.get(role.id);
          if (ow) {
            lines.push(
              `- Role "${role.name}" overwrite: allow=[${ow.allow.toArray().join(', ')}] deny=[${ow.deny.toArray().join(', ')}]`,
            );
          }
        }
      }

      const effective = channel.permissionsFor(member);
      const can = effective?.has(flag) ?? false;
      lines.push('');
      lines.push(`Result: ${member.user.tag} ${can ? 'CAN' : 'CANNOT'} ${permName} here.`);
      return ok(lines.join('\n'));
    },
  });

  registerTool({
    name: 'discord.permission.calculate',
    description:
      'Compute the effective permission for a role or member in a channel. Returns allow/deny bitfield summary.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Role or member name/id/@mention.' },
        channel: { type: 'string', description: 'Channel name/id.' },
      },
      required: ['target', 'channel'],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.channel as string);
      if (!channel) return fail(`Channel not found: ${args.channel}`);
      const role = findRole(ctx.guild, args.target as string);
      const member = role ? null : await resolveMember(ctx, args.target as string);
      const perms = role ? channel.permissionsFor(role) : channel.permissionsFor(member!);
      if (!perms) return fail('Could not compute permissions for target.');
      return ok(
        `Effective permissions for ${role?.name ?? member!.user.tag} in #${channel.name}:\n` +
          (perms.toArray().join(', ') || 'none'),
        { permissions: perms.toArray() },
      );
    },
  });

  registerTool({
    name: 'discord.permission.set',
    description: 'Set a permission overwrite (allow or deny) for a role/member on a channel.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string' },
        target: { type: 'string' },
        permission: { type: 'string', description: 'Permission name to set.' },
        value: { type: 'string', enum: ['allow', 'deny'] },
      },
      required: ['channel', 'target', 'permission', 'value'],
    },
    risk: 'HIGH',
    capability: 'MANAGE_PERMISSIONS',
    mutates: true,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.channel as string);
      if (!channel) return fail(`Channel not found: ${args.channel}`);
      if (!('permissionOverwrites' in channel)) return fail('Cannot set permissions here.');
      const targetId = toId(args.target as string);
      if (!targetId) return fail(`Target not found: ${args.target}`);

      const flag = (PermissionsBitField.Flags as Record<string, bigint>)[String(args.permission)];
      if (flag === undefined) return fail(`Unknown permission: ${args.permission}`);

      await (channel as unknown as {
        permissionOverwrites: {
          edit: (id: string, opts: { allow?: bigint[]; deny?: bigint[] }) => Promise<unknown>;
        };
      }).permissionOverwrites.edit(targetId, {
        allow: args.value === 'allow' ? [flag] : undefined,
        deny: args.value === 'deny' ? [flag] : undefined,
      });
      return ok(`Set ${args.permission} to ${args.value} for ${args.target} on #${channel.name}.`);
    },
  });

  registerTool({
    name: 'discord.permission.remove',
    description: 'Remove a permission overwrite (reset to inherit) for a role/member on a channel.',
    inputSchema: {
      type: 'object',
      properties: { channel: { type: 'string' }, target: { type: 'string' } },
      required: ['channel', 'target'],
    },
    risk: 'HIGH',
    capability: 'MANAGE_PERMISSIONS',
    mutates: true,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.channel as string);
      if (!channel) return fail(`Channel not found: ${args.channel}`);
      if (!('permissionOverwrites' in channel)) return fail('Cannot modify permissions here.');
      const targetId = toId(args.target as string);
      if (!targetId) return fail(`Target not found: ${args.target}`);
      await (channel as unknown as {
        permissionOverwrites: { delete: (id: string) => Promise<unknown> };
      }).permissionOverwrites.delete(targetId);
      return ok(`Removed permission overwrite for ${args.target} on #${channel.name}.`);
    },
  });
}

async function resolveMember(ctx: Parameters<ToolDescriptor['execute']>[0], nameOrId: string) {
  const id = toId(nameOrId);
  if (!id) return null;
  const byId = ctx.guild.members.cache.get(id) ?? (await ctx.guild.members.fetch(id).catch(() => null));
  if (byId) return byId;
  const lower = id.toLowerCase();
  return ctx.guild.members.cache.find((m) => m.user.username.toLowerCase() === lower) ?? null;
}
