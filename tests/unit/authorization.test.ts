import { describe, it, expect } from 'vitest';
import { authorize } from '../../src/agent/policies/authorization.js';
import type { AuthorizationInput } from '../../src/agent/policies/authorization.js';

function baseInput(overrides: Partial<AuthorizationInput> = {}): AuthorizationInput {
  return {
    userId: 'u1',
    guildOwnerId: 'owner',
    userIsAdmin: false,
    userHasDiscordPermission: false,
    userRoleIds: [],
    botHasDiscordPermission: true,
    capabilityEnabled: true,
    globalTrusted: false,
    blockedChannel: false,
    blockedByRole: false,
    moderationAllowed: true,
    isModerationAction: false,
    capability: 'MANAGE_CHANNELS',
    allowedRoles: [],
    ...overrides,
  };
}

describe('authorization', () => {
  it('denies when the capability is disabled for the guild', () => {
    const r = authorize(baseInput({ capabilityEnabled: false }));
    expect(r.allowed).toBe(false);
  });

  it('denies when the bot lacks the Discord permission', () => {
    const r = authorize(baseInput({ botHasDiscordPermission: false }));
    expect(r.allowed).toBe(false);
  });

  it('denies when moderation is disabled globally', () => {
    const r = authorize(
      baseInput({ isModerationAction: true, moderationAllowed: false, capability: 'MODERATE' }),
    );
    expect(r.allowed).toBe(false);
  });

  it('allows globally trusted users (but still not if capability disabled)', () => {
    const r = authorize(baseInput({ globalTrusted: true }));
    expect(r.allowed).toBe(true);
  });

  it('lets a trusted user perform a privileged action regardless of their own permissions', () => {
    const r = authorize(
      baseInput({
        capability: 'MANAGE_CHANNELS',
        globalTrusted: true,
        userHasDiscordPermission: false,
        userIsAdmin: false,
      }),
    );
    expect(r.allowed).toBe(true);
  });

  it('denies a privileged action for a normal member', () => {
    const r = authorize(baseInput({ capability: 'MANAGE_CHANNELS' }));
    expect(r.allowed).toBe(false);
  });

  it('allows a privileged action for the guild owner', () => {
    const r = authorize(baseInput({ userId: 'owner' }));
    expect(r.allowed).toBe(true);
  });

  it('allows a privileged action for an administrator', () => {
    const r = authorize(baseInput({ userIsAdmin: true }));
    expect(r.allowed).toBe(true);
  });

  it('allows a privileged action when the user holds the Discord permission', () => {
    const r = authorize(baseInput({ userHasDiscordPermission: true }));
    expect(r.allowed).toBe(true);
  });

  it('denies a user with a blocked role even for non-privileged actions', () => {
    const r = authorize(baseInput({ capability: 'SEND_MESSAGES', blockedByRole: true }));
    expect(r.allowed).toBe(false);
  });

  it('denies when the channel is blocked', () => {
    const r = authorize(baseInput({ capability: 'READ_MESSAGES', blockedChannel: true }));
    expect(r.allowed).toBe(false);
  });

  it('allows a member who holds the Discord permission for a non-privileged action', () => {
    const r = authorize(
      baseInput({ capability: 'SEND_MESSAGES', userHasDiscordPermission: true }),
    );
    expect(r.allowed).toBe(true);
  });

  it('denies a member who lacks the Discord permission for a non-privileged action', () => {
    const r = authorize(
      baseInput({ capability: 'SEND_MESSAGES', userHasDiscordPermission: false }),
    );
    expect(r.allowed).toBe(false);
  });

  it('denies message deletion (MANAGE_MESSAGES) for a normal member without the permission', () => {
    const r = authorize(
      baseInput({ capability: 'MANAGE_MESSAGES', userHasDiscordPermission: false }),
    );
    expect(r.allowed).toBe(false);
  });

  it('allows message deletion for a member with MANAGE_MESSAGES', () => {
    const r = authorize(
      baseInput({ capability: 'MANAGE_MESSAGES', userHasDiscordPermission: true }),
    );
    expect(r.allowed).toBe(true);
  });

  it('denies kicking for a member without the permission (even though non-admin)', () => {
    const r = authorize(
      baseInput({ capability: 'MANAGE_MEMBERS', userHasDiscordPermission: false }),
    );
    expect(r.allowed).toBe(false);
  });
});
