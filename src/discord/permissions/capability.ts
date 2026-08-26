import { PermissionsBitField } from 'discord.js';
import type { Channel, GuildChannel, GuildMember } from 'discord.js';
import type { Capability } from '../types.js';

export type DiscordPermissionFlag = keyof typeof PermissionsBitField.Flags;

/**
 * Maps an agent capability to the set of Discord permission flags the bot
 * (and the invoking user) must hold for the operation to be authorized.
 *
 * Semantics are conservative: every listed flag must be present (`.every`).
 * Elevated users (owner / administrator / configured allowed role / global
 * trust) bypass the user-level requirement but never the bot/safety gates.
 */
export const capabilityToDiscordPermissions: Record<Capability, DiscordPermissionFlag[]> = {
  READ_MESSAGES: ['ViewChannel', 'ReadMessageHistory'],
  SEND_MESSAGES: ['SendMessages', 'ViewChannel'],
  MANAGE_MESSAGES: ['ManageMessages'],
  MANAGE_CHANNELS: ['ManageChannels'],
  MANAGE_ROLES: ['ManageRoles'],
  MANAGE_PERMISSIONS: ['ManageRoles', 'ManageChannels'],
  MANAGE_MEMBERS: ['KickMembers', 'BanMembers', 'ModerateMembers'],
  MODERATE: ['ModerateMembers', 'ManageMessages'],
  MANAGE_WEBHOOKS: ['ManageWebhooks'],
  MANAGE_GUILD: ['Administrator', 'ManageGuild'],
};

export function botHasCapability(
  botMember: GuildMember | null,
  capability: Capability,
): boolean {
  if (!botMember) return false;
  const flags = capabilityToDiscordPermissions[capability] ?? [];
  return flags.every((flag) => botMember.permissions.has(flag));
}

export function userHasCapability(
  member: GuildMember | null,
  capability: Capability,
): boolean {
  if (!member) return false;
  const flags = capabilityToDiscordPermissions[capability] ?? [];
  return flags.every((flag) => member.permissions.has(flag));
}

/**
 * The invoking user's effective permissions, resolved in a channel when one is
 * available (so channel overwrites are honored) and falling back to guild-level
 * permissions otherwise.
 */
export function effectivePermissionsIn(
  member: GuildMember | null,
  channel: Channel | null,
): PermissionsBitField | null {
  if (!member) return null;
  if (!channel || !('permissionsFor' in channel)) return member.permissions;
  return channel.permissionsFor(member);
}

/**
 * Whether the invoking user effectively holds the Discord permission for a
 * capability — the hard gate that keeps the agent within the author's scope.
 */
export function userHasEffectiveCapability(
  member: GuildMember | null,
  capability: Capability,
  channel: Channel | null,
): boolean {
  if (!member) return false;
  const flags = capabilityToDiscordPermissions[capability] ?? [];
  const effective = effectivePermissionsIn(member, channel);
  if (!effective) return false;
  return flags.every((flag) => effective.has(flag));
}

export function describePermissions(permissions: PermissionsBitField): string[] {
  return permissions.toArray();
}

export function permissionBitfield(
  flags: DiscordPermissionFlag[],
): PermissionsBitField {
  const bits = flags.map((f) => PermissionsBitField.Flags[f]);
  return new PermissionsBitField(bits);
}
