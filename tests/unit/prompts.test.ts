import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../../src/agent/runtime/prompts.js';
import type { ExecutionContext } from '../../src/discord/types.js';
import type { GuildConfig } from '../../src/database/repositories/guildRepository.js';
import { makeTestConfig } from '../helpers/fakeDiscord.js';

function makeGuildConfig(overrides: Partial<GuildConfig> = {}): GuildConfig {
  return {
    guildId: 'guild_a',
    agentName: null,
    personality: 'professional',
    model: null,
    confirmationLevel: 'HIGH',
    defaultMode: 'normal',
    allowedChannels: [],
    blockedChannels: [],
    allowedRoles: [],
    blockedRoles: [],
    enabledCapabilities: [],
    moderationEnabled: false,
    loggingEnabled: true,
    memoryEnabled: true,
    automationsEnabled: true,
    ...overrides,
  };
}

function makeCtx(username: string | undefined): ExecutionContext {
  return {
    guildId: 'guild_a',
    guildName: 'Test',
    channelId: 'c1',
    channelName: 'general',
    threadId: null,
    userId: 'u1',
    userName: username ?? 'someone',
    messageId: 'm1',
    botId: 'bot',
    botTag: 'Agent#0',
    author: username ? ({ username } as ExecutionContext['author']) : null,
    member: null,
    guild: {} as ExecutionContext['guild'],
    channel: null,
    message: null,
  };
}

describe('system prompt honorifics', () => {
  it('addresses "chouu" as Queen', () => {
    const prompt = buildSystemPrompt(makeCtx('chouu'), makeTestConfig(), makeGuildConfig(), 'normal');
    expect(prompt).toContain('Queen');
    expect(prompt).toContain('ALWAYS be addressed as "Queen"');
  });

  it('addresses "louzyrain" as Queen (case-insensitive)', () => {
    const prompt = buildSystemPrompt(makeCtx('LouzyRain'), makeTestConfig(), makeGuildConfig(), 'normal');
    expect(prompt).toContain('Queen');
  });

  it('does not apply an honorific to other users', () => {
    const prompt = buildSystemPrompt(makeCtx('alice'), makeTestConfig(), makeGuildConfig(), 'normal');
    expect(prompt).not.toContain('ALWAYS be addressed');
  });
});

describe('system prompt capabilities', () => {
  it('exposes interactive component tools (buttons, modals, embeds) to the LLM', () => {
    const prompt = buildSystemPrompt(makeCtx(undefined), makeTestConfig(), makeGuildConfig(), 'normal');
    expect(prompt).toContain('discord.message.send_with_buttons');
    expect(prompt).toContain('discord.form.register');
    expect(prompt).toContain('discord.button.register_action');
    expect(prompt).toContain('discord.embed.send');
  });

  it('exposes notebook/economy and reaction-role capabilities', () => {
    const prompt = buildSystemPrompt(makeCtx(undefined), makeTestConfig(), makeGuildConfig(), 'normal');
    expect(prompt).toContain('discord.notebook.*');
    expect(prompt).toContain('discord.automation.reaction_role.create');
  });
});
