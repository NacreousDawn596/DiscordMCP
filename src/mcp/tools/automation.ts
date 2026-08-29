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
  'reaction_remove',
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
    name: 'discord.automation.reaction_role.create',
    description:
      'Send a reaction-role message to a channel, react with initial emojis, and register reaction listeners to add/remove roles dynamically when users react.',
    inputSchema: {
      type: 'object',
      properties: {
        channel_id: { type: 'string', description: 'ID or name of the channel to send the reaction role message in.' },
        content: { type: 'string', description: 'Message content detailing the reaction roles (e.g. "React to get your roles!\\n🔴 Red\\n🔵 Blue").' },
        roles: {
          type: 'array',
          description: 'List of emoji-to-role mappings.',
          items: {
            type: 'object',
            properties: {
              emoji: { type: 'string', description: 'Emoji symbol or ID (e.g. 🔴 or :red_circle:)' },
              role: { type: 'string', description: 'Role name or ID to assign/remove (e.g. Red)' },
            },
            required: ['emoji', 'role'],
          },
        },
      },
      required: ['channel_id', 'content', 'roles'],
    },
    risk: 'MEDIUM',
    capability: 'MANAGE_ROLES',
    mutates: true,
    async execute(ctx, args) {
      const channelId = String(args.channel_id);
      const content = String(args.content);
      const rolesInput = Array.isArray(args.roles)
        ? (args.roles as Array<{ emoji: string; role: string }>)
        : [];

      if (rolesInput.length === 0) {
        return fail('At least one emoji-to-role mapping must be provided in roles.');
      }

      const guild = ctx.guild;
      const channel =
        guild.channels.cache.get(channelId) ??
        guild.channels.cache.find((c) => c.name === channelId || c.name === `#${channelId}`);

      if (!channel || !('send' in channel)) {
        return fail(`Channel not found or cannot send messages: ${channelId}`);
      }

      const textChannel = channel as unknown as {
        send: (opts: { content: string }) => Promise<{ id: string; react: (emoji: string) => Promise<unknown> }>;
      };

      const msg = await textChannel.send({ content });

      const createdAutomations: number[] = [];

      for (const mapping of rolesInput) {
        const emoji = String(mapping.emoji).trim();
        const role = String(mapping.role).trim();

        try {
          await msg.react(emoji);
        } catch {
          // ignore reaction errors in mocks or if bot lacks permissions
        }

        // Create reaction_add automation
        const addRec = automationRepository.createAutomation({
          guildId: ctx.guildId,
          trigger: 'reaction_add',
          conditions: [
            { description: `message id ${msg.id}` },
            { description: `emoji ${emoji}` },
            { description: 'not a bot' },
          ],
          action: { description: `add role ${role}` },
          createdBy: ctx.userId,
        });

        // Create reaction_remove automation
        const removeRec = automationRepository.createAutomation({
          guildId: ctx.guildId,
          trigger: 'reaction_remove',
          conditions: [
            { description: `message id ${msg.id}` },
            { description: `emoji ${emoji}` },
            { description: 'not a bot' },
          ],
          action: { description: `remove role ${role}` },
          createdBy: ctx.userId,
        });

        createdAutomations.push(addRec.id, removeRec.id);
      }

      return ok(
        `Created reaction role message (ID: ${msg.id}) with ${rolesInput.length} reaction roles and ${createdAutomations.length} automations.`,
        { messageId: msg.id, channelId: channel.id, automationIds: createdAutomations },
      );
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

