import { PermissionFlagsBits } from 'discord.js';
import type { ToolDescriptor } from '../types.js';
import { registerTool } from '../registry.js';
import { ok, fail, findRole, toId } from './helpers.js';
import { formatRoles } from './format.js';

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
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const role = findRole(ctx.guild, args.name as string);
      if (!role) return fail(`Role not found: ${args.name}`);
      return ok(
        `Role ${role.name} (${role.id})\nColor: #${role.color.toString(16).padStart(6, '0')}\nPermissions: ${role.permissions.toArray().join(', ') || 'none'}\nMention: <@&${role.id}>`,
        { id: role.id, name: role.name, color: role.color },
      );
    },
  });

  registerTool({
    name: 'discord.role.create',
    description: 'Create a new role. Color should be a hex value like 0x3498db.',
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
    description: 'Edit a role: rename, recolor, or change permissions.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Current role name/id.' },
        new_name: { type: 'string' },
        color: { type: 'string' },
        permissions: { type: 'array', items: { type: 'string' } },
      },
      required: ['name'],
    },
    risk: 'HIGH',
    capability: 'MANAGE_ROLES',
    mutates: true,
    async execute(ctx, args) {
      const role = findRole(ctx.guild, args.name as string);
      if (!role) return fail(`Role not found: ${args.name}`);
      const update: Record<string, unknown> = {};
      if (args.new_name) update.name = String(args.new_name).slice(0, 100);
      if (args.color !== undefined) update.color = parseColor(args.color as string) ?? undefined;
      if (args.permissions !== undefined) {
        update.permissions = parsePermissions(args.permissions as string[] | undefined);
      }
      await role.edit(update as never);
      return ok(`Updated role "${role.name}".`);
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
      const member = await resolveMember(ctx, args.user as string);
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
      const member = await resolveMember(ctx, args.user as string);
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

async function resolveMember(ctx: Parameters<ToolDescriptor['execute']>[0], nameOrId: string) {
  const id = toId(nameOrId);
  if (!id) return null;
  const byId = ctx.guild.members.cache.get(id) ?? (await ctx.guild.members.fetch(id).catch(() => null));
  if (byId) return byId;
  const lower = id.toLowerCase();
  return (
    ctx.guild.members.cache.find((m) => m.user.username.toLowerCase() === lower) ?? null
  );
}
