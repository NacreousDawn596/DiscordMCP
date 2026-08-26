import { ChannelType, PermissionsBitField } from 'discord.js';
import type { ToolDescriptor } from '../types.js';
import { registerTool } from '../registry.js';
import { ok, fail, findChannel, findCategory, findRole, mapChannelType, toId, clampInt, setOverwrite } from './helpers.js';
import { formatGuild } from './format.js';

// ---------------------------------------------------------------------------
// Idempotent helpers (shared by ensure_* tools and the transformation engine).
// ---------------------------------------------------------------------------

function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

async function ensureCategory(ctx: Parameters<ToolDescriptor['execute']>[0], name: string) {
  const existing = ctx.guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === nameKey(name),
  );
  if (existing) return { created: false, id: existing.id, name: existing.name };
  const cat = await ctx.guild.channels.create({ name: name.slice(0, 100), type: ChannelType.GuildCategory });
  return { created: true, id: cat.id, name: cat.name };
}

async function ensureChannel(
  ctx: Parameters<ToolDescriptor['execute']>[0],
  name: string,
  type: ChannelType,
  parentId?: string,
) {
  const existing = ctx.guild.channels.cache.find(
    (c) =>
      c.name.toLowerCase() === nameKey(name) &&
      c.type === type &&
      (parentId ? c.parentId === parentId : !c.parentId),
  );
  if (existing) return { created: false, id: existing.id, name: existing.name };

  const data: Record<string, unknown> = { name: nameKey(name).slice(0, 100), type };
  if (parentId && type !== ChannelType.GuildCategory) data.parent = parentId;
  const channel = await ctx.guild.channels.create(data as never);
  return { created: true, id: channel.id, name: channel.name };
}

async function ensureRole(
  ctx: Parameters<ToolDescriptor['execute']>[0],
  name: string,
  opts: { color?: number; permissions?: bigint[] } = {},
) {
  const existing = ctx.guild.roles.cache.find((r) => r.name.toLowerCase() === name.toLowerCase());
  if (existing) return { created: false, id: existing.id, name: existing.name };
  const role = await ctx.guild.roles.create({
    name: name.slice(0, 100),
    color: opts.color,
    permissions: opts.permissions?.length ? opts.permissions : undefined,
  });
  return { created: true, id: role.id, name: role.name };
}

function bitsFromNames(names: string[]): bigint[] {
  const out: bigint[] = [];
  for (const n of names) {
    const flag = (PermissionsBitField.Flags as Record<string, bigint>)[n];
    if (flag !== undefined) out.push(flag);
  }
  return out;
}

interface StructureStepResult {
  action: string;
  name: string;
  result: 'created' | 'exists' | 'updated';
}

export function registerServerTools(): void {
  registerTool({
    name: 'discord.server.ensure_channel',
    description: 'Idempotently create a channel (returns "already exists" if present).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        type: { type: 'string', enum: ['text', 'voice', 'announcement', 'forum', 'stage'] },
        category: { type: 'string' },
      },
      required: ['name'],
    },
    risk: 'LOW',
    capability: 'MANAGE_CHANNELS',
    mutates: true,
    async execute(ctx, args) {
      const parent = args.category ? findCategory(ctx.guild, args.category as string) : undefined;
      const res = await ensureChannel(ctx, String(args.name), mapChannelType(args.type as string | undefined), parent?.id);
      return ok(res.created ? `Created #${res.name}.` : `#${res.name} already exists.`, res);
    },
  });

  registerTool({
    name: 'discord.server.ensure_category',
    description: 'Idempotently create a category.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
    risk: 'LOW',
    capability: 'MANAGE_CHANNELS',
    mutates: true,
    async execute(ctx, args) {
      const res = await ensureCategory(ctx, String(args.name));
      return ok(res.created ? `Created category "${res.name}".` : `Category "${res.name}" already exists.`, res);
    },
  });

  registerTool({
    name: 'discord.server.ensure_role',
    description: 'Idempotently create a role (optionally with color and permissions).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        color: { type: 'string' },
        permissions: { type: 'array', items: { type: 'string' } },
      },
      required: ['name'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_ROLES',
    mutates: true,
    async execute(ctx, args) {
      const color = args.color ? parseHex(args.color as string) : undefined;
      const perms = args.permissions ? bitsFromNames(args.permissions as string[]) : undefined;
      const res = await ensureRole(ctx, String(args.name), { color, permissions: perms });
      return ok(res.created ? `Created role "${res.name}".` : `Role "${res.name}" already exists.`, res);
    },
  });

  registerTool({
    name: 'discord.server.ensure_permission',
    description:
      'Idempotently set a permission overwrite on a channel (only writes when the desired state differs).',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string' },
        target: { type: 'string' },
        allow: { type: 'array', items: { type: 'string' } },
        deny: { type: 'array', items: { type: 'string' } },
      },
      required: ['channel', 'target'],
    },
    risk: 'HIGH',
    capability: 'MANAGE_PERMISSIONS',
    mutates: true,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.channel as string);
      if (!channel || !('permissionOverwrites' in channel)) return fail(`Channel not found: ${args.channel}`);
      const targetId = toId(args.target as string);
      if (!targetId) return fail(`Target not found: ${args.target}`);

      const allowNames = (args.allow as string[]) ?? [];
      const denyNames = (args.deny as string[]) ?? [];
      const allow = bitsFromNames(allowNames);
      const deny = bitsFromNames(denyNames);

      const existing = channel.permissionOverwrites.cache.get(targetId);
      const allowMatch = existing && bigintSetEquals(existing.allow.bitfield, allow);
      const denyMatch = existing && bigintSetEquals(existing.deny.bitfield, deny);

      if (existing && allowMatch && denyMatch) {
        return ok(`Permissions on #${channel.name} already match — no change needed.`);
      }

      await setOverwrite(channel, targetId, allowNames, denyNames);
      return ok(`Set permissions on #${channel.name}.`);
    },
  });

  registerTool({
    name: 'discord.server.ensure_structure',
    description:
      'Idempotently ensure a full server structure exists: categories with nested channels, plus roles. Returns per-item results.',
    inputSchema: {
      type: 'object',
      properties: {
        structure: {
          type: 'object',
          description: 'Declarative structure: { categories: [{ name, channels: [{ name, type }] }], roles: [{ name, color?, permissions? }] }',
          properties: {
            categories: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  channels: {
                    type: 'array',
                    items: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string' } } },
                  },
                },
              },
            },
            roles: {
              type: 'array',
              items: { type: 'object', properties: { name: { type: 'string' }, color: { type: 'string' }, permissions: { type: 'array', items: { type: 'string' } } } },
            },
          },
        },
      },
      required: ['structure'],
    },
    risk: 'HIGH',
    capability: 'MANAGE_CHANNELS',
    mutates: true,
    async execute(ctx, args) {
      const structure = args.structure as {
        categories?: Array<{ name: string; channels?: Array<{ name: string; type?: string }> }>;
        roles?: Array<{ name: string; color?: string; permissions?: string[] }>;
      };

      const results: StructureStepResult[] = [];

      if (structure.categories) {
        for (const cat of structure.categories) {
          const c = await ensureCategory(ctx, cat.name);
          results.push({ action: 'category', name: cat.name, result: c.created ? 'created' : 'exists' });
          if (cat.channels) {
            for (const ch of cat.channels) {
              const r = await ensureChannel(ctx, ch.name, mapChannelType(ch.type), c.id);
              results.push({ action: 'channel', name: ch.name, result: r.created ? 'created' : 'exists' });
            }
          }
        }
      }

      if (structure.roles) {
        for (const role of structure.roles) {
          const r = await ensureRole(ctx, role.name, {
            color: role.color ? parseHex(role.color) : undefined,
            permissions: role.permissions?.length ? bitsFromNames(role.permissions) : undefined,
          });
          results.push({ action: 'role', name: role.name, result: r.created ? 'created' : 'exists' });
        }
      }

      const created = results.filter((r) => r.result === 'created');
      const lines = results.map((r) => `- [${r.action}] ${r.name}: ${r.result}`);
      return ok(`Ensured structure (${created.length} created, ${results.length - created.length} already present):\n${lines.join('\n')}`, { results });
    },
  });

  registerTool({
    name: 'discord.server.apply_plan',
    description:
      'Execute a validated transformation plan consisting of idempotent steps (create_category, create_channel, create_role, set_permissions).',
    inputSchema: {
      type: 'object',
      properties: {
        plan: {
          type: 'object',
          properties: {
            goal: { type: 'string' },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  action: { type: 'string', enum: ['create_category', 'create_channel', 'create_role', 'set_permissions'] },
                  name: { type: 'string' },
                  category: { type: 'string' },
                  type: { type: 'string' },
                  target: { type: 'string' },
                  channel: { type: 'string' },
                  allow: { type: 'array', items: { type: 'string' } },
                  deny: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
      },
      required: ['plan'],
    },
    risk: 'HIGH',
    capability: 'MANAGE_CHANNELS',
    mutates: true,
    async execute(ctx, args) {
      const plan = args.plan as {
        goal?: string;
        steps?: Array<Record<string, unknown>>;
      };
      const steps = plan.steps ?? [];
      const results: string[] = [];

      for (const step of steps) {
        const action = String(step.action);
        switch (action) {
          case 'create_category': {
            const r = await ensureCategory(ctx, String(step.name));
            results.push(`${r.created ? '✓' : '•'} category "${r.name}" ${r.created ? 'created' : 'exists'}`);
            break;
          }
          case 'create_channel': {
            const parent = step.category ? findCategory(ctx.guild, String(step.category)) : undefined;
            const r = await ensureChannel(ctx, String(step.name), mapChannelType(step.type as string | undefined), parent?.id);
            results.push(`${r.created ? '✓' : '•'} #${r.name} ${r.created ? 'created' : 'exists'}`);
            break;
          }
          case 'create_role': {
            const r = await ensureRole(ctx, String(step.name));
            results.push(`${r.created ? '✓' : '•'} role "${r.name}" ${r.created ? 'created' : 'exists'}`);
            break;
          }
          case 'set_permissions': {
            const channel = findChannel(ctx.guild, String(step.channel));
            const targetId = toId(step.target as string);
            if (!channel || !targetId) {
              results.push(`✗ set_permissions: missing channel or target`);
              break;
            }
            const allowNames = (step.allow as string[]) ?? [];
            const denyNames = (step.deny as string[]) ?? [];
            await setOverwrite(channel, targetId, allowNames, denyNames);
            results.push(`✓ permissions set on #${channel.name}`);
            break;
          }
          default:
            results.push(`✗ unknown action: ${action}`);
        }
      }

      return ok(`Plan applied:\n${results.join('\n')}`, { goal: plan.goal, results });
    },
  });

  registerTool({
    name: 'discord.server.recommend',
    description: 'Inspect the server and return recommendations without modifying anything.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      const recs: string[] = [];
      const categories = ctx.guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory);
      const orphaned = ctx.guild.channels.cache.filter(
        (c) => !c.parent && c.type !== ChannelType.GuildCategory,
      );
      const textChannels = ctx.guild.channels.cache.filter((c) => c.type === ChannelType.GuildText);

      if (categories.size === 0 && textChannels.size > 3) {
        recs.push('Group channels into categories (e.g. Information, Community, Staff).');
      }
      if (orphaned.size > 3) {
        recs.push(`Move ${orphaned.size} uncategorized channels into appropriate categories.`);
      }
      if (ctx.guild.roles.everyone.permissions.has('Administrator')) {
        recs.push('Remove Administrator from @everyone and use a dedicated admin role instead.');
      }
      if (!ctx.guild.roles.cache.find((r) => r.name.toLowerCase().includes('moderator') || r.name.toLowerCase().includes('mod'))) {
        recs.push('Create a Moderator role with limited moderation permissions.');
      }
      if (!textChannels.find((c) => c.name === 'announcements' || c.name === 'rules')) {
        recs.push('Add #rules and #announcements channels for onboarding.');
      }

      const lines = recs.length
        ? recs.map((r, i) => `${i + 1}. ${r}`).join('\n')
        : 'The server looks well organized — no recommendations.';
      return ok(lines);
    },
  });

  registerTool({
    name: 'discord.server.configure_permissions',
    description:
      'Apply permission rules to a category and its channels (e.g. make a role read-only).',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        target: { type: 'string' },
        allow: { type: 'array', items: { type: 'string' } },
        deny: { type: 'array', items: { type: 'string' } },
        sync: { type: 'boolean', description: 'Apply to all child channels (default true).' },
      },
      required: ['category', 'target'],
    },
    risk: 'HIGH',
    capability: 'MANAGE_PERMISSIONS',
    mutates: true,
    async execute(ctx, args) {
      const cat = findCategory(ctx.guild, args.category as string);
      if (!cat) return fail(`Category not found: ${args.category}`);
      const targetId = toId(args.target as string);
      if (!targetId) return fail(`Target not found: ${args.target}`);

      const allowNames = (args.allow as string[]) ?? [];
      const denyNames = (args.deny as string[]) ?? [];
      const sync = args.sync !== false;

      await setOverwrite(cat, targetId, allowNames, denyNames);

      let applied = 1;
      if (sync) {
        const children = ctx.guild.channels.cache.filter(
          (c): c is import('discord.js').NonThreadGuildBasedChannel =>
            !c.isThread() && c.parentId === cat.id,
        );
        for (const child of children.values()) {
          await setOverwrite(child, targetId, allowNames, denyNames);
          applied++;
        }
      }

      return ok(`Configured permissions for ${args.target} on "${cat.name}"${sync ? ` and ${applied - 1} child channels` : ''}.`);
    },
  });

  // -------------------------------------------------------------------------
  // Bulk operations
  // -------------------------------------------------------------------------

  registerTool({
    name: 'discord.bulk.create_channels',
    description: 'Create multiple channels. Requires dry_run and max_items.',
    inputSchema: {
      type: 'object',
      properties: {
        channels: {
          type: 'array',
          items: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string' }, category: { type: 'string' } } },
        },
        dry_run: { type: 'boolean', description: 'Preview without creating (default true).' },
        max_items: { type: 'integer', description: 'Maximum items to create (default 25).' },
      },
      required: ['channels'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_CHANNELS',
    mutates: true,
    async execute(ctx, args) {
      const dryRun = args.dry_run !== false;
      const maxItems = clampInt(args.max_items, 1, 100, 25);
      const list = (args.channels as Array<{ name: string; type?: string; category?: string }>).slice(0, maxItems);
      const results: string[] = [];

      for (const ch of list) {
        const parent = ch.category ? findCategory(ctx.guild, ch.category) : undefined;
        if (dryRun) {
          results.push(`[dry-run] would create #${nameKey(ch.name)} (${ch.type ?? 'text'})`);
          continue;
        }
        const r = await ensureChannel(ctx, ch.name, mapChannelType(ch.type), parent?.id);
        results.push(`${r.created ? '✓' : '•'} #${r.name} ${r.created ? 'created' : 'exists'}`);
      }

      return ok(`${dryRun ? '[dry-run] ' : ''}${results.join('\n')}`, { dryRun, count: list.length });
    },
  });

  registerTool({
    name: 'discord.bulk.create_roles',
    description: 'Create multiple roles.',
    inputSchema: {
      type: 'object',
      properties: {
        roles: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, color: { type: 'string' } } } },
        dry_run: { type: 'boolean' },
        max_items: { type: 'integer' },
      },
      required: ['roles'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_ROLES',
    mutates: true,
    async execute(ctx, args) {
      const dryRun = args.dry_run !== false;
      const maxItems = clampInt(args.max_items, 1, 100, 25);
      const list = (args.roles as Array<{ name: string; color?: string }>).slice(0, maxItems);
      const results: string[] = [];
      for (const role of list) {
        if (dryRun) {
          results.push(`[dry-run] would create role "${role.name}"`);
          continue;
        }
        const r = await ensureRole(ctx, role.name, { color: role.color ? parseHex(role.color) : undefined });
        results.push(`${r.created ? '✓' : '•'} role "${r.name}" ${r.created ? 'created' : 'exists'}`);
      }
      return ok(`${dryRun ? '[dry-run] ' : ''}${results.join('\n')}`, { dryRun, count: list.length });
    },
  });

  registerTool({
    name: 'discord.bulk.assign_roles',
    description: 'Assign a role to multiple members.',
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string' },
        users: { type: 'array', items: { type: 'string' } },
        dry_run: { type: 'boolean' },
        max_items: { type: 'integer' },
      },
      required: ['role', 'users'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_ROLES',
    mutates: true,
    async execute(ctx, args) {
      const role = findRole(ctx.guild, args.role as string);
      if (!role) return fail(`Role not found: ${args.role}`);
      const dryRun = args.dry_run !== false;
      const maxItems = clampInt(args.max_items, 1, 100, 25);
      const users = (args.users as string[]).slice(0, maxItems);
      const results: string[] = [];
      for (const u of users) {
        const member = await resolveMember(ctx, u);
        if (!member) {
          results.push(`✗ ${u}: not found`);
          continue;
        }
        if (!dryRun) await member.roles.add(role);
        results.push(`${dryRun ? '[dry-run] ' : '✓'} ${member.user.tag}`);
      }
      return ok(`Role "${role.name}":\n${results.join('\n')}`, { dryRun, count: users.length });
    },
  });

  registerTool({
    name: 'discord.bulk.remove_roles',
    description: 'Remove a role from multiple members.',
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string' },
        users: { type: 'array', items: { type: 'string' } },
        dry_run: { type: 'boolean' },
        max_items: { type: 'integer' },
      },
      required: ['role', 'users'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_ROLES',
    mutates: true,
    async execute(ctx, args) {
      const role = findRole(ctx.guild, args.role as string);
      if (!role) return fail(`Role not found: ${args.role}`);
      const dryRun = args.dry_run !== false;
      const maxItems = clampInt(args.max_items, 1, 100, 25);
      const users = (args.users as string[]).slice(0, maxItems);
      const results: string[] = [];
      for (const u of users) {
        const member = await resolveMember(ctx, u);
        if (!member) {
          results.push(`✗ ${u}: not found`);
          continue;
        }
        if (!dryRun) await member.roles.remove(role);
        results.push(`${dryRun ? '[dry-run] ' : '✓'} ${member.user.tag}`);
      }
      return ok(`Role "${role.name}":\n${results.join('\n')}`, { dryRun, count: users.length });
    },
  });

  registerTool({
    name: 'discord.bulk.update_permissions',
    description: 'Update permissions on multiple channels.',
    inputSchema: {
      type: 'object',
      properties: {
        channels: { type: 'array', items: { type: 'string' } },
        target: { type: 'string' },
        allow: { type: 'array', items: { type: 'string' } },
        deny: { type: 'array', items: { type: 'string' } },
        dry_run: { type: 'boolean' },
        max_items: { type: 'integer' },
      },
      required: ['channels', 'target'],
    },
    risk: 'HIGH',
    capability: 'MANAGE_PERMISSIONS',
    mutates: true,
    async execute(ctx, args) {
      const targetId = toId(args.target as string);
      if (!targetId) return fail(`Target not found: ${args.target}`);
      const allowNames = (args.allow as string[]) ?? [];
      const denyNames = (args.deny as string[]) ?? [];
      const dryRun = args.dry_run !== false;
      const maxItems = clampInt(args.max_items, 1, 100, 25);
      const channels = (args.channels as string[]).slice(0, maxItems);
      const results: string[] = [];
      for (const name of channels) {
        const channel = findChannel(ctx.guild, name);
        if (!channel) {
          results.push(`✗ ${name}: not found`);
          continue;
        }
        if (!dryRun) {
          await setOverwrite(channel, targetId, allowNames, denyNames);
        }
        results.push(`${dryRun ? '[dry-run] ' : '✓'} #${channel.name}`);
      }
      return ok(results.join('\n'), { dryRun, count: channels.length });
    },
  });

  registerTool({
    name: 'discord.bulk.delete_messages',
    description: 'Bulk delete messages from a channel. Always requires dry_run unless explicitly set false.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string' },
        count: { type: 'integer' },
        dry_run: { type: 'boolean', description: 'Preview count without deleting (default true).' },
      },
      required: ['channel', 'count'],
    },
    risk: 'DESTRUCTIVE',
    capability: 'MANAGE_MESSAGES',
    isModerationAction: true,
    mutates: true,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.channel as string);
      if (!channel || !('bulkDelete' in channel)) return fail('Channel not found.');
      const count = clampInt(args.count, 2, 100, 10);
      const dryRun = args.dry_run !== false;
      if (dryRun) {
        return ok(`[dry-run] would delete up to ${count} messages from #${channel.name}.`);
      }
      const deleted = await (channel as unknown as {
        bulkDelete: (n: number, filterOld?: boolean) => Promise<{ size: number }>;
      }).bulkDelete(count, true);
      return ok(`Deleted ${deleted.size} messages from #${channel.name}.`);
    },
  });
}

function parseHex(raw: string): number | undefined {
  const hex = raw.replace(/^#/, '').replace(/^0x/i, '');
  return /^[0-9a-fA-F]{6}$/.test(hex) ? parseInt(hex, 16) : undefined;
}

function bigintSetEquals(bitfield: bigint, bits: bigint[]): boolean {
  const have = bits.filter((b) => (bitfield & b) === b);
  return have.length === bits.length && (bits.length === 0 || (bitfield & bits.reduce((a, b) => a | b, 0n)) === bits.reduce((a, b) => a | b, 0n));
}

async function resolveMember(ctx: Parameters<ToolDescriptor['execute']>[0], nameOrId: string) {
  const id = toId(nameOrId);
  if (!id) return null;
  const byId = ctx.guild.members.cache.get(id) ?? (await ctx.guild.members.fetch(id).catch(() => null));
  if (byId) return byId;
  const lower = id.toLowerCase();
  return ctx.guild.members.cache.find((m) => m.user.username.toLowerCase() === lower) ?? null;
}

// Re-export for potential reuse.
export { formatGuild };
