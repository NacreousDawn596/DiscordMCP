import { describe, expect, it, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrate, resetDatabaseForTests, __setDatabaseForTests } from '../../src/database/index.js';
import { notebookRepository } from '../../src/database/repositories/notebookRepository.js';

describe('Notebook Repository & State Operations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migrate(db);
    __setDatabaseForTests(db);
  });

  it('stores and retrieves key-value notebook entries', () => {
    const entry = notebookRepository.setEntry({
      guildId: 'guild1',
      category: 'economy',
      key: 'shop_items',
      value: ['sword', 'shield', 'potion'],
    });

    expect(entry.guildId).toBe('guild1');
    expect(entry.category).toBe('economy');
    expect(entry.key).toBe('shop_items');

    const fetched = notebookRepository.getEntry({
      guildId: 'guild1',
      category: 'economy',
      key: 'shop_items',
    });

    expect(fetched).not.toBeNull();
    expect(JSON.parse(fetched!.value)).toEqual(['sword', 'shield', 'potion']);
  });

  it('increments member XP and coins atomically', () => {
    notebookRepository.updateEntry({
      guildId: 'guild1',
      category: 'xp',
      key: 'user_xp',
      memberId: 'user123',
      operation: 'increment',
      value: 15,
    });

    const second = notebookRepository.updateEntry({
      guildId: 'guild1',
      category: 'xp',
      key: 'user_xp',
      memberId: 'user123',
      operation: 'increment',
      value: 25,
    });

    expect(Number(second.value)).toBe(40);
  });

  it('appends items to notebook lists using push operation', () => {
    notebookRepository.updateEntry({
      guildId: 'guild1',
      category: 'moderation',
      key: 'logs',
      operation: 'push',
      value: 'warned user for spam',
    });

    const updated = notebookRepository.updateEntry({
      guildId: 'guild1',
      category: 'moderation',
      key: 'logs',
      operation: 'push',
      value: 'deleted offensive message',
    });

    const parsed = JSON.parse(updated.value);
    expect(parsed).toEqual(['warned user for spam', 'deleted offensive message']);
  });

  it('queries notebook entries by pattern and member', () => {
    notebookRepository.setEntry({ guildId: 'guild1', category: 'drafts', key: 'rule_draft_1', value: 'Be kind' });
    notebookRepository.setEntry({ guildId: 'guild1', category: 'drafts', key: 'rule_draft_2', value: 'No spam' });

    const results = notebookRepository.queryEntries({
      guildId: 'guild1',
      category: 'drafts',
      keyPattern: 'rule_draft',
    });

    expect(results).toHaveLength(2);
  });
});
