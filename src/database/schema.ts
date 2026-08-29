export interface Migration {
  version: number;
  name: string;
  up: string;
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial-schema',
    up: `
      CREATE TABLE IF NOT EXISTS guilds (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        owner_id TEXT,
        joined_at INTEGER NOT NULL,
        raw_settings TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS guild_config (
        guild_id TEXT PRIMARY KEY,
        agent_name TEXT,
        personality TEXT NOT NULL DEFAULT 'professional',
        model TEXT,
        confirmation_level TEXT NOT NULL DEFAULT 'HIGH',
        default_mode TEXT NOT NULL DEFAULT 'normal',
        allowed_channels TEXT NOT NULL DEFAULT '[]',
        blocked_channels TEXT NOT NULL DEFAULT '[]',
        allowed_roles TEXT NOT NULL DEFAULT '[]',
        blocked_roles TEXT NOT NULL DEFAULT '[]',
        enabled_capabilities TEXT NOT NULL DEFAULT '[]',
        moderation_enabled INTEGER NOT NULL DEFAULT 0,
        logging_enabled INTEGER NOT NULL DEFAULT 1,
        memory_enabled INTEGER NOT NULL DEFAULT 1,
        automations_enabled INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS guild_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'GUILD',
        channel_id TEXT,
        user_id TEXT,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_guild_memory_guild ON guild_memory(guild_id);
      CREATE INDEX IF NOT EXISTS idx_guild_memory_scope ON guild_memory(guild_id, scope);

      CREATE TABLE IF NOT EXISTS users (
        id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        username TEXT NOT NULL DEFAULT '',
        last_seen INTEGER NOT NULL,
        PRIMARY KEY (id, guild_id)
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT,
        thread_id TEXT,
        user_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_guild ON conversations(guild_id);

      CREATE TABLE IF NOT EXISTS messages_context (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        channel_id TEXT,
        user_id TEXT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_context_conv ON messages_context(conversation_id);

      CREATE TABLE IF NOT EXISTS automations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        trigger TEXT NOT NULL,
        conditions TEXT NOT NULL DEFAULT '[]',
        action TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_by TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_automations_guild ON automations(guild_id);

      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        cron TEXT NOT NULL,
        action TEXT NOT NULL,
        channel_id TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_by TEXT,
        created_at INTEGER NOT NULL,
        last_run_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_guild ON scheduled_tasks(guild_id);

      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT,
        channel_id TEXT,
        request TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'normal',
        plan TEXT,
        tools_used TEXT NOT NULL DEFAULT '[]',
        actions TEXT NOT NULL DEFAULT '[]',
        result TEXT,
        duration_ms INTEGER,
        success INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_runs_guild ON agent_runs(guild_id);

      CREATE TABLE IF NOT EXISTS agent_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT,
        guild_id TEXT NOT NULL,
        tool TEXT NOT NULL,
        input_summary TEXT NOT NULL DEFAULT '',
        target TEXT NOT NULL DEFAULT '',
        permission_check TEXT NOT NULL DEFAULT '',
        risk TEXT NOT NULL DEFAULT 'READ',
        result TEXT NOT NULL DEFAULT '',
        success INTEGER NOT NULL DEFAULT 0,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_actions_guild ON agent_actions(guild_id);
      CREATE INDEX IF NOT EXISTS idx_agent_actions_run ON agent_actions(run_id);

      CREATE TABLE IF NOT EXISTS audit_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT,
        action TEXT NOT NULL,
        target TEXT NOT NULL DEFAULT '',
        detail TEXT NOT NULL DEFAULT '',
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_records_guild ON audit_records(guild_id);
    `,
  },
  {
    version: 2,
    name: 'guild-notebook',
    up: `
      CREATE TABLE IF NOT EXISTS guild_notebook (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'default',
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        member_id TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(guild_id, category, key, member_id)
      );
      CREATE INDEX IF NOT EXISTS idx_guild_notebook_lookup ON guild_notebook(guild_id, category, key);
      CREATE INDEX IF NOT EXISTS idx_guild_notebook_member ON guild_notebook(guild_id, member_id);
    `,
  },
];

