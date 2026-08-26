import {
  ChannelType,
  type Guild,
  type GuildBasedChannel,
  type NonThreadGuildBasedChannel,
  type Role,
} from 'discord.js';

export function formatGuild(guild: Guild): string {
  const categories = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildCategory)
    .sort((a, b) => (a as NonThreadGuildBasedChannel).position - (b as NonThreadGuildBasedChannel).position);
  const uncategorized = guild.channels.cache
    .filter((c) => !c.isThread() && !c.parent && c.type !== ChannelType.GuildCategory)
    .sort((a, b) => (a as NonThreadGuildBasedChannel).position - (b as NonThreadGuildBasedChannel).position);

  const lines: string[] = [`Server: ${guild.name}`, `ID: ${guild.id}`, `Members: ${guild.memberCount}`];

  for (const category of categories.values()) {
    lines.push('');
    lines.push(`  ${category.name}`);
    const children = guild.channels.cache
      .filter((c) => !c.isThread() && c.parentId === category.id)
      .sort((a, b) => (a as NonThreadGuildBasedChannel).position - (b as NonThreadGuildBasedChannel).position);
    for (const child of children.values()) {
      lines.push(`    #${child.name} (${channelTypeLabel(child)})`);
    }
  }

  if (uncategorized.size > 0) {
    lines.push('');
    lines.push('  (no category)');
    for (const child of uncategorized.values()) {
      lines.push(`    #${child.name} (${channelTypeLabel(child)})`);
    }
  }

  return lines.join('\n');
}

export function formatRoles(guild: Guild): string {
  const roles = [...guild.roles.cache.values()].sort((a, b) => b.position - a.position);
  return roles
    .map((r) => {
      const perms = r.permissions.toArray();
      const flags = r.permissions.has('Administrator') ? ' [ADMIN]' : perms.length ? ` [${perms.join(', ')}]` : '';
      return `- ${r.name}${r.managed ? ' (managed)' : ''}${flags}`;
    })
    .join('\n');
}

export function formatChannelSummary(channel: GuildBasedChannel): string {
  return `#${channel.name} (${channel.id}) type=${ChannelType[channel.type]}`;
}

export function formatRoleSummary(role: Role): string {
  const perms = role.permissions.toArray();
  return `Role ${role.name} (${role.id}) color=#${role.color.toString(16).padStart(6, '0')} perms=${perms.join(',') || 'none'}`;
}

function channelTypeLabel(channel: GuildBasedChannel): string {
  switch (channel.type) {
    case ChannelType.GuildText:
      return 'text';
    case ChannelType.GuildVoice:
      return 'voice';
    case ChannelType.GuildAnnouncement:
      return 'announcement';
    case ChannelType.GuildForum:
      return 'forum';
    case ChannelType.GuildStageVoice:
      return 'stage';
    case ChannelType.GuildCategory:
      return 'category';
    default:
      return ChannelType[channel.type] ?? 'unknown';
  }
}
