import { PermissionFlagsBits, PermissionsBitField, type Role } from 'discord.js';
import type { ToolDescriptor } from '../types.js';
import { registerTool } from '../registry.js';
import { ok, fail, findRole, resolveMember } from './helpers.js';
import { formatRoles } from './format.js';

const PERMISSION_EXAMPLES =
  'Permission names, e.g. ViewChannel, SendMessages, ManageMessages, ManageChannels, ManageRoles, ManageGuild, ManageWebhooks, KickMembers, BanMembers, ModerateMembers, AddReactions, ReadMessageHistory, MentionEveryone, UseExternalEmojis, Connect, Speak, MuteMembers, DeafenMembers, MoveMembers, CreateInstantInvite, Administrator.';

export function registerRoleTools(): void {
  registerTool({
    name: 'discord.role.list',
    description: 'List all roles in the current server.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      return ok(formatRoles(ctx.guild));
    },
  });

  registerTool({
    name: 'discord.role.get',
    description: 'Get details about a single role by name or id.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Role name or id.' } },
      required: ['name'],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const role = findRole(ctx.guild, args.name as string);
      if (!role) return fail(`Role not found: ${args.name}`);
      return ok(formatRole(role), {
        id: role.id,
        name: role.name,
        color: role.color,
        permissions: role.permissions.toArray(),
      });
    },
  });

  registerTool({
    name: 'discord.role.get_permissions',
    description: 'List the permissions currently granted to a role.',
    inputSchema: {
      type: 'object',
      properties: { role: { type: 'string', description: 'Role name or id.' } },
      required: ['role'],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const role = findRole(ctx.guild, args.role as string);
      if (!role) return fail(`Role not found: ${args.role}`);
      const perms = role.permissions.toArray();
      return ok(
        perms.length ? `Role "${role.name}" permissions:\n${perms.map((p) => `  ✓ ${p}`).join('\n')}` : `Role "${role.name}" has no permissions.`,
        { id: role.id, name: role.name, permissions: perms },
      );
    },
  });

  registerTool({
    name: 'discord.role.create',
    description: `Create a new role. Color is a hex value like 0x3498db. ${PERMISSION_EXAMPLES}`,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Role name.' },
        color: { type: 'string', description: 'Hex color, e.g. "0x3498db" or "#3498db".' },
        hoist: { type: 'boolean', description: 'Display separately in the member list.' },
        mentionable: { type: 'boolean', description: 'Allow anyone to mention the role.' },
        permissions: { type: 'array', items: { type: 'string' }, description: 'Permission names to grant.' },
      },
      required: ['name'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_ROLES',
    mutates: true,
    async execute(ctx, args) {
      const color = parseColor(args.color as string | undefined);
      const permissions = parsePermissions(args.permissions as string[] | undefined);
      const role = await ctx.guild.roles.create({
        name: String(args.name).slice(0, 100),
        color: color ?? undefined,
        hoist: args.hoist !== undefined ? Boolean(args.hoist) : false,
        mentionable: args.mentionable !== undefined ? Boolean(args.mentionable) : false,
        permissions: permissions.length ? permissions : undefined,
      });
      return ok(`Created role "${role.name}" (${role.id}).`, { id: role.id, name: role.name });
    },
  });

  registerTool({
    name: 'discord.role.edit',
    description: `Edit a role: rename, recolor, replace all permissions, or add/remove specific permissions individually via allow/deny. ${PERMISSION_EXAMPLES}`,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Current role name or id.' },
        new_name: { type: 'string', description: 'New role name.' },
        color: { type: 'string', description: 'New hex color.' },
        permissions: { type: 'array', items: { type: 'string' }, description: 'Full replacement set of permission names.' },
        allow: { type: 'array', items: { type: 'string' }, description: 'Permissions to ADD on top of the current set.' },
        deny: { type: 'array', items: { type: 'string' }, description: 'Permissions to REMOVE from the current set.' },
      },
      required: ['name'],
    },
    risk: 'HIGH',
    capability: 'MANAGE_ROLES',
    mutates: true,
    async execute(ctx, args) {
      const role = findRole(ctx.guild, args.name as string);
      if (!role) return fail(`Role not found: ${args.name}`);
      if (role.managed) return fail(`Role "${role.name}" is managed by an integration and cannot be edited.`);

      const update: Record<string, unknown> = {};
      if (args.new_name) update.name = String(args.new_name).slice(0, 100);
      if (args.color !== undefined) update.color = parseColor(args.color as string) ?? undefined;
      if (args.permissions !== undefined) {
        update.permissions = parsePermissions(args.permissions as string[] | undefined);
      }
      if (Object.keys(update).length > 0) {
        await role.edit(update as never);
      }

      const allow = (args.allow as string[] | undefined) ?? [];
      const deny = (args.deny as string[] | undefined) ?? [];
      if (allow.length > 0 || deny.length > 0) {
        await applyPermissionDelta(role, allow, deny);
      }

      const summary = role.permissions.toArray().join(', ') || 'none';
      return ok(`Updated role "${role.name}". Permissions now: ${summary}`, {
        id: role.id,
        name: role.name,
        permissions: role.permissions.toArray(),
      });
    },
  });

  registerTool({
    name: 'discord.role.set_permissions',
    description: `Add and/or remove specific permissions on a role without touching the rest. ${PERMISSION_EXAMPLES}`,
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'Role name or id.' },
        allow: { type: 'array', items: { type: 'string' }, description: 'Permissions to grant.' },
        deny: { type: 'array', items: { type: 'string' }, description: 'Permissions to revoke.' },
      },
      required: ['role'],
    },
    risk: 'HIGH',
    capability: 'MANAGE_ROLES',
    mutates: true,
    async execute(ctx, args) {
      const role = findRole(ctx.guild, args.role as string);
      if (!role) return fail(`Role not found: ${args.role}`);
      if (role.managed) return fail(`Role "${role.name}" is managed and cannot be modified.`);

      const allow = (args.allow as string[] | undefined) ?? [];
      const deny = (args.deny as string[] | undefined) ?? [];
      if (allow.length === 0 && deny.length === 0) {
        return fail('Provide at least one of allow or deny.');
      }
      await applyPermissionDelta(role, allow, deny);

      const summary = role.permissions.toArray().join(', ') || 'none';
      return ok(`Updated permissions for role "${role.name}". Now: ${summary}`, {
        id: role.id,
        name: role.name,
        permissions: role.permissions.toArray(),
      });
    },
  });

  registerTool({
    name: 'discord.role.delete',
    description: 'Delete a role from the server.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    risk: 'HIGH',
    capability: 'MANAGE_ROLES',
    mutates: true,
    async execute(ctx, args) {
      const role = findRole(ctx.guild, args.name as string);
      if (!role) return fail(`Role not found: ${args.name}`);
      if (role.managed || role.id === ctx.guild.roles.everyone.id) {
        return fail(`Role "${role.name}" cannot be deleted.`);
      }
      await role.delete();
      return ok(`Deleted role "${role.name}".`);
    },
  });

  registerTool({
    name: 'discord.role.assign',
    description: 'Assign a role to a member.',
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'Role name/id.' },
        user: { type: 'string', description: 'Member name/id/@mention.' },
      },
      required: ['role', 'user'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_ROLES',
    mutates: true,
    async execute(ctx, args) {
      const role = findRole(ctx.guild, args.role as string);
      const member = await resolveMember(ctx.guild, args.user as string);
      if (!role) return fail(`Role not found: ${args.role}`);
      if (!member) return fail(`Member not found: ${args.user}`);
      await member.roles.add(role);
      return ok(`Assigned role "${role.name}" to ${member.user.tag}.`);
    },
  });

  registerTool({
    name: 'discord.role.remove',
    description: 'Remove a role from a member.',
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string' },
        user: { type: 'string' },
      },
      required: ['role', 'user'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_ROLES',
    mutates: true,
    async execute(ctx, args) {
      const role = findRole(ctx.guild, args.role as string);
      const member = await resolveMember(ctx.guild, args.user as string);
      if (!role) return fail(`Role not found: ${args.role}`);
      if (!member) return fail(`Member not found: ${args.user}`);
      await member.roles.remove(role);
      return ok(`Removed role "${role.name}" from ${member.user.tag}.`);
    },
  });

  registerTool({
    name: 'discord.role.move',
    description: 'Move a role above or below another role in the hierarchy.',
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'Role name/id to move.' },
        position: { type: 'integer', description: 'Target position.' },
      },
      required: ['role', 'position'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_ROLES',
    mutates: true,
    async execute(ctx, args) {
      const role = findRole(ctx.guild, args.role as string);
      if (!role) return fail(`Role not found: ${args.role}`);
      await role.setPosition(Number(args.position) || 0);
      return ok(`Moved role "${role.name}" to position ${args.position}.`);
    },
  });

  registerTool({
    name: 'discord.role.compare',
    description: 'Compare two roles to determine which is higher in the hierarchy.',
    inputSchema: {
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'string' } },
      required: ['a', 'b'],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const a = findRole(ctx.guild, args.a as string);
      const b = findRole(ctx.guild, args.b as string);
      if (!a) return fail(`Role not found: ${args.a}`);
      if (!b) return fail(`Role not found: ${args.b}`);
      if (a.position === b.position) return ok(`"${a.name}" and "${b.name}" are at the same level.`);
      const higher = a.position > b.position ? a : b;
      const lower = higher === a ? b : a;
      return ok(`"${higher.name}" is higher than "${lower.name}".`);
    },
  });
}

function formatRole(role: Role): string {
  return [
    `Role ${role.name} (${role.id})`,
    `Color: #${role.color.toString(16).padStart(6, '0')}`,
    `Hoisted: ${role.hoist ? 'yes' : 'no'}`,
    `Mentionable: ${role.mentionable ? 'yes' : 'no'}`,
    `Managed: ${role.managed ? 'yes' : 'no'}`,
    `Permissions: ${role.permissions.toArray().join(', ') || 'none'}`,
    `Mention: <@&${role.id}>`,
  ].join('\n');
}

function parseColor(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const hex = raw.replace(/^#/, '').replace(/^0x/i, '');
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return parseInt(hex, 16);
  return undefined;
}

function parsePermissions(names: string[] | undefined): bigint[] {
  if (!names || names.length === 0) return [];
  const bits: bigint[] = [];
  for (const n of names) {
    const flag = (PermissionFlagsBits as Record<string, bigint>)[n];
    if (flag !== undefined) bits.push(flag);
  }
  return bits;
}

async function applyPermissionDelta(role: Role, allow: string[], deny: string[]): Promise<void> {
  const bits = new PermissionsBitField(role.permissions.bitfield);
  if (allow.length > 0) bits.add(parsePermissions(allow));
  if (deny.length > 0) bits.remove(parsePermissions(deny));
  await role.setPermissions(bits);
}
