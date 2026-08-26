import { describe, it, expect } from 'vitest';
import { PermissionsBitField } from 'discord.js';
import { capabilityToDiscordPermissions, permissionBitfield } from '../../src/discord/permissions/capability.js';

describe('capability -> discord permission mapping', () => {
  it('maps every capability to at least one Discord permission', () => {
    for (const [capability, flags] of Object.entries(capabilityToDiscordPermissions)) {
      expect(flags.length, capability).toBeGreaterThan(0);
      for (const flag of flags) {
        expect(PermissionsBitField.Flags[flag], `${capability}:${flag}`).toBeDefined();
      }
    }
  });

  it('builds a permission bitfield from flag names', () => {
    const bf = permissionBitfield(['ViewChannel', 'SendMessages']);
    expect(bf.has('ViewChannel')).toBe(true);
    expect(bf.has('SendMessages')).toBe(true);
    expect(bf.has('Administrator')).toBe(false);
  });
});
