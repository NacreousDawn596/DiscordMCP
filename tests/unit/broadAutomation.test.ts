import { describe, expect, it, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrate, __setDatabaseForTests } from '../../src/database/index.js';
import { AutomationEngine, type EventPayload } from '../../src/automation/engine.js';
import { notebookRepository } from '../../src/database/repositories/notebookRepository.js';

describe('Broad Automation Engine & Semantic Rules', () => {
  let db: Database.Database;
  const engine = new AutomationEngine();
  engine.stopCleanupTimer();

  beforeEach(() => {
    db = new Database(':memory:');
    migrate(db);
    __setDatabaseForTests(db);
  });

  it('detects offensive and toxic messages', () => {
    const offensiveCondition = [{ description: 'is offensive' }];

    const cleanPayload: EventPayload = {
      guild: { id: 'guild1' },
      message: { content: 'Hello everyone! Have a great day!', author: { bot: false } },
      user: { id: 'user1', bot: false },
    };

    const toxicPayload: EventPayload = {
      guild: { id: 'guild1' },
      message: { content: 'You are such a stupid bitch', author: { bot: false } },
      user: { id: 'user1', bot: false },
    };

    expect(engine.matchesConditions(offensiveCondition, cleanPayload)).toBe(false);
    expect(engine.matchesConditions(offensiveCondition, toxicPayload)).toBe(true);
  });

  it('matches word list and question conditions', () => {
    const wordListCondition = [{ description: 'contains any of [nitro, free, scam]' }];
    const questionCondition = [{ description: 'is a question' }];

    const spamPayload: EventPayload = {
      guild: { id: 'guild1' },
      message: { content: 'Get free nitro here!', author: { bot: false } },
    };

    const questionPayload: EventPayload = {
      guild: { id: 'guild1' },
      message: { content: 'How do I claim my role?', author: { bot: false } },
    };

    expect(engine.matchesConditions(wordListCondition, spamPayload)).toBe(true);
    expect(engine.matchesConditions(questionCondition, questionPayload)).toBe(true);
  });

  it('evaluates notebook state conditions (e.g., notebook xp >= 50)', () => {
    notebookRepository.updateEntry({
      guildId: 'guild1',
      key: 'xp',
      memberId: 'user10',
      operation: 'increment',
      value: 60,
    });

    const stateCondition = [{ description: 'notebook xp >= 50' }];

    const payload: EventPayload = {
      guild: { id: 'guild1' },
      user: { id: 'user10', bot: false },
    };

    expect(engine.matchesConditions(stateCondition, payload)).toBe(true);
  });

  it('executes fast notebook increment actions autonomously', async () => {
    const payload: EventPayload = {
      guild: { id: 'guild1' },
      user: { id: 'user100', bot: false },
    };

    // @ts-expect-error accessing private method for unit testing
    const handled = await engine.tryExecuteFastAction('message_create', 'add 25 xp', payload);
    expect(handled).toBe(true);

    const entry = notebookRepository.getEntry({
      guildId: 'guild1',
      key: 'xp',
      memberId: 'user100',
    });

    expect(entry).not.toBeNull();
    expect(Number(entry!.value)).toBe(25);
  });
});
