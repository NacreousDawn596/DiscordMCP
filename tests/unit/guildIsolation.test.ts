import { describe, it, expect } from 'vitest';
import {
  assertSameGuild,
  assertGuildBoundary,
  CrossGuildViolation,
  extractRequestedGuild,
} from '../../src/security/guildIsolation.js';
import type { ExecutionContext } from '../../src/discord/types.js';

describe('guild isolation', () => {
  it('allows matching guild ids', () => {
    expect(() => assertSameGuild('guild_a', 'guild_a')).not.toThrow();
  });

  it('allows absent guild id (implicitly scoped)', () => {
    expect(() => assertSameGuild(undefined, 'guild_a')).not.toThrow();
    expect(() => assertSameGuild(null, 'guild_a')).not.toThrow();
  });

  it('blocks a mismatched guild id', () => {
    expect(() => assertSameGuild('guild_b', 'guild_a')).toThrow(CrossGuildViolation);
  });

  it('extracts a requested guild from various argument shapes', () => {
    expect(extractRequestedGuild({ guild_id: 'g1' })).toBe('g1');
    expect(extractRequestedGuild({ guildId: 'g1' })).toBe('g1');
    expect(extractRequestedGuild({ target_guild_id: 'g2' })).toBe('g2');
    expect(extractRequestedGuild({ serverId: 'g3' })).toBe('g3');
    expect(extractRequestedGuild({ name: 'x' })).toBeNull();
    expect(extractRequestedGuild(null)).toBeNull();
    expect(extractRequestedGuild('g1')).toBeNull();
  });

  it('recursively extracts a nested guild reference', () => {
    expect(extractRequestedGuild({ plan: { steps: [{ guild: 'g_hidden' }] } })).toBe('g_hidden');
    expect(extractRequestedGuild({ list: [{ server_id: 'g_deep' }] })).toBe('g_deep');
  });

  it('enforces the guild boundary invariant', () => {
    const base = {
      guildId: 'guild_a',
      guild: { id: 'guild_a' } as ExecutionContext['guild'],
      member: { guild: { id: 'guild_a' } } as ExecutionContext['member'],
    } as ExecutionContext;

    expect(() => assertGuildBoundary(base)).not.toThrow();
    expect(() => assertGuildBoundary({ ...base, guild: { id: 'guild_b' } } as ExecutionContext)).toThrow(
      CrossGuildViolation,
    );
    expect(() =>
      assertGuildBoundary({ ...base, member: { guild: { id: 'guild_b' } } } as ExecutionContext),
    ).toThrow(CrossGuildViolation);
  });
});
