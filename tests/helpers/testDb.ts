import Database from 'better-sqlite3';
import { migrate, __setDatabaseForTests, resetDatabaseForTests } from '../../src/database/index.js';

/** Creates a fresh in-memory database and installs it as the process-wide DB. */
export function createTestDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  __setDatabaseForTests(db);
  return db;
}

export function resetTestDatabase(db: Database.Database): void {
  resetDatabaseForTests(db);
}
