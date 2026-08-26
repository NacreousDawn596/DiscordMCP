import {
  ChannelType,
  PermissionsBitField,
  type Guild,
  type NonThreadGuildBasedChannel,
  type Role,
} from 'discord.js';
import type { ToolResult } from '../../discord/types.js';

export function ok(output: string, data?: unknown): ToolResult {
  return { success: true, output, data };
}

export function fail(output: string, data?: unknown): ToolResult {
  return { success: false, output, data };
}

export function extractMentionId(raw: string): string | undefined {
  const match = /<[@#][!&]?(\d{15,21})>/.exec(raw);
  return match?.[1];
}

export function toId(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  return extractMentionId(raw) ?? raw.trim();
}

/** Resolves a channel (non-thread) by id, mention, or case-insensitive name. */
export function findChannel(guild: Guild, nameOrId: string | undefined | null): NonThreadGuildBasedChannel | undefined {
  const id = toId(nameOrId);
  if (!id) return undefined;
  const byId = guild.channels.cache.get(id);
  if (byId && !byId.isThread()) return byId as NonThreadGuildBasedChannel;
  const lower = id.toLowerCase();
  const found = guild.channels.cache.find((c) => !c.isThread() && c.name.toLowerCase() === lower);
  return found ? (found as NonThreadGuildBasedChannel) : undefined;
}

export function findChannelOfType(
  guild: Guild,
  nameOrId: string | undefined | null,
  types: ChannelType[],
): NonThreadGuildBasedChannel | undefined {
  const found = findChannel(guild, nameOrId);
  if (found && types.includes(found.type)) return found;
  if (found) return undefined;
  const id = toId(nameOrId);
  if (!id) return undefined;
  const lower = id.toLowerCase();
  const match = guild.channels.cache.find(
    (c) => !c.isThread() && c.name.toLowerCase() === lower && types.includes(c.type),
  );
  return match ? (match as NonThreadGuildBasedChannel) : undefined;
}

export function findRole(guild: Guild, nameOrId: string | undefined | null): Role | undefined {
  const id = toId(nameOrId);
  if (!id) return undefined;
  const byId = guild.roles.cache.get(id);
  if (byId) return byId;
  const lower = id.toLowerCase();
  return guild.roles.cache.find((r) => r.name.toLowerCase() === lower);
}

export function findCategory(guild: Guild, nameOrId: string | undefined | null): NonThreadGuildBasedChannel | undefined {
  return findChannelOfType(guild, nameOrId, [ChannelType.GuildCategory]);
}

export function mapChannelType(raw: string | undefined): ChannelType {
  switch ((raw ?? 'text').toLowerCase()) {
    case 'text':
      return ChannelType.GuildText;
    case 'voice':
      return ChannelType.GuildVoice;
    case 'category':
      return ChannelType.GuildCategory;
    case 'announcement':
    case 'news':
      return ChannelType.GuildAnnouncement;
    case 'forum':
      return ChannelType.GuildForum;
    case 'stage':
    case 'stage_voice':
      return ChannelType.GuildStageVoice;
    default:
      return ChannelType.GuildText;
  }
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? Math.round(value) : Number(value);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function truncate(text: string, length = 1900): string {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

/**
 * Converts allow/deny permission-name lists into discord.js
 * PermissionOverwriteOptions and applies them to a channel via
 * permissionOverwrites.edit (which upserts).
 */
export async function setOverwrite(
  channel: NonThreadGuildBasedChannel,
  targetId: string,
  allowNames: string[] = [],
  denyNames: string[] = [],
): Promise<void> {
  const allow = allowNames
    .map((n) => (PermissionsBitField.Flags as Record<string, bigint>)[n])
    .filter((b): b is bigint => b !== undefined)
    .reduce((a, b) => a | b, 0n);
  const deny = denyNames
    .map((n) => (PermissionsBitField.Flags as Record<string, bigint>)[n])
    .filter((b): b is bigint => b !== undefined)
    .reduce((a, b) => a | b, 0n);

  const options: Record<string, boolean | null> = {};
  for (const [name, bit] of Object.entries(PermissionsBitField.Flags)) {
    if (allow & bit) options[name] = true;
    else if (deny & bit) options[name] = false;
  }

  await channel.permissionOverwrites.edit(targetId, options);
}
