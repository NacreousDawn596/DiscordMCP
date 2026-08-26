import {
  memoryRepository,
  type MemoryScope,
} from '../../database/repositories/memoryRepository.js';

/**
 * High-level guild-scoped memory. Every operation is hard-namespaced by
 * guildId — there is no code path that reads or writes memory without a guild
 * scope. Cross-guild leakage is structurally impossible.
 */
export class MemoryManager {
  store(
    guildId: string,
    key: string,
    value: string,
    opts: { scope?: MemoryScope; channelId?: string; userId?: string } = {},
  ): void {
    memoryRepository.store({
      guildId,
      scope: opts.scope ?? 'GUILD',
      channelId: opts.channelId ?? null,
      userId: opts.userId ?? null,
      key,
      value,
    });
  }

  list(guildId: string, opts: { query?: string; limit?: number } = {}): Array<{
    scope: string;
    key: string;
    value: string;
  }> {
    return memoryRepository
      .list({ guildId, query: opts.query, limit: opts.limit ?? 50 })
      .map((r) => ({ scope: r.scope, key: r.key, value: r.value }));
  }

  /** Loads relevant guild memory for inclusion in the agent's context. */
  loadContext(guildId: string, channelId?: string | null, userId?: string | null): string[] {
    const records = memoryRepository.list({ guildId, limit: 30 });
    return records.map((r) => {
      switch (r.scope) {
        case 'CHANNEL':
          return r.channelId === channelId ? `[channel memory] ${r.key}: ${r.value}` : '';
        case 'USER':
          return r.userId === userId ? `[user memory] ${r.key}: ${r.value}` : '';
        default:
          return `[memory] ${r.key}: ${r.value}`;
      }
    }).filter(Boolean);
  }
}
