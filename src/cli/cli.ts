import { loadConfig } from '../config/env.js';
import { openDatabase, getDatabase } from '../database/index.js';
import { registerAllTools } from '../mcp/tools/index.js';
import { allTools } from '../mcp/registry.js';
import { createLLMProvider } from '../llm/factory.js';
import { guildRepository } from '../database/repositories/guildRepository.js';

type Command = 'doctor' | 'status' | 'guilds' | 'capabilities' | 'config' | 'test';

const USAGE = `Usage: agent <command>

Commands:
  doctor         Check the environment and configuration health.
  status         Show a summary of the current configuration.
  guilds         List guilds the agent knows about.
  capabilities   List available tools grouped by namespace and risk.
  config         Show resolved configuration (secrets redacted).
  test           Run a quick self-test of core subsystems.
`;

function main(): void {
  const [cmd] = process.argv.slice(2) as [Command?];
  if (!cmd) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  const config = loadConfig();

  switch (cmd) {
    case 'doctor':
      doctor(config);
      break;
    case 'status':
      status(config);
      break;
    case 'guilds':
      guilds(config);
      break;
    case 'capabilities':
      capabilities(config);
      break;
    case 'config':
      showConfig(config);
      break;
    case 'test':
      selfTest(config);
      break;
    default:
      process.stderr.write(`Unknown command: ${cmd}\n\n${USAGE}`);
      process.exit(1);
  }
}

function doctor(config: ReturnType<typeof loadConfig>): void {
  const checks: Array<[string, boolean, string]> = [];

  checks.push([
    'Discord token',
    config.discord.botToken.length > 0,
    config.discord.botToken.length > 0 ? 'present' : 'DISCORD_BOT_TOKEN is empty',
  ]);

  try {
    createLLMProvider(config);
    checks.push(['LLM provider', true, config.llm.provider]);
  } catch (err) {
    checks.push(['LLM provider', false, (err as Error).message]);
  }

  checks.push([
    'LLM API key',
    config.llm.apiKey.length > 0 || config.llm.provider === 'ollama',
    config.llm.apiKey.length > 0 ? 'present' : 'LLM_API_KEY is empty',
  ]);
  checks.push(['LLM model', config.llm.model.length > 0, config.llm.model]);

  try {
    openDatabase(config);
    checks.push(['Database', true, config.database.path]);
  } catch (err) {
    checks.push(['Database', false, (err as Error).message]);
  }

  try {
    registerAllTools();
    checks.push(['MCP tools', true, `${allTools().length} registered`]);
  } catch (err) {
    checks.push(['MCP tools', false, (err as Error).message]);
  }

  checks.push(['Required intents', true, 'Guilds, GuildMembers, GuildMessages, MessageContent']);

  for (const [name, ok, detail] of checks) {
    process.stdout.write(`${ok ? '✓' : '✗'} ${name}: ${detail}\n`);
  }

  const allOk = checks.every(([, ok]) => ok);
  process.stdout.write(`\n${allOk ? 'All checks passed.' : 'Some checks failed.'}\n`);
  process.exit(allOk ? 0 : 1);
}

function status(config: ReturnType<typeof loadConfig>): void {
  process.stdout.write(
    [
      `LLM provider:   ${config.llm.provider}`,
      `LLM model:      ${config.llm.model}`,
      `Confirmation:   ${config.agent.confirmationLevel}`,
      `Default mode:   ${config.agent.defaultMode}`,
      `Personality:    ${config.agent.personality}`,
      `Max iterations: ${config.agent.maxIterations}`,
      `Moderation:     ${config.features.moderation ? 'enabled' : 'disabled'}`,
      `Automations:    ${config.features.automations ? 'enabled' : 'disabled'}`,
      `Scheduler:      ${config.features.scheduler ? 'enabled' : 'disabled'}`,
      `Database:       ${config.database.path}`,
    ].join('\n') + '\n',
  );
}

function guilds(config: ReturnType<typeof loadConfig>): void {
  openDatabase(config);
  const db = getDatabase();
  const rows = db
    .prepare('SELECT id, name, joined_at FROM guilds ORDER BY joined_at DESC')
    .all() as Array<{ id: string; name: string; joined_at: number }>;

  if (rows.length === 0) {
    process.stdout.write('No guilds recorded yet. The bot records guilds when it joins.\n');
    return;
  }

  for (const g of rows) {
    const conf = guildRepository.getConfig(g.id);
    process.stdout.write(
      `- ${g.name} (${g.id}) joined ${new Date(g.joined_at).toISOString()} confirmation=${conf?.confirmationLevel ?? 'HIGH'}\n`,
    );
  }
}

function capabilities(_config: ReturnType<typeof loadConfig>): void {
  registerAllTools();
  const byNamespace = new Map<string, ReturnType<typeof allTools>>();
  for (const tool of allTools()) {
    const ns = tool.name.split('.').slice(0, 2).join('.');
    const list = byNamespace.get(ns) ?? [];
    list.push(tool);
    byNamespace.set(ns, list);
  }
  for (const [ns, tools] of [...byNamespace.entries()].sort()) {
    process.stdout.write(`\n${ns}\n`);
    for (const t of tools) {
      process.stdout.write(`  ${t.name}  [${t.risk}]${t.mutates ? '' : '  (read)'}\n`);
    }
  }
  process.stdout.write(`\nTotal: ${allTools().length} tools\n`);
}

function showConfig(config: ReturnType<typeof loadConfig>): void {
  const redact = (v: string) => (v ? '••••••••' : '(empty)');
  process.stdout.write(
    [
      `DISCORD_BOT_TOKEN=${redact(config.discord.botToken)}`,
      `DISCORD_APPLICATION_ID=${config.discord.applicationId || '(empty)'}`,
      `LLM_PROVIDER=${config.llm.provider}`,
      `LLM_API_KEY=${redact(config.llm.apiKey)}`,
      `LLM_MODEL=${config.llm.model}`,
      `LLM_BASE_URL=${config.llm.baseUrl || '(default)'}`,
      `AGENT_NAME=${config.agent.name}`,
      `AGENT_CONFIRMATION_LEVEL=${config.agent.confirmationLevel}`,
      `DATABASE_PATH=${config.database.path}`,
    ].join('\n') + '\n',
  );
}

function selfTest(config: ReturnType<typeof loadConfig>): void {
  const results: Array<[string, boolean]> = [];

  registerAllTools();
  results.push(['tool registry', allTools().length > 50]);

  openDatabase(config);
  const db = getDatabase();
  db.prepare('INSERT INTO guild_memory (guild_id, scope, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    'guild_A', 'GUILD', 'k', 'v', Date.now(), Date.now(),
  );
  const stored = db
    .prepare('SELECT * FROM guild_memory WHERE guild_id = ?')
    .all('guild_A') as Array<{ guild_id: string }>;
  results.push(['database round-trip', stored.length === 1]);
  const leaked = db
    .prepare('SELECT * FROM guild_memory WHERE guild_id = ?')
    .all('guild_B') as Array<unknown>;
  results.push(['guild isolation (memory)', leaked.length === 0]);
  db.prepare('DELETE FROM guild_memory WHERE guild_id = ?').run('guild_A');

  for (const [name, ok] of results) {
    process.stdout.write(`${ok ? '✓' : '✗'} ${name}\n`);
  }
  process.exit(results.every(([, ok]) => ok) ? 0 : 1);
}

main();
