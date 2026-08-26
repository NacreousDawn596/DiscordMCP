import { AgentApp } from './app.js';
import { loadConfig } from './config/env.js';
import { getLogger } from './logging/logger.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = new AgentApp(config);

  const shutdown = async (): Promise<void> => {
    getLogger().info('shutting down');
    await app.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  await app.start();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
