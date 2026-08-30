/**
 * Discord Component Tools
 * - Buttons: send messages with action buttons; per-button actions stored in the notebook
 * - Forms (Modals): send an interactive modal form triggered by a button click
 * - Bulk delete: delete a range of messages from a channel
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { registerTool } from '../registry.js';
import { ok, fail, findChannel } from './helpers.js';
import { notebookRepository } from '../../database/repositories/notebookRepository.js';

const BUTTON_STYLE_MAP: Record<string, ButtonStyle> = {
  primary: ButtonStyle.Primary,
  blurple: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  grey: ButtonStyle.Secondary,
  gray: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  green: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
  red: ButtonStyle.Danger,
  link: ButtonStyle.Link,
};

const TEXT_INPUT_STYLE_MAP: Record<string, TextInputStyle> = {
  short: TextInputStyle.Short,
  paragraph: TextInputStyle.Paragraph,
  long: TextInputStyle.Paragraph,
};

/**
 * Store a button action in the notebook so the interaction handler can look it up.
 * Key format:  btn_action:<customId>
 */
export function storeButtonAction(
  guildId: string,
  customId: string,
  action: string,
): void {
  notebookRepository.setEntry({
    guildId,
    category: 'button_actions',
    key: customId,
    value: action,
  });
}

/**
 * Retrieve a stored button action.
 */
export function getButtonAction(
  guildId: string,
  customId: string,
): string | null {
  const entry = notebookRepository.getEntry({
    guildId,
    category: 'button_actions',
    key: customId,
  });
  return entry ? entry.value : null;
}

/**
 * Retrieve a stored modal config.
 */
export function getModalConfig(
  guildId: string,
  modalId: string,
): {
  title: string;
  fields: { id: string; label: string; style: string; required: boolean; placeholder?: string; min?: number; max?: number }[];
  action: string;
} | null {
  const entry = notebookRepository.getEntry({
    guildId,
    category: 'modal_configs',
    key: modalId,
  });
  if (!entry) return null;
  try {
    return JSON.parse(entry.value);
  } catch {
    return null;
  }
}

export function registerComponentTools(): void {

  // ---------------------------------------------------------------------------
  // 1. Send a message with interactive buttons
  // ---------------------------------------------------------------------------
  registerTool({
    name: 'discord.message.send_with_buttons',
    description:
      'Send a message (with optional embed) that has clickable action buttons attached. Each button can trigger an action when clicked.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Target channel name/id (defaults to current channel).' },
        content: { type: 'string', description: 'Optional text content above the buttons.' },
        embed: {
          type: 'object',
          description: 'Optional embed to display with the buttons.',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            color: { type: 'string' },
            fields: {
              type: 'array',
              items: {
                type: 'object',
                properties: { name: { type: 'string' }, value: { type: 'string' }, inline: { type: 'boolean' } },
                required: ['name', 'value'],
              },
            },
          },
        },
        buttons: {
          type: 'array',
          description: 'Array of button configs.',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'Button label shown on Discord.' },
              style: {
                type: 'string',
                enum: ['primary', 'secondary', 'success', 'danger', 'link'],
                description: 'Visual button style.',
              },
              custom_id: { type: 'string', description: 'Unique identifier for this button (used to route click actions).' },
              action: { type: 'string', description: 'What to do when clicked (e.g. "give 50 coins", "open form:application", "reply You clicked!").' },
              url: { type: 'string', description: 'For link-style buttons: the URL to open.' },
              emoji: { type: 'string', description: 'Optional emoji to show on the button (e.g. "🎉").' },
              disabled: { type: 'boolean', description: 'Whether the button is disabled.' },
            },
            required: ['label'],
          },
        },
      },
      required: ['buttons'],
    },
    risk: 'LOW',
    capability: 'SEND_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const channel = args.channel
        ? findChannel(ctx.guild, args.channel as string)
        : ctx.channel ?? (ctx.guild as never);
      if (!channel || !('send' in channel)) return fail('Cannot send to this channel.');

      const buttonsInput = args.buttons as Array<{
        label: string;
        style?: string;
        custom_id?: string;
        action?: string;
        url?: string;
        emoji?: string;
        disabled?: boolean;
      }>;

      if (!buttonsInput || buttonsInput.length === 0) return fail('At least one button is required.');
      if (buttonsInput.length > 25) return fail('Discord allows a maximum of 25 buttons per message.');

      // Build rows (max 5 buttons per ActionRow)
      const rows: ActionRowBuilder<ButtonBuilder>[] = [];
      let currentRow = new ActionRowBuilder<ButtonBuilder>();
      let rowCount = 0;

      for (const btn of buttonsInput) {
        if (rowCount >= 5) {
          rows.push(currentRow);
          currentRow = new ActionRowBuilder<ButtonBuilder>();
          rowCount = 0;
        }

        if (rows.length >= 5) {
          return fail('Discord allows a maximum of 5 rows (25 buttons) per message.');
        }

        const style = BUTTON_STYLE_MAP[(btn.style ?? 'primary').toLowerCase()] ?? ButtonStyle.Primary;
        const customId = btn.custom_id ?? `btn_${Math.random().toString(36).slice(2, 9)}`;

        const builder = new ButtonBuilder().setLabel(String(btn.label)).setStyle(style);

        if (style === ButtonStyle.Link) {
          if (!btn.url) return fail(`Link button "${btn.label}" requires a url field.`);
          builder.setURL(btn.url);
        } else {
          builder.setCustomId(`bot:${customId}`);
        }

        if (btn.emoji) {
          try {
            builder.setEmoji(btn.emoji);
          } catch {
            // ignore invalid emoji
          }
        }
        if (btn.disabled) builder.setDisabled(true);

        // Store action mapping
        if (btn.action && style !== ButtonStyle.Link) {
          storeButtonAction(ctx.guildId, customId, btn.action);
        }

        currentRow.addComponents(builder);
        rowCount++;
      }
      rows.push(currentRow);

      // Build message options
      const sendOpts: Record<string, unknown> = { components: rows };
      if (args.content) sendOpts.content = String(args.content);

      if (args.embed && typeof args.embed === 'object') {
        const e = args.embed as Record<string, unknown>;
        const { EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder();
        if (e.title) embed.setTitle(String(e.title));
        if (e.description) embed.setDescription(String(e.description));
        if (e.color) {
          const c = String(e.color).startsWith('#') ? parseInt(String(e.color).slice(1), 16) : parseInt(String(e.color), 16);
          if (!isNaN(c)) embed.setColor(c);
        }
        if (Array.isArray(e.fields)) {
          for (const f of e.fields as { name: string; value: string; inline?: boolean }[]) {
            embed.addFields({ name: f.name, value: f.value, inline: !!f.inline });
          }
        }
        sendOpts.embeds = [embed];
      }

      const textChannel = channel as unknown as {
        send(o: Record<string, unknown>): Promise<{ id: string }>;
      };
      const msg = await textChannel.send(sendOpts);

      return ok(`Sent message with ${buttonsInput.length} button(s) (Message ID: ${msg.id}).`, {
        messageId: msg.id,
        buttonIds: buttonsInput.map((b) => b.custom_id ?? `btn_${b.label}`),
      });
    },
  });

  // ---------------------------------------------------------------------------
  // 2. Register or update a button action (without sending a message)
  // ---------------------------------------------------------------------------
  registerTool({
    name: 'discord.button.register_action',
    description: 'Register or update the action for an existing button by its custom ID.',
    inputSchema: {
      type: 'object',
      properties: {
        custom_id: { type: 'string', description: 'The custom_id of the button.' },
        action: { type: 'string', description: 'The action to perform when the button is clicked.' },
      },
      required: ['custom_id', 'action'],
    },
    risk: 'LOW',
    capability: 'MANAGE_GUILD',
    mutates: true,
    async execute(ctx, args) {
      storeButtonAction(ctx.guildId, String(args.custom_id), String(args.action));
      return ok(`Button action registered for "${args.custom_id}".`);
    },
  });

  // ---------------------------------------------------------------------------
  // 3. Create and register a Modal (Form) — shown when a button is clicked
  // ---------------------------------------------------------------------------
  registerTool({
    name: 'discord.form.register',
    description:
      'Create and register a Discord Modal (Form) that will be shown when a trigger button is clicked. Forms can have up to 5 text fields.',
    inputSchema: {
      type: 'object',
      properties: {
        modal_id: { type: 'string', description: 'Unique ID for this modal (e.g. "application_form").' },
        title: { type: 'string', description: 'Modal dialog title shown to the user.' },
        trigger_button_custom_id: {
          type: 'string',
          description: 'The custom_id of an existing button. When that button is clicked, this modal will open.',
        },
        fields: {
          type: 'array',
          description: 'List of text input fields (max 5).',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Unique field ID used in the submission payload.' },
              label: { type: 'string', description: 'Label shown above the field.' },
              style: { type: 'string', enum: ['short', 'paragraph', 'long'], description: 'Input style.' },
              placeholder: { type: 'string', description: 'Placeholder hint text.' },
              required: { type: 'boolean', description: 'Whether the field is required.' },
              min_length: { type: 'integer', description: 'Minimum input length.' },
              max_length: { type: 'integer', description: 'Maximum input length.' },
            },
            required: ['id', 'label'],
          },
        },
        on_submit_action: {
          type: 'string',
          description: 'What the bot should do when the form is submitted (e.g. "post application to #apps channel", "save to notebook applications").',
        },
      },
      required: ['modal_id', 'title', 'fields'],
    },
    risk: 'LOW',
    capability: 'MANAGE_GUILD',
    mutates: true,
    async execute(ctx, args) {
      const modalId = String(args.modal_id);
      const fieldsInput = args.fields as Array<{
        id: string;
        label: string;
        style?: string;
        placeholder?: string;
        required?: boolean;
        min_length?: number;
        max_length?: number;
      }>;

      if (!fieldsInput || fieldsInput.length === 0) return fail('At least one field is required for a form.');
      if (fieldsInput.length > 5) return fail('Discord modals support a maximum of 5 fields.');

      const config = {
        title: String(args.title),
        fields: fieldsInput.map((f) => ({
          id: f.id,
          label: f.label,
          style: f.style ?? 'short',
          required: f.required !== false,
          placeholder: f.placeholder,
          min: f.min_length,
          max: f.max_length,
        })),
        action: String(args.on_submit_action ?? ''),
      };

      // Store the modal config
      notebookRepository.setEntry({
        guildId: ctx.guildId,
        category: 'modal_configs',
        key: modalId,
        value: JSON.stringify(config),
      });

      // Wire this modal to the trigger button
      if (args.trigger_button_custom_id) {
        storeButtonAction(
          ctx.guildId,
          String(args.trigger_button_custom_id),
          `open_modal:${modalId}`,
        );
      }

      return ok(
        `Form "${modalId}" registered with ${fieldsInput.length} field(s).` +
          (args.trigger_button_custom_id
            ? ` It will open when button "${args.trigger_button_custom_id}" is clicked.`
            : ''),
        { modalId },
      );
    },
  });

  // ---------------------------------------------------------------------------
  // 4. Bulk delete messages from a channel
  // ---------------------------------------------------------------------------
  registerTool({
    name: 'discord.message.bulk_delete',
    description:
      'Delete multiple recent messages from a channel at once (up to 100, Discord requires messages to be < 14 days old).',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name/id.' },
        count: { type: 'integer', description: 'Number of recent messages to delete (1–100).' },
        filter_user_id: { type: 'string', description: 'Optional: only delete messages from this user.' },
      },
      required: ['channel', 'count'],
    },
    risk: 'HIGH',
    capability: 'MANAGE_MESSAGES',
    mutates: true,
    async execute(ctx, args) {
      const channel = findChannel(ctx.guild, args.channel as string);
      if (!channel || !('messages' in channel)) return fail('Channel not found or not text-based.');
      const count = Math.min(Math.max(Number(args.count) || 1, 1), 100);
      const textChannel = channel as unknown as {
        messages: {
          fetch(opts: { limit: number }): Promise<Map<string, { id: string; author: { id: string } }>>;
        };
        bulkDelete(msgs: string[], filterOld?: boolean): Promise<{ size: number }>;
      };

      const msgs = await textChannel.messages.fetch({ limit: count });
      let ids = [...msgs.keys()];

      if (args.filter_user_id) {
        const targetId = String(args.filter_user_id);
        ids = ids.filter((id) => msgs.get(id)?.author.id === targetId);
      }

      if (ids.length === 0) return ok('No messages matched the criteria.');
      const result = await textChannel.bulkDelete(ids, true);
      return ok(`Deleted ${result.size} message(s).`, { deleted: result.size });
    },
  });
}
