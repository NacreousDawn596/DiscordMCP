import {
  ChannelType,
  PermissionsBitField,
  type Collection,
  type Guild,
  type GuildMember,
  type NonThreadGuildBasedChannel,
  type Role,
} from 'discord.js';
import type { ToolResult } from '../../discord/types.js';

export function ok(output: string, data?: unknown): ToolResult {
  return { success: true, output, data };
}

/** ok() plus a marker that the tool posted a visible message to a channel. */
export function okPosted(output: string, channelId: string, data?: unknown): ToolResult {
  return { success: true, output, data, postedChannelId: channelId };
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
 * Fetches the full member roster (not just the cache). Falls back to the cache
 * with an explanatory note if the fetch fails (e.g. missing Server Members
 * intent).
 */export async function fetchAllMembers(
  guild: Guild,
): Promise<{ members: Collection<string, GuildMember>; note?: string }> {
  try {
    const members = await guild.members.fetch();
    return { members };
  } catch (err) {
    return {
      members: guild.members.cache,
      note: `Unable to fetch the full member list (${(err as Error).message}). Showing cached members only — enable "Server Members Intent" in the Discord Developer Portal.`,
    };
  }
}

/**
 * Resolves a member by id, mention, or (after fetching the full roster)
 * case-insensitive username/nickname/tag.
 */
export async function resolveMember(
  guild: Guild,
  nameOrId: string,
): Promise<GuildMember | null> {
  const id = toId(nameOrId);
  if (!id) return null;

  const byId = guild.members.cache.get(id) ?? (await guild.members.fetch(id).catch(() => null));
  if (byId) return byId;

  const lower = id.toLowerCase();
  try {
    await guild.members.fetch();
  } catch {
    /* fall back to cache */
  }
  return (
    guild.members.cache.find(
      (m) =>
        m.user.username.toLowerCase() === lower ||
        (m.nickname ?? '').toLowerCase() === lower ||
        m.user.tag.toLowerCase() === lower,
    ) ?? null
  );
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

/**
 * Whether the bot (or a member) is able to manage a given role. Discord
 * returns "Missing Permissions" (50013) when the actor's highest role is not
 * strictly above the target role — even when they hold Manage Roles. This
 * pre-check turns that opaque error into a clear message.
 */
export function canManageRole(
  actor: GuildMember | null,
  role: Role,
): { ok: true } | { ok: false; reason: string } {
  if (!actor) return { ok: false, reason: 'the acting member is unavailable' };
  if (role.managed) return { ok: false, reason: `role "${role.name}" is managed by an integration` };
  if (role.id === actor.guild.roles.everyone.id) {
    return { ok: false, reason: 'the @everyone role cannot be modified' };
  }
  const highest = actor.roles.highest;
  if (role.position >= highest.position) {
    return {
      ok: false,
      reason: `role "${role.name}" is at or above my highest role ("${highest.name}") — move my role higher in the server role hierarchy (or grant me the role)`,
    };
  }
  return { ok: true };
}
