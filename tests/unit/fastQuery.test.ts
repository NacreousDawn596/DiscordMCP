import { describe, expect, it, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrate, __setDatabaseForTests } from '../../src/database/index.js';
import { notebookRepository } from '../../src/database/repositories/notebookRepository.js';
import { tryFastQuery } from '../../src/discord/fastQuery.js';

describe('Fast-Path Query Interceptor', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migrate(db);
    __setDatabaseForTests(db);
  });

  it('returns instant response for XP query', () => {
    notebookRepository.setEntry({
      guildId: 'guild1',
      key: 'xp',
      value: '150',
      memberId: 'user1',
    });

    const res = tryFastQuery('guild1', 'user1', 'what is my xp');
    expect(res).toContain('150 XP');
  });

  it('returns instant response for coins/balance query', () => {
    notebookRepository.setEntry({
      guildId: 'guild1',
      key: 'coins',
      value: '500',
      memberId: 'user1',
    });

    const res = tryFastQuery('guild1', 'user1', 'my balance');
    expect(res).toContain('500 coins');
  });

  it('returns null for complex agent commands', () => {
    const res = tryFastQuery('guild1', 'user1', 'set up an economy system with 50 XP per message');
    expect(res).toBeNull();
  });
});
