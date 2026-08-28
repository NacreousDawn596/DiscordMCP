import { describe, expect, it } from 'vitest';
import { AutomationEngine, type EventPayload } from '../../src/automation/engine.js';

describe('AutomationEngine condition matching', () => {
  const engine = new AutomationEngine();
  engine.stopCleanupTimer();

  it('matches empty conditions unconditionally', () => {
    const payload: EventPayload = {
      guild: { id: 'guild1' },
      message: { id: 'm1', content: 'hello', author: { bot: false } },
    };
    expect(engine.matchesConditions([], payload)).toBe(true);
    expect(engine.matchesConditions([{ description: '' }], payload)).toBe(true);
  });

  it('filters out messages when command token !fact is not present', () => {
    const conditions = [{ description: 'when a person sends !fact message' }];

    const payloadNotFact: EventPayload = {
      guild: { id: 'guild1' },
      message: { id: 'm1', content: 'hello world', author: { bot: false } },
    };

    const payloadIsFact: EventPayload = {
      guild: { id: 'guild1' },
      message: { id: 'm2', content: '!fact', author: { bot: false } },
    };

    const payloadIsFactWithArgs: EventPayload = {
      guild: { id: 'guild3' },
      message: { id: 'm3', content: '!fact please', author: { bot: false } },
    };

    expect(engine.matchesConditions(conditions, payloadNotFact)).toBe(false);
    expect(engine.matchesConditions(conditions, payloadIsFact)).toBe(true);
    expect(engine.matchesConditions(conditions, payloadIsFactWithArgs)).toBe(true);
  });

  it('handles quoted string matching', () => {
    const conditions = [{ description: 'message content is "!fact"' }];

    const payloadNotMatching: EventPayload = {
      guild: { id: 'guild1' },
      message: { id: 'm1', content: 'random message', author: { bot: false } },
    };

    const payloadMatching: EventPayload = {
      guild: { id: 'guild1' },
      message: { id: 'm2', content: '!fact', author: { bot: false } },
    };

    expect(engine.matchesConditions(conditions, payloadNotMatching)).toBe(false);
    expect(engine.matchesConditions(conditions, payloadMatching)).toBe(true);
  });

  it('handles bot vs non-bot author filtering', () => {
    const humanConditions = [{ description: 'only for non-bot members' }];
    const botConditions = [{ description: 'only bots' }];

    const humanPayload: EventPayload = {
      guild: { id: 'guild1' },
      member: { user: { bot: false } },
      message: { id: 'm1', content: 'hi', author: { bot: false } },
    };

    const botPayload: EventPayload = {
      guild: { id: 'guild1' },
      member: { user: { bot: true } },
      message: { id: 'm2', content: 'beep boop', author: { bot: true } },
    };

    expect(engine.matchesConditions(humanConditions, humanPayload)).toBe(true);
    expect(engine.matchesConditions(humanConditions, botPayload)).toBe(false);

    expect(engine.matchesConditions(botConditions, humanPayload)).toBe(false);
    expect(engine.matchesConditions(botConditions, botPayload)).toBe(true);
  });

  it('handles explicit prefix, suffix, and contains keywords', () => {
    const prefixCond = [{ description: 'starts with !help' }];
    const containsCond = [{ description: 'contains ping' }];

    const payload1: EventPayload = {
      guild: { id: 'guild1' },
      message: { id: 'm1', content: '!help commands', author: { bot: false } },
    };

    const payload2: EventPayload = {
      guild: { id: 'guild1' },
      message: { id: 'm2', content: 'please ping me later', author: { bot: false } },
    };

    expect(engine.matchesConditions(prefixCond, payload1)).toBe(true);
    expect(engine.matchesConditions(prefixCond, payload2)).toBe(false);

    expect(engine.matchesConditions(containsCond, payload2)).toBe(true);
    expect(engine.matchesConditions(containsCond, payload1)).toBe(false);
  });

  it('handles channel filtering', () => {
    const channelCond = [{ description: 'only in #general' }];

    const generalPayload: EventPayload = {
      guild: { id: 'guild1' },
      channelId: 'general',
      channelName: '#general',
      message: { id: 'm1', content: 'hello', author: { bot: false } },
    };

    const devPayload: EventPayload = {
      guild: { id: 'guild1' },
      channelId: 'dev-chat',
      channelName: '#dev-chat',
      message: { id: 'm2', content: 'hello', author: { bot: false } },
    };

    expect(engine.matchesConditions(channelCond, generalPayload)).toBe(true);
    expect(engine.matchesConditions(channelCond, devPayload)).toBe(false);
  });
});
