import { describe, expect, it, vi } from 'vitest';
import { AutomationEngine, type EventPayload } from '../../src/automation/engine.js';

describe('Reaction Roles automation logic', () => {
  const engine = new AutomationEngine();
  engine.stopCleanupTimer();

  it('matches message id and emoji conditions accurately', () => {
    const conditions = [
      { description: 'message id 123456789012345678' },
      { description: 'emoji 🔴' },
      { description: 'not a bot' },
    ];

    const matchingPayload: EventPayload = {
      guild: { id: 'guild1' },
      messageId: '123456789012345678',
      emoji: { name: '🔴', id: null, identifier: '🔴' },
      user: { id: 'user1', bot: false },
    };

    const wrongMessagePayload: EventPayload = {
      guild: { id: 'guild1' },
      messageId: '999999999999999999',
      emoji: { name: '🔴', id: null, identifier: '🔴' },
      user: { id: 'user1', bot: false },
    };

    const wrongEmojiPayload: EventPayload = {
      guild: { id: 'guild1' },
      messageId: '123456789012345678',
      emoji: { name: '🔵', id: null, identifier: '🔵' },
      user: { id: 'user1', bot: false },
    };

    const botUserPayload: EventPayload = {
      guild: { id: 'guild1' },
      messageId: '123456789012345678',
      emoji: { name: '🔴', id: null, identifier: '🔴' },
      user: { id: 'bot1', bot: true },
    };

    const botMessageHumanReactPayload: EventPayload = {
      guild: { id: 'guild1' },
      messageId: '123456789012345678',
      message: { id: '123456789012345678', content: 'React below', author: { bot: true } },
      emoji: { name: '🔴', id: null, identifier: '🔴' },
      user: { id: 'user1', bot: false },
    };

    expect(engine.matchesConditions(conditions, matchingPayload, 'reaction_add')).toBe(true);
    expect(engine.matchesConditions(conditions, botMessageHumanReactPayload, 'reaction_add')).toBe(true);
    expect(engine.matchesConditions(conditions, wrongMessagePayload, 'reaction_add')).toBe(false);
    expect(engine.matchesConditions(conditions, wrongEmojiPayload, 'reaction_add')).toBe(false);
    expect(engine.matchesConditions(conditions, botUserPayload, 'reaction_add')).toBe(false);
  });

  it('executes fast role addition and removal on reaction events', async () => {
    const mockAddRole = vi.fn().mockResolvedValue(undefined);
    const mockRemoveRole = vi.fn().mockResolvedValue(undefined);

    const mockRole = { id: 'role1', name: 'Red' };

    const mockGuild = {
      id: 'guild1',
      roles: {
        cache: {
          get: (id: string) => (id === 'role1' ? mockRole : undefined),
          find: (fn: (r: { name: string }) => boolean) => (fn(mockRole) ? mockRole : undefined),
        },
      },
    };

    const mockMember = {
      id: 'user1',
      roles: {
        add: mockAddRole,
        remove: mockRemoveRole,
      },
    };

    const runner = vi.fn().mockResolvedValue(undefined);
    engine.setRunner(runner);

    const addPayload: EventPayload = {
      guild: mockGuild,
      member: mockMember,
      messageId: '12345',
      emoji: { name: '🔴', id: null, identifier: '🔴' },
      user: { id: 'user1', bot: false },
    };

    // Trigger reaction_add using fast-path role addition
    // @ts-expect-error accessing private method for unit testing
    const addSuccess = await engine.tryExecuteReactionRole('reaction_add', 'add role Red', addPayload);
    expect(addSuccess).toBe(true);
    expect(mockAddRole).toHaveBeenCalledWith(mockRole);

    // Trigger reaction_remove using fast-path role removal
    // @ts-expect-error accessing private method for unit testing
    const removeSuccess = await engine.tryExecuteReactionRole('reaction_remove', 'remove role Red', addPayload);
    expect(removeSuccess).toBe(true);
    expect(mockRemoveRole).toHaveBeenCalledWith(mockRole);
  });
});
