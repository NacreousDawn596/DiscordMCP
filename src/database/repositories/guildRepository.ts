import type { Database } from 'better-sqlite3';
import { getDatabase } from '../index.js';
import type { ConfirmationLevel, Persona } from '../../config/env.js';

export interface GuildRow {
  id: string;
  name: string;
  owner_id: string | null;
  joined_at: number;
  raw_settings: string;
}

export interface GuildConfigRow {
  guild_id: string;
  agent_name: string | null;
  personality: string;
  model: string | null;
  confirmation_level: string;
  default_mode: string;
  allowed_channels: string;
  blocked_channels: string;
  allowed_roles: string;
  blocked_roles: string;
  enabled_capabilities: string;
  moderation_enabled: number;
  logging_enabled: number;
  memory_enabled: number;
  automations_enabled: number;
  updated_at: number;
}

export interface GuildConfig {
  guildId: string;
  agentName: string | null;
  personality: Persona;
  model: string | null;
  confirmationLevel: ConfirmationLevel;
  defaultMode: string;
  allowedChannels: string[];
  blockedChannels: string[];
  allowedRoles: string[];
  blockedRoles: string[];
  enabledCapabilities: string[];
  moderationEnabled: boolean;
  loggingEnabled: boolean;
  memoryEnabled: boolean;
  automationsEnabled: boolean;
}

function parseJsonList(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function rowToConfig(row: GuildConfigRow): GuildConfig {
  return {
    guildId: row.guild_id,
    agentName: row.agent_name,
    personality: (row.personality as Persona) ?? 'professional',
    model: row.model,
    confirmationLevel: (row.confirmation_level as ConfirmationLevel) ?? 'HIGH',
    defaultMode: row.default_mode ?? 'normal',
    allowedChannels: parseJsonList(row.allowed_channels),
    blockedChannels: parseJsonList(row.blocked_channels),
    allowedRoles: parseJsonList(row.allowed_roles),
    blockedRoles: parseJsonList(row.blocked_roles),
    enabledCapabilities: parseJsonList(row.enabled_capabilities),
    moderationEnabled: row.moderation_enabled === 1,
    loggingEnabled: row.logging_enabled === 1,
    memoryEnabled: row.memory_enabled === 1,
    automationsEnabled: row.automations_enabled === 1,
  };
}

export const guildRepository = {
  upsertGuild(guild: { id: string; name: string; ownerId: string | null }): void {
    const db = getDatabase();
    db.prepare(
      `INSERT INTO guilds (id, name, owner_id, joined_at, raw_settings)
       VALUES (@id, @name, @ownerId, @now, '{}')
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, owner_id = excluded.owner_id`,
    ).run({ id: guild.id, name: guild.name, ownerId: guild.ownerId, now: Date.now() });
  },

  getGuild(guildId: string): GuildRow | undefined {
    return getDatabase()
      .prepare('SELECT * FROM guilds WHERE id = ?')
      .get(guildId) as GuildRow | undefined;
  },

  getConfig(guildId: string): GuildConfig | undefined {
    const row = getDatabase()
      .prepare('SELECT * FROM guild_config WHERE guild_id = ?')
      .get(guildId) as GuildConfigRow | undefined;
    return row ? rowToConfig(row) : undefined;
  },

  ensureConfig(guildId: string): GuildConfig {
    const existing = this.getConfig(guildId);
    if (existing) return existing;

    getDatabase()
      .prepare(
        `INSERT INTO guild_config (guild_id, agent_name, personality, model, confirmation_level,
           default_mode, allowed_channels, blocked_channels, allowed_roles, blocked_roles,
           enabled_capabilities, moderation_enabled, logging_enabled, memory_enabled,
           automations_enabled, updated_at)
         VALUES (@guildId, NULL, 'professional', NULL, 'HIGH', 'normal', '[]', '[]', '[]', '[]',
           '[]', 0, 1, 1, 1, @now)`,
      )
      .run({ guildId, now: Date.now() });

    return this.getConfig(guildId)!;
  },

  updateConfig(guildId: string, patch: Partial<GuildConfig>): GuildConfig {
    const current = this.ensureConfig(guildId);
    const merged: GuildConfig = { ...current, ...patch };

    getDatabase()
      .prepare(
        `UPDATE guild_config SET
           agent_name = @agentName,
           personality = @personality,
           model = @model,
           confirmation_level = @confirmationLevel,
           default_mode = @defaultMode,
           allowed_channels = @allowedChannels,
           blocked_channels = @blockedChannels,
           allowed_roles = @allowedRoles,
           blocked_roles = @blockedRoles,
           enabled_capabilities = @enabledCapabilities,
           moderation_enabled = @moderationEnabled,
           logging_enabled = @loggingEnabled,
           memory_enabled = @memoryEnabled,
           automations_enabled = @automationsEnabled,
           updated_at = @now
         WHERE guild_id = @guildId`,
      )
      .run({
        guildId,
        agentName: merged.agentName,
        personality: merged.personality,
        model: merged.model,
        confirmationLevel: merged.confirmationLevel,
        defaultMode: merged.defaultMode,
        allowedChannels: JSON.stringify(merged.allowedChannels),
        blockedChannels: JSON.stringify(merged.blockedChannels),
        allowedRoles: JSON.stringify(merged.allowedRoles),
        blockedRoles: JSON.stringify(merged.blockedRoles),
        enabledCapabilities: JSON.stringify(merged.enabledCapabilities),
        moderationEnabled: merged.moderationEnabled ? 1 : 0,
        loggingEnabled: merged.loggingEnabled ? 1 : 0,
        memoryEnabled: merged.memoryEnabled ? 1 : 0,
        automationsEnabled: merged.automationsEnabled ? 1 : 0,
        now: Date.now(),
      });

    return merged;
  },
};
