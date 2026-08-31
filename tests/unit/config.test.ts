import { describe, it, expect } from 'vitest';
import { loadConfig, BUILT_IN_TRUSTED_USER_IDS } from '../../src/config/env.js';

describe('config trust', () => {
  it('always includes the built-in trusted user ids', () => {
    const config = loadConfig({});
    expect(config.trust.allowedUserIds).toContain('778627103578783776');
  });

  it('merges env-provided ids without duplicates', () => {
    const config = loadConfig({ ALLOWED_USER_IDS: '778627103578783776, 111222333' });
    expect(config.trust.allowedUserIds).toEqual(
      expect.arrayContaining(['778627103578783776', '111222333']),
    );
    const seen = new Set(config.trust.allowedUserIds);
    expect(seen.size).toBe(config.trust.allowedUserIds.length);
  });

  it('exposes the built-in list', () => {
    expect(BUILT_IN_TRUSTED_USER_IDS).toContain('778627103578783776');
  });
});

describe('config economy', () => {
  it('defaults XP to disabled', () => {
    const config = loadConfig({});
    expect(config.economy.xpPerMessage).toBe(0);
    expect(config.economy.xpCooldownSeconds).toBe(60);
  });

  it('parses XP per message and cooldown from env', () => {
    const config = loadConfig({ XP_PER_MESSAGE: '10', XP_COOLDOWN_SECONDS: '30' });
    expect(config.economy.xpPerMessage).toBe(10);
    expect(config.economy.xpCooldownSeconds).toBe(30);
  });
});
