import { describe, it, expect, afterEach } from 'vitest';
import type { Client } from 'discord.js';
import { resolveGuild, mcpInputSchema } from '../../src/mcp/stdioServer.js';
import type { ToolDescriptor } from '../../src/mcp/types.js';

const tool: ToolDescriptor = {
  name: 'discord.channel.create',
  description: 'Create a channel.',
  inputSchema: {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  },
  risk: 'LOW',
  mutates: true,
  execute: async () => ({ success: true, output: 'ok' }),
};

function fakeClient(guilds: Array<{ id: string; name: string }>): Client {
  const cache = new Map(guilds.map((g) => [g.id, g]));
  return { guilds: { cache } } as unknown as Client;
}

afterEach(() => {
  delete process.env.MCP_DEFAULT_GUILD_ID;
});

describe('mcpInputSchema', () => {
  it('injects guild_id into the tool schema and preserves required', () => {
    const schema = mcpInputSchema(tool);
    expect(schema.type).toBe('object');
    expect((schema.properties as Record<string, unknown>).guild_id).toBeDefined();
    expect((schema.properties as Record<string, unknown>).name).toBeDefined();
    expect(schema.required).toEqual(['name']);
  });
});

describe('resolveGuild', () => {
  it('returns the only guild when the bot is in exactly one', () => {
    const r = resolveGuild(fakeClient([{ id: 'g1', name: 'One' }]), undefined);
    expect('error' in r ? null : (r as { id: string }).id).toBe('g1');
  });

  it('requires a guild_id when the bot is in multiple guilds', () => {
    const r = resolveGuild(fakeClient([{ id: 'g1', name: 'One' }, { id: 'g2', name: 'Two' }]), undefined);
    expect('error' in r).toBe(true);
  });

  it('resolves an explicit guild_id', () => {
    const r = resolveGuild(fakeClient([{ id: 'g1', name: 'One' }, { id: 'g2', name: 'Two' }]), 'g2');
    expect('error' in r ? null : (r as { id: string }).id).toBe('g2');
  });

  it('errors when the guild is not found', () => {
    const r = resolveGuild(fakeClient([{ id: 'g1', name: 'One' }]), 'nope');
    expect('error' in r).toBe(true);
  });
});
