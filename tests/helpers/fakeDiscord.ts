import { Collection } from 'discord.js';
import type { AppConfig } from '../../src/config/env.js';
import type { ExecutionContext } from '../../src/discord/types.js';

/**
 * A minimal fake of the discord.js Guild surface that the tools exercise.
 * Real discord.js objects are heavy and require a gateway connection; these
 * fakes implement only the collections/methods the tools call, and are cast
 * through `unknown as Guild` at the boundary.
 */

export interface FakeChannel {
  id: string;
  name: string;
  type: number;
  position: number;
  parent: string | null;
  parentId: string | null;
  isThread: () => boolean;
}

export interface FakeRole {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
  permissions: { has: (f: string) => boolean; toArray: () => string[] };
}

export interface FakeMember {
  id: string;
  guild: { id: string };
  user: { bot: boolean; tag: string; username: string };
  nickname: string | null;
  permissions: { has: (f: string) => boolean; toArray: () => string[] };
  roles: { cache: Collection<string, FakeRole> };
}

export interface FakeGuild {
  id: string;
  name: string;
  ownerId: string;
  memberCount: number;
  channels: {
    cache: Collection<string, FakeChannel>;
    create: (data: { name: string; type?: number; parent?: string }) => Promise<FakeChannel>;
  };
  roles: {
    cache: Collection<string, FakeRole>;
    everyone: FakeRole;
    create: (data: { name: string; color?: number; permissions?: bigint[] }) => Promise<FakeRole>;
  };
  members: { me: FakeMember | null };
}

let channelCounter = 0;
let roleCounter = 0;

export function createFakeGuild(id = 'guild_a', ownerId = 'owner_user'): {
  guild: FakeGuild;
  channels: Collection<string, FakeChannel>;
  roles: Collection<string, FakeRole>;
} {
  const channels = new Collection<string, FakeChannel>();
  const roles = new Collection<string, FakeRole>();

  const everyone: FakeRole = {
    id: id,
    name: '@everyone',
    color: 0,
    position: 0,
    managed: false,
    permissions: { has: () => false, toArray: () => [] },
  };
  roles.set(everyone.id, everyone);

  const guild: FakeGuild = {
    id,
    name: `Fake ${id}`,
    ownerId,
    memberCount: 1,
    channels: {
      cache: channels,
      create: async (data) => {
        const ch: FakeChannel = {
          id: `${++channelCounter}`,
          name: data.name,
          type: data.type ?? 0,
          position: channelCounter,
          parent: data.parent ?? null,
          parentId: data.parent ?? null,
          isThread: () => false,
        };
        channels.set(ch.id, ch);
        return ch;
      },
    },
    roles: {
      cache: roles,
      everyone,
      create: async (data) => {
        const role: FakeRole = {
          id: `${++roleCounter}`,
          name: data.name,
          color: data.color ?? 0,
          position: roleCounter,
          managed: false,
          permissions: { has: () => true, toArray: () => [] },
        };
        roles.set(role.id, role);
        return role;
      },
    },
    members: { me: null },
  };

  return { guild, channels, roles };
}

export function makeFakeBotMember(id = 'bot_1', guildId = 'guild_a'): FakeMember {
  return {
    id,
    guild: { id: guildId },
    user: { bot: true, tag: 'Agent#0000', username: 'Agent' },
    nickname: null,
    permissions: { has: () => true, toArray: () => ['Administrator'] },
    roles: { cache: new Collection() },
  };
}

export function makeFakeUserMember(id = 'owner_user', guildId = 'guild_a'): FakeMember {
  return {
    id,
    guild: { id: guildId },
    user: { bot: false, tag: 'Owner#1234', username: 'Owner' },
    nickname: null,
    permissions: { has: () => true, toArray: () => ['Administrator'] },
    roles: { cache: new Collection() },
  };
}

/** A normal member with no elevated permissions. */
export function makeFakeNormalMember(id = 'random_user', guildId = 'guild_a'): FakeMember {
  return {
    id,
    guild: { id: guildId },
    user: { bot: false, tag: 'Random#0001', username: 'Random' },
    nickname: null,
    permissions: { has: () => false, toArray: () => [] },
    roles: { cache: new Collection() },
  };
}

export function buildTestContext(
  guild: FakeGuild,
  botId: string,
  overrides: Partial<ExecutionContext> = {},
): ExecutionContext {
  const ctx = {
    guildId: guild.id,
    guildName: guild.name,
    channelId: 'chan_1',
    channelName: 'general',
    threadId: null,
    userId: guild.ownerId,
    userName: 'Owner#1234',
    messageId: 'msg_1',
    botId,
    botTag: 'Agent#0000',
    guild: guild as unknown as ExecutionContext['guild'],
    channel: null,
    member: makeFakeUserMember(guild.ownerId, guild.id) as unknown as ExecutionContext['member'],
    author: null,
    message: null,
  };
  return { ...ctx, ...overrides };
}

export function makeTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    discord: { botToken: '', applicationId: '' },
    llm: {
      provider: 'openai',
      apiKey: '',
      model: 'test-model',
      baseUrl: '',
      temperature: 0,
      maxTokens: 512,
    },
    agent: {
      name: 'Agent',
      personality: 'professional',
      defaultMode: 'normal',
      confirmationLevel: 'HIGH',
      maxIterations: 10,
      dryRunDefault: false,
    },
    database: { path: ':memory:' },
    logging: { level: 'silent' },
    features: { moderation: false, automations: true, scheduler: false, slashCommands: false },
    trust: { allowedUserIds: [] },
    limits: { messageRetentionDays: 30, rateLimitMaxConcurrent: 5, cacheTtlSeconds: 300, contextHistoryLimit: 50 },
    ...overrides,
  };
}
