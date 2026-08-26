import type { Capability } from '../../discord/types.js';

export interface AuthorizationInput {
  userId: string;
  guildOwnerId: string | null;
  userIsAdmin: boolean;
  /** Does the invoking user effectively hold the Discord permission for this capability? */
  userHasDiscordPermission: boolean;
  userRoleIds: string[];
  /** Does the bot hold the Discord permission bits for this capability? */
  botHasDiscordPermission: boolean;
  /** Is the required capability enabled in the agent's guild configuration? */
  capabilityEnabled: boolean;
  /** Is the user globally trusted (ALLOWED_USER_IDS)? */
  globalTrusted: boolean;
  /** Is the current channel blocked by guild configuration? */
  blockedChannel: boolean;
  /** Does the user hold any role blocked by guild configuration? */
  blockedByRole: boolean;
  /** Are moderation actions permitted by global config? */
  moderationAllowed: boolean;
  isModerationAction: boolean;
  capability: Capability;
  allowedRoles: string[];
}

export interface AuthorizationResult {
  allowed: boolean;
  reason: string;
}

/**
 * Central authorization gate, enforced in code — the LLM is never the sole
 * authority. Effective permission is:
 *
 *   Discord permission AND agent capability AND user authorization AND safety policy
 *
 * The user authorization leg is a hard gate: the agent MUST NOT perform an
 * action the invoking user is not themselves permitted to perform, unless the
 * user is elevated (guild owner, administrator, a configured allowed role, or
 * globally trusted).
 */
export function authorize(input: AuthorizationInput): AuthorizationResult {
  // Safety policy: moderation must be enabled.
  if (input.isModerationAction && !input.moderationAllowed) {
    return { allowed: false, reason: 'Moderation is disabled by global configuration.' };
  }

  // Agent capability must be enabled for this guild.
  if (!input.capabilityEnabled) {
    return { allowed: false, reason: `Capability ${input.capability} is disabled in this guild.` };
  }

  // The bot must itself hold the underlying Discord permission.
  if (!input.botHasDiscordPermission) {
    return {
      allowed: false,
      reason: `The bot lacks the Discord permission for ${input.capability}.`,
    };
  }

  // Globally trusted users bypass guild-level restrictions (but never Discord
  // permission, capability, or safety policy).
  if (input.globalTrusted) {
    return { allowed: true, reason: 'Globally trusted user.' };
  }

  // Explicitly blocked channel / role.
  if (input.blockedChannel) {
    return { allowed: false, reason: 'This channel is blocked by guild configuration.' };
  }
  if (input.blockedByRole) {
    return { allowed: false, reason: 'Your role is blocked by guild configuration.' };
  }

  // Elevated users may command actions beyond their own Discord permissions.
  const hasAllowedRole =
    input.allowedRoles.length > 0 &&
    input.userRoleIds.some((id) => input.allowedRoles.includes(id));

  if (input.userId === input.guildOwnerId) {
    return { allowed: true, reason: 'Guild owner.' };
  }
  if (input.userIsAdmin) {
    return { allowed: true, reason: 'Administrator.' };
  }
  if (hasAllowedRole) {
    return { allowed: true, reason: 'Configured allowed role.' };
  }

  // Hard gate: the requesting user must hold the Discord permission for this
  // capability (effective, channel-scoped) — the agent stays within the
  // author's scope.
  if (input.userHasDiscordPermission) {
    return { allowed: true, reason: 'User holds the required Discord permission.' };
  }

  return {
    allowed: false,
    reason: `You are not authorized to do this: it requires the Discord permission for ${input.capability}.`,
  };
}
