import type { ToolDescriptor } from '../types.js';
import { registerTool } from '../registry.js';
import { notebookRepository } from '../../database/repositories/notebookRepository.js';
import { ok, fail } from './helpers.js';

export function registerNotebookTools(): void {
  registerTool({
    name: 'discord.notebook.get',
    description:
      'Retrieve a notebook entry, economy balance, XP state, draft, or custom setting for a guild or member.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'The notebook key to look up (e.g. "xp", "coins", "draft_rules", "shop").' },
        category: { type: 'string', description: 'Optional category/namespace (e.g. "economy", "xp", "moderation", "drafts"). Defaults to "default".' },
        member_id: { type: 'string', description: 'Optional Discord member ID to scope data to a specific user.' },
      },
      required: ['key'],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const key = String(args.key);
      const category = args.category ? String(args.category) : undefined;
      const memberId = args.member_id ? String(args.member_id) : undefined;

      const entry = notebookRepository.getEntry({
        guildId: ctx.guildId,
        category,
        key,
        memberId,
      });

      if (!entry) {
        return ok(`No notebook entry found for key "${key}".`, { found: false, key });
      }

      let parsed: unknown = entry.value;
      try {
        parsed = JSON.parse(entry.value);
      } catch {
        // use raw string value
      }

      return ok(`Notebook entry "${entry.key}" [${entry.category}]:`, {
        key: entry.key,
        category: entry.category,
        memberId: entry.memberId,
        value: parsed,
        updatedAt: new Date(entry.updatedAt).toISOString(),
      });
    },
  });

  registerTool({
    name: 'discord.notebook.set',
    description:
      'Store or overwrite a notebook entry, economy balance, XP, shop item, or custom draft in the server database.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'The notebook key to store.' },
        value: { description: 'The value to store (can be a number, string, array, or JSON object).' },
        category: { type: 'string', description: 'Optional category/namespace (e.g. "economy", "xp", "tickets", "drafts"). Defaults to "default".' },
        member_id: { type: 'string', description: 'Optional Discord member ID to scope data to a specific user.' },
      },
      required: ['key', 'value'],
    },
    risk: 'LOW',
    capability: 'MANAGE_GUILD',
    mutates: true,
    async execute(ctx, args) {
      const key = String(args.key);
      const category = args.category ? String(args.category) : undefined;
      const memberId = args.member_id ? String(args.member_id) : undefined;

      const entry = notebookRepository.setEntry({
        guildId: ctx.guildId,
        category,
        key,
        value: args.value,
        memberId,
      });

      return ok(`Saved notebook entry "${entry.key}" in category "${entry.category}".`, {
        id: entry.id,
        key: entry.key,
        category: entry.category,
        memberId: entry.memberId,
      });
    },
  });

  registerTool({
    name: 'discord.notebook.update',
    description:
      'Perform an atomic update (increment a number/XP/coins, push to an array/log, or merge JSON fields) in the server notebook.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'The notebook key to update.' },
        operation: {
          type: 'string',
          enum: ['increment', 'push', 'merge', 'set'],
          description: 'The update operation: "increment" (for numbers/XP/coins), "push" (to append to a list), "merge" (to update JSON fields), or "set".',
        },
        value: { description: 'The delta amount to add for increment, item to push, or object to merge.' },
        category: { type: 'string', description: 'Optional category/namespace (defaults to "default").' },
        member_id: { type: 'string', description: 'Optional Discord member ID.' },
      },
      required: ['key', 'operation', 'value'],
    },
    risk: 'LOW',
    capability: 'MANAGE_GUILD',
    mutates: true,
    async execute(ctx, args) {
      const key = String(args.key);
      const operation = args.operation as 'increment' | 'push' | 'merge' | 'set';
      const category = args.category ? String(args.category) : undefined;
      const memberId = args.member_id ? String(args.member_id) : undefined;

      const entry = notebookRepository.updateEntry({
        guildId: ctx.guildId,
        category,
        key,
        memberId,
        operation,
        value: args.value,
      });

      let parsed: unknown = entry.value;
      try {
        parsed = JSON.parse(entry.value);
      } catch {
        // raw string
      }

      return ok(`Updated notebook entry "${entry.key}" (${operation}):`, {
        key: entry.key,
        category: entry.category,
        memberId: entry.memberId,
        newValue: parsed,
      });
    },
  });

  registerTool({
    name: 'discord.notebook.query',
    description:
      'Search and list notebook entries in the server database (by category, key pattern, or member ID).',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Optional category/namespace to filter by.' },
        key_pattern: { type: 'string', description: 'Optional partial key string to match.' },
        member_id: { type: 'string', description: 'Optional member ID to filter by.' },
        limit: { type: 'integer', description: 'Maximum number of entries to return (default 25).' },
      },
      required: [],
    },
    risk: 'READ',
    mutates: false,
    async execute(ctx, args) {
      const category = args.category ? String(args.category) : undefined;
      const keyPattern = args.key_pattern ? String(args.key_pattern) : undefined;
      const memberId = args.member_id !== undefined ? (args.member_id ? String(args.member_id) : null) : undefined;
      const limit = args.limit ? Number(args.limit) : 25;

      const entries = notebookRepository.queryEntries({
        guildId: ctx.guildId,
        category,
        keyPattern,
        memberId,
        limit,
      });

      if (entries.length === 0) {
        return ok('No notebook entries matched the query.', { count: 0 });
      }

      const formatted = entries.map((e) => {
        let val: unknown = e.value;
        try {
          val = JSON.parse(e.value);
        } catch {
          // ignore
        }
        return `- [${e.category}] ${e.key}${e.memberId ? ` (Member: ${e.memberId})` : ''}: ${typeof val === 'object' ? JSON.stringify(val) : String(val)}`;
      });

      return ok(`Found ${entries.length} notebook entries:\n${formatted.join('\n')}`, {
        count: entries.length,
        entries: entries.map((e) => ({
          category: e.category,
          key: e.key,
          memberId: e.memberId,
          value: e.value,
        })),
      });
    },
  });

  registerTool({
    name: 'discord.notebook.delete',
    description: 'Delete a notebook entry by key, category, and member ID.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'The notebook key to delete.' },
        category: { type: 'string', description: 'Optional category/namespace.' },
        member_id: { type: 'string', description: 'Optional member ID.' },
      },
      required: ['key'],
    },
    risk: 'LOW',
    capability: 'MANAGE_GUILD',
    mutates: true,
    async execute(ctx, args) {
      const key = String(args.key);
      const category = args.category ? String(args.category) : undefined;
      const memberId = args.member_id ? String(args.member_id) : undefined;

      const deleted = notebookRepository.deleteEntry({
        guildId: ctx.guildId,
        category,
        key,
        memberId,
      });

      return deleted
        ? ok(`Deleted notebook entry "${key}".`, { key })
        : fail(`Notebook entry "${key}" not found.`);
    },
  });
}
