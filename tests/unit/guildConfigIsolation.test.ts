import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { guildRepository } from '../../src/database/repositories/guildRepository.js';
import { createTestDatabase } from '../helpers/testDb.js';

describe('guild config isolation', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it('creates independent configuration per guild', () => {
    guildRepository.ensureConfig('guild_a');
    guildRepository.updateConfig('guild_a', { confirmationLevel: 'DESTRUCTIVE' });

    guildRepository.ensureConfig('guild_b');
    guildRepository.updateConfig('guild_b', { confirmationLevel: 'ALWAYS' });

    expect(guildRepository.getConfig('guild_a')?.confirmationLevel).toBe('DESTRUCTIVE');
    expect(guildRepository.getConfig('guild_b')?.confirmationLevel).toBe('ALWAYS');
  });

  it('does not share blocked/allowed lists across guilds', () => {
    guildRepository.updateConfig('guild_a', { blockedChannels: ['secret'] });
    guildRepository.ensureConfig('guild_b');

    expect(guildRepository.getConfig('guild_a')?.blockedChannels).toEqual(['secret']);
    expect(guildRepository.getConfig('guild_b')?.blockedChannels).toEqual([]);
  });
});
