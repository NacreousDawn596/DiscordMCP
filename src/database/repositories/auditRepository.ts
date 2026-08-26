import { getDatabase } from '../index.js';

export interface AuditInput {
  guildId: string;
  userId: string | null;
  action: string;
  target: string;
  detail: string;
}

export const auditRepository = {
  record(input: AuditInput): void {
    getDatabase()
      .prepare(
        `INSERT INTO audit_records (guild_id, user_id, action, target, detail, timestamp)
         VALUES (@guildId, @userId, @action, @target, @detail, @now)`,
      )
      .run({ ...input, now: Date.now() });
  },

  list(guildId: string, limit = 100): Array<Record<string, unknown>> {
    return getDatabase()
      .prepare(
        'SELECT * FROM audit_records WHERE guild_id = ? ORDER BY timestamp DESC LIMIT ?',
      )
      .all(guildId, limit) as Array<Record<string, unknown>>;
  },
};
