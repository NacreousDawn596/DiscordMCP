import { getDatabase } from '../index.js';

export interface NotebookEntry {
  id: number;
  guildId: string;
  category: string;
  key: string;
  value: string;
  memberId: string | null;
  metadata: string;
  createdAt: number;
  updatedAt: number;
}

export class NotebookRepository {
  setEntry(opts: {
    guildId: string;
    category?: string;
    key: string;
    value: unknown;
    memberId?: string | null;
    metadata?: Record<string, unknown>;
  }): NotebookEntry {
    const db = getDatabase();
    const category = (opts.category ?? 'default').trim().toLowerCase();
    const key = opts.key.trim();
    const memberId = opts.memberId ? opts.memberId.trim() : null;
    const valueStr = typeof opts.value === 'string' ? opts.value : JSON.stringify(opts.value);
    const metadataStr = opts.metadata ? JSON.stringify(opts.metadata) : '{}';
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO guild_notebook (guild_id, category, key, value, member_id, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, category, key, member_id) DO UPDATE SET
        value = excluded.value,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
      RETURNING *
    `);

    const row = stmt.get(
      opts.guildId,
      category,
      key,
      valueStr,
      memberId,
      metadataStr,
      now,
      now,
    ) as Record<string, unknown>;

    return this.mapRow(row);
  }

  getEntry(opts: {
    guildId: string;
    category?: string;
    key: string;
    memberId?: string | null;
  }): NotebookEntry | null {
    const db = getDatabase();
    const category = (opts.category ?? 'default').trim().toLowerCase();
    const key = opts.key.trim();
    const memberId = opts.memberId ? opts.memberId.trim() : null;

    let stmt;
    let row;
    if (memberId) {
      stmt = db.prepare(`
        SELECT * FROM guild_notebook
        WHERE guild_id = ? AND category = ? AND key = ? AND member_id = ?
      `);
      row = stmt.get(opts.guildId, category, key, memberId);
    } else {
      stmt = db.prepare(`
        SELECT * FROM guild_notebook
        WHERE guild_id = ? AND category = ? AND key = ? AND member_id IS NULL
      `);
      row = stmt.get(opts.guildId, category, key);
    }

    return row ? this.mapRow(row as Record<string, unknown>) : null;
  }

  updateEntry(opts: {
    guildId: string;
    category?: string;
    key: string;
    memberId?: string | null;
    operation: 'set' | 'increment' | 'push' | 'merge';
    value: unknown;
  }): NotebookEntry {
    const existing = this.getEntry(opts);
    let nextValue: unknown;

    if (opts.operation === 'increment') {
      const delta = Number(opts.value) || 1;
      let currentNum = 0;
      if (existing) {
        try {
          currentNum = Number(existing.value) || Number(JSON.parse(existing.value)) || 0;
        } catch {
          currentNum = Number(existing.value) || 0;
        }
      }
      nextValue = currentNum + delta;
    } else if (opts.operation === 'push') {
      let currentArr: unknown[] = [];
      if (existing) {
        try {
          const parsed = JSON.parse(existing.value);
          if (Array.isArray(parsed)) currentArr = parsed;
          else currentArr = [parsed];
        } catch {
          currentArr = [existing.value];
        }
      }
      currentArr.push(opts.value);
      nextValue = currentArr;
    } else if (opts.operation === 'merge') {
      let currentObj: Record<string, unknown> = {};
      if (existing) {
        try {
          const parsed = JSON.parse(existing.value);
          if (typeof parsed === 'object' && parsed !== null) currentObj = parsed as Record<string, unknown>;
        } catch {
          // ignore
        }
      }
      const updateObj = typeof opts.value === 'object' && opts.value !== null ? opts.value : {};
      nextValue = { ...currentObj, ...updateObj };
    } else {
      nextValue = opts.value;
    }

    return this.setEntry({
      guildId: opts.guildId,
      category: opts.category,
      key: opts.key,
      value: nextValue,
      memberId: opts.memberId,
    });
  }

  queryEntries(opts: {
    guildId: string;
    category?: string;
    keyPattern?: string;
    memberId?: string | null;
    limit?: number;
  }): NotebookEntry[] {
    const db = getDatabase();
    const limit = Math.min(Number(opts.limit) || 50, 200);
    const params: unknown[] = [opts.guildId];
    const whereClauses: string[] = ['guild_id = ?'];

    if (opts.category) {
      whereClauses.push('category = ?');
      params.push(opts.category.trim().toLowerCase());
    }

    if (opts.keyPattern) {
      whereClauses.push('key LIKE ?');
      params.push(`%${opts.keyPattern.trim()}%`);
    }

    if (opts.memberId !== undefined) {
      if (opts.memberId === null) {
        whereClauses.push('member_id IS NULL');
      } else {
        whereClauses.push('member_id = ?');
        params.push(opts.memberId.trim());
      }
    }

    params.push(limit);

    const query = `
      SELECT * FROM guild_notebook
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT ?
    `;

    const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
    return rows.map((r) => this.mapRow(r));
  }

  deleteEntry(opts: {
    guildId: string;
    category?: string;
    key: string;
    memberId?: string | null;
  }): boolean {
    const db = getDatabase();
    const category = (opts.category ?? 'default').trim().toLowerCase();
    const key = opts.key.trim();
    const memberId = opts.memberId ? opts.memberId.trim() : null;

    let stmt;
    let res;
    if (memberId) {
      stmt = db.prepare(`
        DELETE FROM guild_notebook
        WHERE guild_id = ? AND category = ? AND key = ? AND member_id = ?
      `);
      res = stmt.run(opts.guildId, category, key, memberId);
    } else {
      stmt = db.prepare(`
        DELETE FROM guild_notebook
        WHERE guild_id = ? AND category = ? AND key = ? AND member_id IS NULL
      `);
      res = stmt.run(opts.guildId, category, key);
    }

    return res.changes > 0;
  }

  private mapRow(row: Record<string, unknown>): NotebookEntry {
    return {
      id: Number(row.id),
      guildId: String(row.guild_id),
      category: String(row.category),
      key: String(row.key),
      value: String(row.value),
      memberId: row.member_id ? String(row.member_id) : null,
      metadata: String(row.metadata),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }
}

export const notebookRepository = new NotebookRepository();
