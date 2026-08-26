import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { AppConfig } from '../config/env.js';
import { getLogger } from '../logging/logger.js';
import { migrations } from './schema.js';

export type Database = Database.Database;

let db: Database | undefined;

export function openDatabase(config: AppConfig): Database {
  if (db) return db;

  const path = resolve(config.database.path);
  mkdirSync(dirname(path), { recursive: true });

  db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  migrate(db);
  getLogger().info({ path }, 'database opened');
  return db;
}

export function getDatabase(): Database {
  if (!db) throw new Error('Database not initialized. Call openDatabase() first.');
  return db;
}

export function migrate(database: Database): void {
  const current = database.pragma('user_version', { simple: true }) as number;

  const pending = migrations
    .filter((m) => m.version > current)
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    const run = database.transaction(() => {
      database.exec(migration.up);
      database.pragma(`user_version = ${migration.version}`);
    });
    run();
    getLogger().info({ version: migration.version, name: migration.name }, 'migration applied');
  }
}

export function resetDatabaseForTests(database: Database): void {
  const tables = [
    'audit_records',
    'agent_actions',
    'agent_runs',
    'scheduled_tasks',
    'automations',
    'messages_context',
    'conversations',
    'users',
    'guild_memory',
    'guild_config',
    'guilds',
  ];
  for (const table of tables) {
    database.exec(`DELETE FROM ${table}`);
  }
}

/** Test hook: swap the process-wide database for an in-memory instance. */
export function __setDatabaseForTests(database: Database): void {
  db = database;
}
