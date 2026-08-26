import { getDatabase } from '../index.js';

export interface AutomationRecord {
  id: number;
  guildId: string;
  trigger: string;
  conditions: string;
  action: string;
  enabled: boolean;
  createdBy: string | null;
  createdAt: number;
}

export interface ScheduledTaskRecord {
  id: number;
  guildId: string;
  cron: string;
  action: string;
  channelId: string | null;
  enabled: boolean;
  createdBy: string | null;
  createdAt: number;
  lastRunAt: number | null;
}

export interface AutomationInput {
  guildId: string;
  trigger: string;
  conditions: unknown[];
  action: unknown;
  createdBy: string | null;
}

export interface ScheduledTaskInput {
  guildId: string;
  cron: string;
  action: unknown;
  channelId: string | null;
  createdBy: string | null;
}

export const automationRepository = {
  createAutomation(input: AutomationInput): AutomationRecord {
    const db = getDatabase();
    const result = db
      .prepare(
        `INSERT INTO automations (guild_id, trigger, conditions, action, enabled, created_by, created_at)
         VALUES (@guildId, @trigger, @conditions, @action, 1, @createdBy, @now)`,
      )
      .run({
        guildId: input.guildId,
        trigger: input.trigger,
        conditions: JSON.stringify(input.conditions),
        action: JSON.stringify(input.action),
        createdBy: input.createdBy,
        now: Date.now(),
      });

    const row = db
      .prepare('SELECT * FROM automations WHERE id = ?')
      .get(result.lastInsertRowid) as Record<string, unknown>;
    return this.rowToAutomation(row);
  },

  rowToAutomation(row: Record<string, unknown>): AutomationRecord {
    return {
      id: row.id as number,
      guildId: row.guild_id as string,
      trigger: row.trigger as string,
      conditions: row.conditions as string,
      action: row.action as string,
      enabled: (row.enabled as number) === 1,
      createdBy: row.created_by as string | null,
      createdAt: row.created_at as number,
    };
  },

  listAutomations(guildId: string, trigger?: string): AutomationRecord[] {
    const rows = trigger
      ? getDatabase()
          .prepare(
            'SELECT * FROM automations WHERE guild_id = ? AND trigger = ? AND enabled = 1 ORDER BY created_at ASC',
          )
          .all(guildId, trigger)
      : getDatabase()
          .prepare('SELECT * FROM automations WHERE guild_id = ? ORDER BY created_at ASC')
          .all(guildId);

    return (rows as Array<Record<string, unknown>>).map((r) => this.rowToAutomation(r));
  },

  setEnabled(guildId: string, id: number, enabled: boolean): void {
    getDatabase()
      .prepare('UPDATE automations SET enabled = @enabled WHERE id = @id AND guild_id = @guildId')
      .run({ enabled: enabled ? 1 : 0, id, guildId });
  },

  deleteAutomation(guildId: string, id: number): boolean {
    const result = getDatabase()
      .prepare('DELETE FROM automations WHERE id = @id AND guild_id = @guildId')
      .run({ id, guildId });
    return result.changes > 0;
  },

  // ----- scheduled tasks -----

  createScheduledTask(input: ScheduledTaskInput): ScheduledTaskRecord {
    const db = getDatabase();
    const result = db
      .prepare(
        `INSERT INTO scheduled_tasks (guild_id, cron, action, channel_id, enabled, created_by, created_at)
         VALUES (@guildId, @cron, @action, @channelId, 1, @createdBy, @now)`,
      )
      .run({
        guildId: input.guildId,
        cron: input.cron,
        action: JSON.stringify(input.action),
        channelId: input.channelId,
        createdBy: input.createdBy,
        now: Date.now(),
      });

    const row = db
      .prepare('SELECT * FROM scheduled_tasks WHERE id = ?')
      .get(result.lastInsertRowid) as Record<string, unknown>;
    return this.rowToScheduledTask(row);
  },

  rowToScheduledTask(row: Record<string, unknown>): ScheduledTaskRecord {
    return {
      id: row.id as number,
      guildId: row.guild_id as string,
      cron: row.cron as string,
      action: row.action as string,
      channelId: row.channel_id as string | null,
      enabled: (row.enabled as number) === 1,
      createdBy: row.created_by as string | null,
      createdAt: row.created_at as number,
      lastRunAt: row.last_run_at as number | null,
    };
  },

  listScheduledTasks(guildId?: string): ScheduledTaskRecord[] {
    const rows = guildId
      ? getDatabase()
          .prepare('SELECT * FROM scheduled_tasks WHERE guild_id = ? ORDER BY created_at ASC')
          .all(guildId)
      : getDatabase().prepare('SELECT * FROM scheduled_tasks ORDER BY created_at ASC').all();

    return (rows as Array<Record<string, unknown>>).map((r) => this.rowToScheduledTask(r));
  },

  setScheduledEnabled(guildId: string, id: number, enabled: boolean): void {
    getDatabase()
      .prepare(
        'UPDATE scheduled_tasks SET enabled = @enabled WHERE id = @id AND guild_id = @guildId',
      )
      .run({ enabled: enabled ? 1 : 0, id, guildId });
  },

  deleteScheduledTask(guildId: string, id: number): boolean {
    const result = getDatabase()
      .prepare('DELETE FROM scheduled_tasks WHERE id = @id AND guild_id = @guildId')
      .run({ id, guildId });
    return result.changes > 0;
  },

  touchScheduledTask(guildId: string, id: number): void {
    getDatabase()
      .prepare('UPDATE scheduled_tasks SET last_run_at = @now WHERE id = @id AND guild_id = @guildId')
      .run({ now: Date.now(), id, guildId });
  },
};
