import { ChannelType, type NonThreadGuildBasedChannel } from 'discord.js';
import type { ToolDescriptor } from '../types.js';
import { registerTool } from '../registry.js';
import { ok, fail, findChannel, findCategory, mapChannelType, clampInt, toId, setOverwrite } from './helpers.js';
import { formatChannelSummary } from './format.js';

export function registerChannelTools(): void {
  registerTool({
    name: 'discord.channel.get',
    description: 'Get information about a single channel by name or id.',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Channel name or id.' } }, required: ['name'] },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.name as string);
      if (!channel) return fail(`Channel not found: ${args.name}`);
      return ok(formatChannelSummary(channel));
    },
  });

  registerTool({
    name: 'discord.channel.list',
    description: 'Alias for listing channels in the current server.',
    inputSchema: { type: 'object', properties: { category: { type: 'string' } }, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      let channels = [...ctx.guild.channels.cache.values()].filter(
        (c): c is NonThreadGuildBasedChannel => !c.isThread(),
      );
      if (args.category) {
        const cat = findCategory(ctx.guild, args.category as string);
        channels = channels.filter((c) => c.parentId === cat?.id);
      }
      const lines = channels
        .sort((a, b) => a.position - b.position)
        .map((c) => formatChannelSummary(c));
      return ok(lines.length ? lines.join('\n') : 'No channels.');
    },
  });

  registerTool({
    name: 'discord.channel.create',
    description:
      'Create a channel in the current server. Supports text, voice, announcement, forum, and stage channel types.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Channel name (lowercase, dashes).' },
        type: { type: 'string', enum: ['text', 'voice', 'announcement', 'forum', 'stage'], description: 'Channel type (default text).' },
        category: { type: 'string', description: 'Parent category name or id.' },
        topic: { type: 'string', description: 'Channel topic (text/announcement only).' },
        nsfw: { type: 'boolean', description: 'Whether the channel is NSFW.' },
        slowmode: { type: 'integer', description: 'Slowmode in seconds (0 to disable).' },
      },
      required: ['name'],
    },
    risk: 'LOW',
    capability: 'MANAGE_CHANNELS',
    mutates: true,
    async execute(ctx, args) {
      const name = String(args.name).toLowerCase().replace(/\s+/g, '-').slice(0, 100);
      const type = mapChannelType(args.type as string | undefined);
      const parent = args.category ? findCategory(ctx.guild, args.category as string) : undefined;

      const data: Record<string, unknown> = { name, type };
      if (parent && type !== ChannelType.GuildCategory) data.parent = parent.id;
      if (args.topic !== undefined) data.topic = String(args.topic);
      if (args.nsfw !== undefined) data.nsfw = Boolean(args.nsfw);
      if (args.slowmode !== undefined && type === ChannelType.GuildText) {
        data.rateLimitPerUser = clampInt(args.slowmode, 0, 21600, 0);
      }

      const channel = await ctx.guild.channels.create(data as never);
      return ok(`Created channel #${channel.name} (${channel.id}).`, { id: channel.id, name: channel.name });
    },
  });

  registerTool({
    name: 'discord.channel.create_category',
    description: 'Create a category in the current server.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Category name.' } },
      required: ['name'],
    },
    risk: 'LOW',
    capability: 'MANAGE_CHANNELS',
    mutates: true,
    async execute(ctx, args) {
      const name = String(args.name).slice(0, 100);
      const cat = await ctx.guild.channels.create({ name, type: ChannelType.GuildCategory });
      return ok(`Created category "${cat.name}" (${cat.id}).`, { id: cat.id, name: cat.name });
    },
  });

  registerTool({
    name: 'discord.channel.edit',
    description: 'Edit a channel: rename it, change topic, or move it to a category.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Current channel name or id.' },
        new_name: { type: 'string', description: 'New channel name.' },
        topic: { type: 'string', description: 'New topic.' },
        category: { type: 'string', description: 'New parent category name/id.' },
      },
      required: ['name'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_CHANNELS',
    mutates: true,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.name as string);
      if (!channel) return fail(`Channel not found: ${args.name}`);

      if (args.new_name && 'setName' in channel) {
        await (channel as NonThreadGuildBasedChannel).setName(String(args.new_name).slice(0, 100));
      }
      if (args.topic !== undefined && 'setTopic' in channel) {
        await (channel as NonThreadGuildBasedChannel & { setTopic(t: string): Promise<unknown> }).setTopic(String(args.topic));
      }
      if (args.category) {
        const cat = findCategory(ctx.guild, args.category as string);
        if (cat && 'setParent' in channel) {
          await (channel as NonThreadGuildBasedChannel).setParent(cat.id);
        }
      }
      return ok(`Updated channel #${channel.name}.`);
    },
  });

  registerTool({
    name: 'discord.channel.delete',
    description: 'Delete a channel (or category) from the current server. Destructive.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Channel or category name/id.' } },
      required: ['name'],
    },
    risk: 'DESTRUCTIVE',
    capability: 'MANAGE_CHANNELS',
    mutates: true,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.name as string);
      if (!channel) return fail(`Channel not found: ${args.name}`);
      const display = channel.name;
      await channel.delete();
      return ok(`Deleted ${channel.type === ChannelType.GuildCategory ? 'category' : 'channel'} "${display}".`);
    },
  });

  registerTool({
    name: 'discord.channel.move',
    description: 'Move a channel into a category (or to top level if category omitted).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Channel name/id.' },
        category: { type: 'string', description: 'Target category name/id.' },
      },
      required: ['name'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_CHANNELS',
    mutates: true,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.name as string);
      if (!channel) return fail(`Channel not found: ${args.name}`);
      if (!('setParent' in channel)) {
        return fail('Cannot move this channel type.');
      }
      const cat = args.category ? findCategory(ctx.guild, args.category as string) : undefined;
      await (channel as NonThreadGuildBasedChannel).setParent(cat ? cat.id : null);
      return ok(`Moved #${channel.name} to ${cat ? `"${cat.name}"` : 'top level'}.`);
    },
  });

  registerTool({
    name: 'discord.channel.clone',
    description: 'Clone a channel (copies name, topic, and permission overwrites).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Source channel name/id.' },
        new_name: { type: 'string', description: 'Optional new name for the clone.' },
      },
      required: ['name'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_CHANNELS',
    mutates: true,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.name as string);
      if (!channel) return fail(`Channel not found: ${args.name}`);
      const clone = await channel.clone({ name: args.new_name ? String(args.new_name) : undefined });
      return ok(`Cloned #${channel.name} -> #${clone.name} (${clone.id}).`);
    },
  });

  registerTool({
    name: 'discord.channel.set_category',
    description: 'Set the parent category of a channel.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Channel name/id.' },
        category: { type: 'string', description: 'Category name/id.' },
      },
      required: ['name', 'category'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_CHANNELS',
    mutates: true,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.name as string);
      const cat = findCategory(ctx.guild, args.category as string);
      if (!channel) return fail(`Channel not found: ${args.name}`);
      if (!cat) return fail(`Category not found: ${args.category}`);
      if (!('setParent' in channel)) return fail('Cannot set category on this channel.');
      await (channel as NonThreadGuildBasedChannel).setParent(cat.id);
      return ok(`Set #${channel.name} category to "${cat.name}".`);
    },
  });

  registerTool({
    name: 'discord.channel.set_permissions',
    description:
      'Set permission overwrites for a role or member on a channel. allow/deny are arrays of permission names (e.g. "ViewChannel", "SendMessages").',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name/id.' },
        target: { type: 'string', description: 'Role or member name/id/@mention.' },
        allow: { type: 'array', items: { type: 'string' }, description: 'Permissions to allow.' },
        deny: { type: 'array', items: { type: 'string' }, description: 'Permissions to deny.' },
      },
      required: ['channel', 'target'],
    },
    risk: 'HIGH',
    capability: 'MANAGE_PERMISSIONS',
    mutates: true,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.channel as string);
      if (!channel) return fail(`Channel not found: ${args.channel}`);
      const targetId = toId(args.target as string);
      if (!targetId) return fail(`Target not found: ${args.target}`);

      await setOverwrite(
        channel,
        targetId,
        (args.allow as string[]) ?? [],
        (args.deny as string[]) ?? [],
      );
      return ok(`Updated permissions on #${channel.name}.`);
    },
  });

  registerTool({
    name: 'discord.channel.get_permissions',
    description: 'Read the permission overwrites on a channel.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Channel name/id.' } },
      required: ['name'],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.name as string);
      if (!channel) return fail(`Channel not found: ${args.name}`);
      const lines: string[] = [];
      for (const [, overwrite] of channel.permissionOverwrites.cache) {
        const targetName =
          ctx.guild.roles.cache.get(overwrite.id)?.name ??
          (await ctx.guild.members.fetch(overwrite.id).catch(() => null))?.user.tag ??
          overwrite.id;
        lines.push(
          `- ${overwrite.type === 0 ? 'role' : 'member'} ${targetName}: allow=[${overwrite.allow.toArray().join(', ')}] deny=[${overwrite.deny.toArray().join(', ')}]`,
        );
      }
      return ok(lines.length ? lines.join('\n') : 'No explicit overwrites.');
    },
  });

  registerTool({
    name: 'discord.channel.set_topic',
    description: 'Set the topic of a text/announcement channel.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, topic: { type: 'string' } },
      required: ['name', 'topic'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_CHANNELS',
    mutates: true,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.name as string);
      if (!channel) return fail(`Channel not found: ${args.name}`);
      if (!('setTopic' in channel)) return fail('Cannot set topic on this channel.');
      await (channel as unknown as { setTopic(t: string): Promise<unknown> }).setTopic(String(args.topic));
      return ok(`Set topic on #${channel.name}.`);
    },
  });

  registerTool({
    name: 'discord.channel.set_slowmode',
    description: 'Set slowmode (seconds) on a text channel.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, seconds: { type: 'integer' } },
      required: ['name', 'seconds'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_CHANNELS',
    mutates: true,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.name as string);
      if (!channel) return fail(`Channel not found: ${args.name}`);
      if (!('setRateLimitPerUser' in channel)) return fail('Cannot set slowmode on this channel.');
      await (channel as unknown as { setRateLimitPerUser(n: number): Promise<unknown> }).setRateLimitPerUser(
        clampInt(args.seconds, 0, 21600, 0),
      );
      return ok(`Set slowmode on #${channel.name} to ${args.seconds}s.`);
    },
  });

  registerTool({
    name: 'discord.channel.set_nsfw',
    description: 'Toggle NSFW on a channel.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, nsfw: { type: 'boolean' } },
      required: ['name', 'nsfw'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_CHANNELS',
    mutates: true,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.name as string);
      if (!channel) return fail(`Channel not found: ${args.name}`);
      if (!('setNSFW' in channel)) return fail('Cannot set NSFW on this channel.');
      await (channel as unknown as { setNSFW(b: boolean): Promise<unknown> }).setNSFW(Boolean(args.nsfw));
      return ok(`Set #${channel.name} NSFW to ${Boolean(args.nsfw)}.`);
    },
  });
}
