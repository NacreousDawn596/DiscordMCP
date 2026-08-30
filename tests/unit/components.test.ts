import { describe, expect, it, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrate, __setDatabaseForTests } from '../../src/database/index.js';
import { storeButtonAction, getButtonAction, getModalConfig } from '../../src/mcp/tools/components.js';
import { notebookRepository } from '../../src/database/repositories/notebookRepository.js';

describe('Discord Components and Interactions', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migrate(db);
    __setDatabaseForTests(db);
  });

  it('stores and retrieves button actions', () => {
    storeButtonAction('guild1', 'btn_test', 'give 50 coins');

    const action = getButtonAction('guild1', 'btn_test');
    expect(action).toBe('give 50 coins');

    const notFound = getButtonAction('guild1', 'btn_unknown');
    expect(notFound).toBeNull();
  });

  it('stores and retrieves modal configurations', () => {
    const config = {
      title: 'Feedback Form',
      fields: [
        { id: 'q1', label: 'What do you think?', style: 'paragraph', required: true }
      ],
      action: 'process feedback'
    };

    notebookRepository.setEntry({
      guildId: 'guild2',
      category: 'modal_configs',
      key: 'feedback_modal',
      value: JSON.stringify(config)
    });

    const retrieved = getModalConfig('guild2', 'feedback_modal');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.title).toBe('Feedback Form');
    expect(retrieved!.fields[0].id).toBe('q1');
    expect(retrieved!.action).toBe('process feedback');

    const notFound = getModalConfig('guild2', 'unknown_modal');
    expect(notFound).toBeNull();
  });
});
