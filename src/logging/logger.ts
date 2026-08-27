import pino from 'pino';
import type { AppConfig } from '../config/env.js';

let logger: pino.Logger | undefined;

/**
 * @param destination Where logs are written. Defaults to stdout, but stdio MCP
 *   servers must pass `process.stderr` so the stdout channel stays clean for
 *   protocol messages.
 */
export function initLogger(config: AppConfig, destination?: NodeJS.WritableStream): pino.Logger {
  if (logger) return logger;
  logger = pino(
    {
      level: config.logging.level,
      base: { service: 'discord-agent' },
      redact: {
        paths: [
          'discordBotToken',
          'apiKey',
          'token',
          'botToken',
          'DISCORD_BOT_TOKEN',
          'LLM_API_KEY',
        ],
        censor: '[REDACTED]',
      },
    },
    destination ?? process.stdout,
  );
  return logger;
}

export function getLogger(): pino.Logger {
  if (!logger) {
    const level = process.env.NODE_ENV === 'test' ? 'silent' : 'info';
    logger = pino({ level, base: { service: 'discord-agent' } });
  }
  return logger;
}

export function childLogger(bindings: Record<string, unknown>): pino.Logger {
  return getLogger().child(bindings);
}
