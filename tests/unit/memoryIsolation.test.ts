import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { memoryRepository } from '../../src/database/repositories/memoryRepository.js';
import { createTestDatabase } from '../helpers/testDb.js';

describe('memory isolation', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it('stores and retrieves memory scoped to a guild', () => {
    memoryRepository.store({ guildId: 'guild_a', key: 'convention', value: 'use camelCase' });
    const found = memoryRepository.get({ guildId: 'guild_a', key: 'convention' });
    expect(found?.value).toBe('use camelCase');
  });

  it('never leaks memory between guilds', () => {
    memoryRepository.store({ guildId: 'guild_a', key: 'secret', value: 'a-secret' });

    const inB = memoryRepository.list({ guildId: 'guild_b' });
    expect(inB).toHaveLength(0);
    expect(memoryRepository.get({ guildId: 'guild_b', key: 'secret' })).toBeUndefined();
  });

  it('enforces guild scope on update and delete', () => {
    const record = memoryRepository.store({ guildId: 'guild_a', key: 'k', value: 'v1' });
    memoryRepository.update(record.id, 'guild_b', 'v2');

    const stillInA = memoryRepository.get({ guildId: 'guild_a', key: 'k' });
    expect(stillInA?.value).toBe('v1');
  });

  it('supports CHANNEL and USER scopes within a guild', () => {
    memoryRepository.store({
      guildId: 'guild_a',
      scope: 'CHANNEL',
      channelId: 'c1',
      key: 'topic',
      value: 'dev',
    });
    expect(
      memoryRepository.list({ guildId: 'guild_a', scope: 'CHANNEL', channelId: 'c1' }),
    ).toHaveLength(1);
    expect(
      memoryRepository.list({ guildId: 'guild_a', scope: 'CHANNEL', channelId: 'c2' }),
    ).toHaveLength(0);
  });
});
