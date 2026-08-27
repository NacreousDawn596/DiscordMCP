import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import type { Client, Guild } from 'discord.js';
import { getLogger } from '../logging/logger.js';
import { allTools, resolveTool, toLLMSafeName } from './registry.js';
import { syntheticExecutionContext } from '../agent/context/contextManager.js';
import type { ToolDescriptor } from './types.js';
import type { ToolExecutor } from './executor.js';
import type { JsonSchema } from '../llm/types.js';

/**
 * Resolves which guild a tool call targets. An explicit `guild_id` argument
 * wins, then MCP_DEFAULT_GUILD_ID, then a sole guild, otherwise an error.
 */
export function resolveGuild(client: Client, guildId?: string): Guild | { error: string } {
  const id = guildId ?? process.env.MCP_DEFAULT_GUILD_ID;
  if (id) {
    const guild = client.guilds.cache.get(id);
    if (guild) return guild;
    return { error: `Guild not found: ${id}. ${describeGuilds(client)}` };
  }
  if (client.guilds.cache.size === 1) {
    return [...client.guilds.cache.values()][0]!;
  }
  return {
    error: `No guild_id specified. ${describeGuilds(client)}`,
  };
}

function describeGuilds(client: Client): string {
  const list = [...client.guilds.cache.values()].map((g) => `${g.name} (${g.id})`).join(', ');
  return list ? `Available guilds: ${list}` : 'The bot is in no guilds.';
}

export function mcpInputSchema(tool: ToolDescriptor): JsonSchema {
  const properties = {
    guild_id: {
      type: 'string',
      description:
        'Target server (guild) ID to operate on. Defaults to MCP_DEFAULT_GUILD_ID, then the only guild if the bot is in exactly one.',
    },
    ...(tool.inputSchema.properties ?? {}),
  };
  const required = tool.inputSchema.required as string[] | undefined;
  return { type: 'object', properties, ...(required ? { required } : {}) };
}

/**
 * Starts an MCP stdio server that exposes the `discord.*` tool suite to any
 * MCP client (opencode, Claude Code, Cursor, …).
 *
 * MCP calls run as the bot itself (admin context): they are scoped to the
 * resolved guild, subject to the bot's own permissions and enabled
 * capabilities, and confirmation is bypassed (there is no interactive user).
 */
export async function runStdioServer(client: Client, executor: ToolExecutor): Promise<void> {
  const server = new Server(
    { name: 'discord-agent', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = allTools().map((tool) => ({
      name: toLLMSafeName(tool.name),
      description: tool.description,
      inputSchema: mcpInputSchema(tool),
    }));
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const rawArgs = (request.params.arguments ?? {}) as Record<string, unknown>;
    const guildId = typeof rawArgs.guild_id === 'string' ? rawArgs.guild_id : undefined;

    const resolved = resolveGuild(client, guildId);
    if ('error' in resolved) {
      return { content: [{ type: 'text' as const, text: resolved.error }], isError: true };
    }

    const ctx = syntheticExecutionContext(client, resolved, null);
    const args = { ...rawArgs };
    delete args.guild_id;

    const result = await executor(ctx, request.params.name, args, {
      mode: 'execute',
      preApproved: true,
    });

    const content: CallToolResult['content'] = [{ type: 'text', text: result.output }];
    return { content, isError: !result.success };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  getLogger().info({ tools: allTools().length }, 'MCP stdio server ready');
}
