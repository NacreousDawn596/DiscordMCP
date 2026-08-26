import { getDatabase } from '../index.js';

export type MemoryScope = 'GLOBAL' | 'GUILD' | 'CHANNEL' | 'USER';

export interface MemoryRecord {
  id: number;
  guildId: string;
  scope: MemoryScope;
  channelId: string | null;
  userId: string | null;
  key: string;
  value: string;
  createdAt: number;
  updatedAt: number;
}

interface MemoryRow {
  id: number;
  guild_id: string;
  scope: string;
  channel_id: string | null;
  user_id: string | null;
  key: string;
  value: string;
  created_at: number;
  updated_at: number;
}

function rowToRecord(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    guildId: row.guild_id,
    scope: row.scope as MemoryScope,
    channelId: row.channel_id,
    userId: row.user_id,
    key: row.key,
    value: row.value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Adds a WHERE clause for a nullable column. `undefined` means "no filter",
 * `null` means "must be NULL", and a string means "must equal".
 */
function addNullableClause(
  column: string,
  value: string | null | undefined,
  clauses: string[],
  params: Record<string, unknown>,
): void {
  if (value === undefined) return;
  if (value === null) {
    clauses.push(`${column} IS NULL`);
  } else {
    clauses.push(`${column} = @${column}`);
    params[column] = value;
  }
}

export interface MemoryStoreInput {
  guildId: string;
  scope?: MemoryScope;
  channelId?: string | null;
  userId?: string | null;
  key: string;
  value: string;
}

export const memoryRepository = {
  store(input: MemoryStoreInput): MemoryRecord {
    const db = getDatabase();
    const now = Date.now();
    const scope = input.scope ?? 'GUILD';

    const existing = db
      .prepare(
        `SELECT id FROM guild_memory
         WHERE guild_id = @guildId AND scope = @scope
           AND key = @key
           AND COALESCE(channel_id,'') = COALESCE(@channelId,'')
           AND COALESCE(user_id,'') = COALESCE(@userId,'')`,
      )
      .get({
        guildId: input.guildId,
        scope,
        key: input.key,
        channelId: input.channelId ?? null,
        userId: input.userId ?? null,
      }) as { id: number } | undefined;

    if (existing) {
      db.prepare(
        `UPDATE guild_memory SET value = @value, updated_at = @now WHERE id = @id`,
      ).run({ value: input.value, now, id: existing.id });
    } else {
      db.prepare(
        `INSERT INTO guild_memory (guild_id, scope, channel_id, user_id, key, value, created_at, updated_at)
         VALUES (@guildId, @scope, @channelId, @userId, @key, @value, @now, @now)`,
      ).run({
        guildId: input.guildId,
        scope,
        channelId: input.channelId ?? null,
        userId: input.userId ?? null,
        key: input.key,
        value: input.value,
        now,
      });
    }

    return this.get({
      guildId: input.guildId,
      scope,
      channelId: input.channelId ?? null,
      userId: input.userId ?? null,
      key: input.key,
    })!;
  },

  get(filter: {
    guildId: string;
    scope?: MemoryScope;
    channelId?: string | null;
    userId?: string | null;
    key?: string;
  }): MemoryRecord | undefined {
    const clauses: string[] = ['guild_id = @guildId'];
    const params: Record<string, unknown> = { guildId: filter.guildId };

    if (filter.scope) {
      clauses.push('scope = @scope');
      params.scope = filter.scope;
    }
    addNullableClause('channel_id', filter.channelId, clauses, params);
    addNullableClause('user_id', filter.userId, clauses, params);
    if (filter.key) {
      clauses.push('key = @key');
      params.key = filter.key;
    }

    const row = getDatabase()
      .prepare(`SELECT * FROM guild_memory WHERE ${clauses.join(' AND ')} LIMIT 1`)
      .get(params) as MemoryRow | undefined;
    return row ? rowToRecord(row) : undefined;
  },

  list(filter: {
    guildId: string;
    scope?: MemoryScope;
    channelId?: string | null;
    userId?: string | null;
    query?: string;
    limit?: number;
  }): MemoryRecord[] {
    const clauses: string[] = ['guild_id = @guildId'];
    const params: Record<string, unknown> = { guildId: filter.guildId };

    if (filter.scope) {
      clauses.push('scope = @scope');
      params.scope = filter.scope;
    }
    addNullableClause('channel_id', filter.channelId, clauses, params);
    addNullableClause('user_id', filter.userId, clauses, params);
    if (filter.query) {
      clauses.push('(key LIKE @query OR value LIKE @query)');
      params.query = `%${filter.query}%`;
    }

    const limit = filter.limit ?? 100;
    const rows = getDatabase()
      .prepare(
        `SELECT * FROM guild_memory WHERE ${clauses.join(' AND ')}
         ORDER BY updated_at DESC LIMIT @limit`,
      )
      .all({ ...params, limit }) as MemoryRow[];
    return rows.map(rowToRecord);
  },

  update(
    id: number,
    guildId: string,
    value: string,
  ): MemoryRecord | undefined {
    const db = getDatabase();
    db.prepare(
      'UPDATE guild_memory SET value = @value, updated_at = @now WHERE id = @id AND guild_id = @guildId',
    ).run({ value, now: Date.now(), id, guildId });

    const row = db
      .prepare('SELECT * FROM guild_memory WHERE id = ? AND guild_id = ?')
      .get(id, guildId) as MemoryRow | undefined;
    return row ? rowToRecord(row) : undefined;
  },

  delete(id: number, guildId: string): boolean {
    const result = getDatabase()
      .prepare('DELETE FROM guild_memory WHERE id = @id AND guild_id = @guildId')
      .run({ id, guildId });
    return result.changes > 0;
  },
};
