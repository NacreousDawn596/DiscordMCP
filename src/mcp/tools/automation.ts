import type { ToolDescriptor } from '../types.js';
import { registerTool } from '../registry.js';
import { automationRepository } from '../../database/repositories/automationRepository.js';
import { ok, fail } from './helpers.js';

const TRIGGERS = [
  'message_create',
  'message_update',
  'message_delete',
  'member_join',
  'member_leave',
  'member_update',
  'channel_create',
  'channel_update',
  'channel_delete',
  'role_create',
  'role_update',
  'role_delete',
  'thread_create',
  'thread_update',
  'reaction_add',
  'voice_state_update',
];

export function registerAutomationTools(): void {
  registerTool({
    name: 'discord.automation.create',
    description:
      'Create a guild-scoped automation. The action is a natural-language description of what to do when the trigger fires (e.g. "welcome them in #general").',
    inputSchema: {
      type: 'object',
      properties: {
        trigger: { type: 'string', enum: TRIGGERS, description: 'Discord event that fires the automation.' },
        action: { type: 'string', description: 'Natural-language action, e.g. "send a welcome message in #general".' },
        conditions: { type: 'string', description: 'Optional natural-language conditions, e.g. "only for non-bot members".' },
      },
      required: ['trigger', 'action'],
    },
    risk: 'LOW',
    capability: 'MANAGE_GUILD',
    mutates: true,
    async execute(ctx, args) {
      const rec = automationRepository.createAutomation({
        guildId: ctx.guildId,
        trigger: String(args.trigger),
        conditions: [{ description: args.conditions ? String(args.conditions) : '' }],
        action: { description: String(args.action) },
        createdBy: ctx.userId,
      });
      return ok(`Created automation #${rec.id} on ${rec.trigger}.`, { id: rec.id });
    },
  });

  registerTool({
    name: 'discord.automation.list',
    description: 'List automations configured for this server.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    risk: 'READ',
    mutates: false,
    async execute(ctx) {
      const recs = automationRepository.listAutomations(ctx.guildId);
      const lines = recs.map((r) => `- #${r.id} [${r.trigger}] ${JSON.parse(r.action).description}`);
      return ok(lines.length ? lines.join('\n') : 'No automations configured.');
    },
  });

  registerTool({
    name: 'discord.automation.delete',
    description: 'Delete an automation by id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'integer' } },
      required: ['id'],
    },
    risk: 'LOW',
    capability: 'MANAGE_GUILD',
    mutates: true,
    async execute(ctx, args) {
      const deleted = automationRepository.deleteAutomation(ctx.guildId, Number(args.id));
      return deleted ? ok(`Deleted automation #${args.id}.`) : fail(`Automation not found: ${args.id}`);
    },
  });

  registerTool({
    name: 'discord.automation.enable',
    description: 'Enable or disable an automation.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'integer' }, enabled: { type: 'boolean' } },
      required: ['id', 'enabled'],
    },
    risk: 'LOW',
    capability: 'MANAGE_GUILD',
    mutates: true,
    async execute(ctx, args) {
      automationRepository.setEnabled(ctx.guildId, Number(args.id), Boolean(args.enabled));
      return ok(`Automation #${args.id} ${Boolean(args.enabled) ? 'enabled' : 'disabled'}.`);
    },
  });
}
