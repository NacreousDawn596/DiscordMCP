import pino from 'pino';
import type { AppConfig } from '../config/env.js';

let logger: pino.Logger | undefined;

export function initLogger(config: AppConfig): pino.Logger {
  if (logger) return logger;
  logger = pino({
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
  });
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
