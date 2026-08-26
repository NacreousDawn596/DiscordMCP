import type { ToolDescriptor } from '../types.js';
import { registerTool } from '../registry.js';
import { automationRepository } from '../../database/repositories/automationRepository.js';
import { ok, fail } from './helpers.js';

export function registerScheduleTools(): void {
  registerTool({
    name: 'discord.schedule.create',
    description:
      'Create a scheduled task using a cron expression. The action is a natural-language description (e.g. "post a reminder in #general").',
    inputSchema: {
      type: 'object',
      properties: {
        cron: { type: 'string', description: 'Cron expression, e.g. "0 9 * * 1" for Mondays at 9am.' },
        action: { type: 'string', description: 'Natural-language action to perform.' },
        channel: { type: 'string', description: 'Optional target channel name/id.' },
      },
      required: ['cron', 'action'],
    },
    risk: 'LOW',
    capability: 'MANAGE_GUILD',
    mutates: true,
    async execute(ctx, args) {
      const rec = automationRepository.createScheduledTask({
        guildId: ctx.guildId,
        cron: String(args.cron),
        action: { description: String(args.action) },
        channelId: args.channel ? String(args.channel) : null,
        createdBy: ctx.userId,
      });
      return ok(`Created schedule #${rec.id} (${rec.cron}).`, { id: rec.id });
    },
  });

  registerTool({
    name: 'discord.schedule.list',
    description: 'List scheduled tasks for this server.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      const recs = automationRepository.listScheduledTasks(ctx.guildId);
      const lines = recs.map(
        (r) => `- #${r.id} [${r.cron}] ${JSON.parse(r.action).description}${r.channelId ? ` -> #${r.channelId}` : ''}`,
      );
      return ok(lines.length ? lines.join('\n') : 'No scheduled tasks.');
    },
  });

  registerTool({
    name: 'discord.schedule.update',
    description: 'Update a scheduled task\'s cron or action.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        cron: { type: 'string' },
        action: { type: 'string' },
      },
      required: ['id'],
    },
    risk: 'LOW',
    capability: 'MANAGE_GUILD',
    mutates: true,
    async execute(ctx, args) {
      const recs = automationRepository.listScheduledTasks(ctx.guildId);
      const existing = recs.find((r) => r.id === Number(args.id));
      if (!existing) return fail(`Schedule not found: ${args.id}`);
      const db = await import('../../database/index.js');
      db.getDatabase()
        .prepare('UPDATE scheduled_tasks SET cron = @cron, action = @action WHERE id = @id AND guild_id = @guildId')
        .run({
          cron: args.cron ? String(args.cron) : existing.cron,
          action: args.action ? JSON.stringify({ description: String(args.action) }) : existing.action,
          id: Number(args.id),
          guildId: ctx.guildId,
        });
      return ok(`Updated schedule #${args.id}.`);
    },
  });

  registerTool({
    name: 'discord.schedule.delete',
    description: 'Delete a scheduled task by id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'integer' } },
      required: ['id'],
    },
    risk: 'LOW',
    capability: 'MANAGE_GUILD',
    mutates: true,
    async execute(ctx, args) {
      const deleted = automationRepository.deleteScheduledTask(ctx.guildId, Number(args.id));
      return deleted ? ok(`Deleted schedule #${args.id}.`) : fail(`Schedule not found: ${args.id}`);
    },
  });
}
