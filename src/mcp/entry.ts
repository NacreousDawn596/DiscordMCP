import { loadConfig } from '../config/env.js';
import { initLogger, getLogger } from '../logging/logger.js';
import { openDatabase } from '../database/index.js';
import { guildRepository } from '../database/repositories/guildRepository.js';
import { createClient } from '../discord/client.js';
import { createExecutor } from './executor.js';
import { registerAllTools } from './tools/index.js';
import { runStdioServer } from './stdioServer.js';

/**
 * MCP stdio entrypoint. Boots the Discord client (same token) and serves the
 * `discord.*` tools over stdin/stdout for MCP clients like opencode.
 *
 * NOTE: logs go to stderr so stdout stays clean for protocol messages.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  initLogger(config, process.stderr);
  openDatabase(config);
  registerAllTools();

  if (!config.discord.botToken) {
    getLogger().error('DISCORD_BOT_TOKEN is empty — cannot serve MCP tools.');
    process.exit(1);
  }

  const client = createClient(config);
  await client.login(config.discord.botToken);
  getLogger().info({ tag: client.user?.tag }, 'MCP entry: bot logged in');

  const executor = createExecutor({
    config,
    getGuildConfig: (guildId) => guildRepository.ensureConfig(guildId),
  });

  await runStdioServer(client, executor);
}

main().catch((err) => {
  // Must not write to stdout — the MCP transport owns it.
  process.stderr.write(`MCP server fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
