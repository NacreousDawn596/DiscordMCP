import 'dotenv/config';
import { z } from 'zod';

export const RiskLevels = ['READ', 'LOW', 'MEDIUM', 'HIGH', 'DESTRUCTIVE'] as const;
export type RiskLevel = (typeof RiskLevels)[number];

export const ConfirmationLevels = ['NEVER', 'LOW', 'MEDIUM', 'HIGH', 'DESTRUCTIVE', 'ALWAYS'] as const;
export type ConfirmationLevel = (typeof ConfirmationLevels)[number];

export const AgentModes = ['normal', 'planning', 'admin', 'moderation', 'analysis'] as const;
export type AgentMode = (typeof AgentModes)[number];

/**
 * User IDs that are always globally trusted, regardless of configuration.
 * These users can command the bot to use all of the bot's own permissions,
 * independent of the user's personal Discord permissions. They still cannot
 * bypass the bot's permissions, enabled capabilities, or safety policy.
 */
export const BUILT_IN_TRUSTED_USER_IDS: readonly string[] = ['778627103578783776'];

export const Personas = ['professional', 'friendly', 'technical', 'minimal', 'funny', 'custom'] as const;
export type Persona = (typeof Personas)[number];

const envSchema = z.object({
  // Discord
  DISCORD_BOT_TOKEN: z.string().optional().default(''),
  DISCORD_APPLICATION_ID: z.string().optional().default(''),

  // LLM
  LLM_PROVIDER: z.string().optional().default('openai'),
  LLM_API_KEY: z.string().optional().default(''),
  LLM_MODEL: z.string().optional().default('gpt-4o-mini'),
  LLM_BASE_URL: z.string().optional().default(''),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).optional().default(0.2),
  LLM_MAX_TOKENS: z.coerce.number().int().positive().optional().default(2048),

  // Agent behavior
  AGENT_NAME: z.string().optional().default('Agent'),
  AGENT_PERSONALITY: z.enum(Personas).optional().default('professional'),
  AGENT_DEFAULT_MODE: z.enum(AgentModes).optional().default('normal'),
  AGENT_CONFIRMATION_LEVEL: z.enum(ConfirmationLevels).optional().default('HIGH'),
  AGENT_MAX_ITERATIONS: z.coerce.number().int().positive().optional().default(15),
  AGENT_DRY_RUN_DEFAULT: z
    .string()
    .optional()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  // Database
  DATABASE_PATH: z.string().optional().default('./data/agent.sqlite'),

  // Observability
  LOG_LEVEL: z.string().optional().default('info'),

  // Feature toggles
  ENABLE_MODERATION: z
    .string()
    .optional()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  ENABLE_AUTOMATIONS: z
    .string()
    .optional()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
  ENABLE_SCHEDULER: z
    .string()
    .optional()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
  ENABLE_SLASH_COMMANDS: z
    .string()
    .optional()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  // Global trust overrides (comma separated user IDs that bypass guild-level authorization)
  ALLOWED_USER_IDS: z.string().optional().default(''),

  // Retention / limits
  MESSAGE_RETENTION_DAYS: z.coerce.number().int().positive().optional().default(30),
  RATE_LIMIT_MAX_CONCURRENT: z.coerce.number().int().positive().optional().default(5),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().optional().default(300),
  CONTEXT_HISTORY_LIMIT: z.coerce.number().int().positive().optional().default(50),
});

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  discord: {
    botToken: string;
    applicationId: string;
  };
  llm: {
    provider: string;
    apiKey: string;
    model: string;
    baseUrl: string;
    temperature: number;
    maxTokens: number;
  };
  agent: {
    name: string;
    personality: Persona;
    defaultMode: AgentMode;
    confirmationLevel: ConfirmationLevel;
    maxIterations: number;
    dryRunDefault: boolean;
  };
  database: {
    path: string;
  };
  logging: {
    level: string;
  };
  features: {
    moderation: boolean;
    automations: boolean;
    scheduler: boolean;
    slashCommands: boolean;
  };
  trust: {
    allowedUserIds: string[];
  };
  limits: {
    messageRetentionDays: number;
    rateLimitMaxConcurrent: number;
    cacheTtlSeconds: number;
    contextHistoryLimit: number;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);

  return {
    discord: {
      botToken: parsed.DISCORD_BOT_TOKEN,
      applicationId: parsed.DISCORD_APPLICATION_ID,
    },
    llm: {
      provider: parsed.LLM_PROVIDER,
      apiKey: parsed.LLM_API_KEY,
      model: parsed.LLM_MODEL,
      baseUrl: parsed.LLM_BASE_URL,
      temperature: parsed.LLM_TEMPERATURE,
      maxTokens: parsed.LLM_MAX_TOKENS,
    },
    agent: {
      name: parsed.AGENT_NAME,
      personality: parsed.AGENT_PERSONALITY,
      defaultMode: parsed.AGENT_DEFAULT_MODE,
      confirmationLevel: parsed.AGENT_CONFIRMATION_LEVEL,
      maxIterations: parsed.AGENT_MAX_ITERATIONS,
      dryRunDefault: parsed.AGENT_DRY_RUN_DEFAULT,
    },
    database: {
      path: parsed.DATABASE_PATH,
    },
    logging: {
      level: parsed.LOG_LEVEL,
    },
    features: {
      moderation: parsed.ENABLE_MODERATION,
      automations: parsed.ENABLE_AUTOMATIONS,
      scheduler: parsed.ENABLE_SCHEDULER,
      slashCommands: parsed.ENABLE_SLASH_COMMANDS,
    },
    trust: {
      allowedUserIds: [
        ...new Set([
          ...parsed.ALLOWED_USER_IDS.split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          ...BUILT_IN_TRUSTED_USER_IDS,
        ]),
      ],
    },
    limits: {
      messageRetentionDays: parsed.MESSAGE_RETENTION_DAYS,
      rateLimitMaxConcurrent: parsed.RATE_LIMIT_MAX_CONCURRENT,
      cacheTtlSeconds: parsed.CACHE_TTL_SECONDS,
      contextHistoryLimit: parsed.CONTEXT_HISTORY_LIMIT,
    },
  };
}
