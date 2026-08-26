import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/testDb.js';
import { createFakeGuild, makeFakeBotMember, makeFakeNormalMember, buildTestContext, makeTestConfig } from '../helpers/fakeDiscord.js';
import { MockLLM, toolResponse, textResponse } from '../helpers/mockLlm.js';
import { registerAllTools } from '../../src/mcp/tools/index.js';
import { createExecutor } from '../../src/mcp/executor.js';
import { guildRepository } from '../../src/database/repositories/guildRepository.js';
import { runRepository } from '../../src/database/repositories/runRepository.js';
import { AgentRuntime } from '../../src/agent/runtime/loop.js';
import { MemoryManager } from '../../src/agent/memory/memoryManager.js';

describe('agent runtime end-to-end (mock Discord + mock LLM)', () => {
  let db: Database.Database;
  const config = makeTestConfig();
  const botId = 'bot_1';

  beforeEach(() => {
    db = createTestDatabase();
    registerAllTools();
  });

  afterEach(() => {
    db.close();
  });

  function makeRuntime(llm: MockLLM) {
    const executor = createExecutor({
      config,
      getGuildConfig: (id) => guildRepository.ensureConfig(id),
    });
    return new AgentRuntime({
      config,
      llm,
      executor,
      getGuildConfig: (id) => guildRepository.ensureConfig(id),
      memory: new MemoryManager(),
    });
  }

  it('executes a create_category tool against the fake guild and returns a summary', async () => {
    const { guild, channels } = createFakeGuild('guild_a', 'owner_user');
    guild.members.me = makeFakeBotMember(botId) as never;

    const llm = new MockLLM([
      toolResponse('discord.channel.create_category', { name: 'Development' }),
      textResponse('Created the Development category.'),
    ]);
    const runtime = makeRuntime(llm);
    const ctx = buildTestContext(guild, botId);

    const outcome = await runtime.run(ctx, 'create a Development category', 'normal');

    expect(outcome.success).toBe(true);
    expect(outcome.needsConfirmation).toBe(false);
    expect(outcome.response).toContain('Created the Development category');
    expect([...channels.values()].some((c) => c.name === 'Development')).toBe(true);

    const runs = runRepository.listRecentRuns('guild_a');
    expect(runs).toHaveLength(1);
    expect(runs[0]!.success).toBe(true);
  });

  it('refuses a privileged action requested by a non-admin user without the permission', async () => {
    const { guild, channels } = createFakeGuild('guild_a', 'owner_user');
    guild.members.me = makeFakeBotMember(botId) as never;

    const llm = new MockLLM([
      toolResponse('discord.channel.create_category', { name: 'Development' }),
      textResponse('I did it.'),
    ]);
    const runtime = makeRuntime(llm);

    // A normal member (not owner/admin, no permissions) asks for a privileged action.
    const ctx = buildTestContext(guild, botId, {
      userId: 'random_user',
      member: makeFakeNormalMember('random_user') as never,
    });

    const outcome = await runtime.run(ctx, 'create a Development category', 'normal');

    expect(outcome.success).toBe(true);
    // The category was never created — the agent stayed within the author's scope.
    expect([...channels.values()].some((c) => c.name === 'Development')).toBe(false);

    const actions = runRepository.listRecentActions('guild_a');
    const blocked = actions.find((a) => String(a.result).includes('not authorized'));
    expect(blocked).toBeDefined();
  });

  it('blocks a cross-guild tool call and performs no mutation', async () => {
    const { guild, channels } = createFakeGuild('guild_a', 'owner_user');
    guild.members.me = makeFakeBotMember(botId) as never;

    // The LLM attempts to redirect the operation to a different guild.
    const llm = new MockLLM([
      toolResponse('discord.channel.create_category', { name: 'Hijack', guild_id: 'guild_b' }),
      textResponse('I did it.'),
    ]);
    const runtime = makeRuntime(llm);
    const ctx = buildTestContext(guild, botId);

    const outcome = await runtime.run(ctx, 'do something', 'normal');

    expect(outcome.success).toBe(true);
    // No channel named "Hijack" was ever created in guild_a.
    expect([...channels.values()].some((c) => c.name === 'Hijack')).toBe(false);

    // The action was recorded as a blocked cross-guild attempt.
    const actions = runRepository.listRecentActions('guild_a');
    expect(actions.length).toBeGreaterThan(0);
    const blocked = actions.find((a) => String(a.result).includes('Cross-guild'));
    expect(blocked).toBeDefined();
  });

  it('requires confirmation for destructive actions and resumes on approval', async () => {
    const { guild, channels } = createFakeGuild('guild_a', 'owner_user');
    guild.members.me = makeFakeBotMember(botId) as never;
    // Pre-create a channel so a delete would find a target (if it ever runs).
    channels.set('1', { id: '1', name: 'doomed', type: 0, position: 0, parent: null, parentId: null, isThread: () => false });

    const llm = new MockLLM([
      toolResponse('discord.channel.delete', { name: 'doomed' }),
    ]);
    const runtime = makeRuntime(llm);
    const ctx = buildTestContext(guild, botId);

    const outcome = await runtime.run(ctx, 'delete #doomed', 'normal');

    expect(outcome.needsConfirmation).toBe(true);
    expect(outcome.pendingActions.length).toBeGreaterThan(0);
    // The channel still exists — nothing was deleted without approval.
    expect(channels.has('1')).toBe(true);
  });
});
