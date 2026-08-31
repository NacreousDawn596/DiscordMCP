import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Client,
  type Guild,
  type GuildChannel,
  type Interaction,
  type Message,
  type TextBasedChannel,
} from 'discord.js';
import { AgentRuntime, type RuntimeMode } from './agent/runtime/loop.js';
import { MemoryManager } from './agent/memory/memoryManager.js';
import {
  contextFromInteraction,
  contextFromMessage,
  extractRequest,
  syntheticExecutionContext,
} from './agent/context/contextManager.js';
import type { AppConfig } from './config/env.js';
import { openDatabase } from './database/index.js';
import { guildRepository } from './database/repositories/guildRepository.js';
import { notebookRepository } from './database/repositories/notebookRepository.js';

import { createClient } from './discord/client.js';
import { registerEvents, type DiscordHandlers } from './discord/events.js';
import type { EventPayload } from './automation/engine.js';
import { automationEngine } from './automation/engine.js';
import { scheduler } from './scheduler/scheduler.js';
import { createLLMProvider } from './llm/factory.js';
import { createExecutor } from './mcp/executor.js';
import { registerAllTools } from './mcp/tools/index.js';
import { tryFastQuery } from './discord/fastQuery.js';
import { getButtonAction, getModalConfig } from './mcp/tools/components.js';

import { getLogger, initLogger } from './logging/logger.js';
import { truncate } from './mcp/tools/helpers.js';

const YES_WORDS = new Set(['yes', 'y', 'confirm', 'proceed', 'execute', 'go ahead', 'approved']);
const NO_WORDS = new Set(['no', 'n', 'cancel', 'stop', 'abort']);

/** Ensures we never try to send an empty/whitespace-only message to Discord. */
function nonEmpty(text: string): string {
  const t = (text ?? '').trim();
  return t.length > 0 ? truncate(text) : 'Done.';
}

export class AgentApp {
  readonly config: AppConfig;
  private client: Client;
  private runtime!: AgentRuntime;
  private memory!: MemoryManager;
  private pendingConfirmations = new Map<string, string>();
  private xpCooldowns = new Map<string, number>();

  constructor(config: AppConfig) {
    this.config = config;
    this.client = createClient(config);

    // Periodically prune stale XP cooldown entries so the map stays bounded.
    const cleanup = setInterval(() => {
      const cutoff = Date.now() - 60 * 60 * 1000;
      for (const [key, ts] of this.xpCooldowns) {
        if (ts < cutoff) this.xpCooldowns.delete(key);
      }
    }, 60 * 60 * 1000);
    cleanup.unref?.();
  }

  async start(): Promise<void> {
    initLogger(this.config);
    openDatabase(this.config);
    registerAllTools();

    const llm = createLLMProvider(this.config);
    const executor = createExecutor({
      config: this.config,
      getGuildConfig: (guildId) => guildRepository.ensureConfig(guildId),
    });
    this.memory = new MemoryManager();
    this.runtime = new AgentRuntime({
      config: this.config,
      llm,
      executor,
      getGuildConfig: (guildId) => guildRepository.ensureConfig(guildId),
      memory: this.memory,
    });

    automationEngine.setRunner((guildId, action, channelId) =>
      this.runAutomation(guildId, action, channelId),
    );
    scheduler.setRunner((guildId, action, channelId) =>
      this.runAutomation(guildId, action, channelId),
    );
    if (this.config.features.scheduler) scheduler.start();

    const handlers: DiscordHandlers = {
      onMessage: (m) => this.onMessage(m),
      onInteraction: (i) => this.onInteraction(i),
      onGuildJoin: (g) => this.onGuildJoin(g),
      onEvent: (trigger, payload) => this.onEvent(trigger, payload),
    };
    registerEvents(this.client, handlers);

    if (!this.config.discord.botToken) {
      getLogger().warn('DISCORD_BOT_TOKEN is empty — the bot will not log in.');
      return;
    }

    await this.client.login(this.config.discord.botToken);
    getLogger().info({ tag: this.client.user?.tag }, 'bot logged in');

    if (this.config.features.slashCommands) {
      await this.registerSlashCommands();
    }
  }

  async stop(): Promise<void> {
    scheduler.stop();
    this.client.destroy();
  }

  // ---------------------------------------------------------------------
  // Message handling
  // ---------------------------------------------------------------------

  private async onMessage(message: Message): Promise<void> {
    if (message.author.bot) return;
    if (!message.guild) {
      await message
        .reply('I operate inside Discord servers. Add me to a server and mention me.')
        .catch(() => undefined);
      return;
    }

    const botId = this.client.user!.id;
    const botTag = this.client.user!.tag;

    // Award passive XP for activity (throttled per member via cooldown).
    await this.maybeAwardXp(message);

    // Confirmation replies (may or may not mention the bot).
    const pendingKey = `${message.channelId}:${message.author.id}`;
    const pendingRunId = this.pendingConfirmations.get(pendingKey);
    if (pendingRunId && this.runtime.hasPending(pendingRunId)) {
      const lowered = message.content.toLowerCase().trim();
      if (YES_WORDS.has(lowered) || NO_WORDS.has(lowered)) {
        this.pendingConfirmations.delete(pendingKey);
        const ctx = contextFromMessage(message, botId, botTag);
        const outcome = await this.runtime.resume(ctx, pendingRunId, YES_WORDS.has(lowered));
        await this.reply(message, outcome);
        return;
      }
    }

    const mentioned = message.mentions.users.has(botId);
    const isReplyToBot = message.reference
      ? (await message.fetchReference().catch(() => null))?.author.id === botId
      : false;

    if (!mentioned && !isReplyToBot) return;

    const text = extractRequest(message.content, botId);
    if (!text) {
      await message.reply('Yes? Mention me with a request, e.g. `@Agent organize this server`.');
      return;
    }

    // Fast-path query interceptor (for XP, balance, level, warnings)
    const fastResponse = tryFastQuery(message.guild.id, message.author.id, text);
    if (fastResponse) {
      await message.reply(fastResponse);
      return;
    }

    const mode = detectMode(text);
    const ctx = contextFromMessage(message, botId, botTag);

    await this.runAndReply(ctx, text, mode, message);
  }

  /**
   * Awards passive XP for message activity, throttled per member via a cooldown
   * window so XP farming / spam doesn't inflate the notebook economy.
   * Disabled entirely when XP_PER_MESSAGE is 0.
   */
  private async maybeAwardXp(message: Message): Promise<void> {
    const { xpPerMessage, xpCooldownSeconds } = this.config.economy;
    if (xpPerMessage <= 0) return;
    if (!message.guild) return;

    const guildId = message.guild.id;
    const key = `${guildId}:${message.author.id}`;
    const now = Date.now();
    const last = this.xpCooldowns.get(key);
    if (last && now - last < xpCooldownSeconds * 1000) return;

    this.xpCooldowns.set(key, now);

    try {
      notebookRepository.updateEntry({
        guildId,
        key: 'xp',
        memberId: message.author.id,
        operation: 'increment',
        value: xpPerMessage,
      });
    } catch (err) {
      getLogger().error({ err, guildId }, 'failed to award XP');
    }
  }

  private async runAndReply(
    ctx: Parameters<AgentRuntime['run']>[0],
    text: string,
    mode: RuntimeMode,
    message: Message,
  ): Promise<void> {    const channel = ctx.channel;
    if (channel && 'sendTyping' in channel) {
      await (channel as unknown as { sendTyping: () => Promise<unknown> })
        .sendTyping()
        .catch(() => undefined);
    }

    let outcome;
    try {
      outcome = await this.runtime.run(ctx, text, mode);
    } catch (err) {
      getLogger().error({ err, guildId: ctx.guildId }, 'agent run failed');
      await message.reply('Something went wrong while processing your request.').catch(() => undefined);
      return;
    }

    if (outcome.needsConfirmation) {
      const key = `${ctx.channelId}:${ctx.userId}`;
      this.pendingConfirmations.set(key, outcome.runId);
    }

    await this.reply(message, outcome);
  }

  private async reply(
    message: Message,
    outcome: Awaited<ReturnType<AgentRuntime['run']>>,
  ): Promise<void> {
    const content = nonEmpty(outcome.response);
    if (outcome.needsConfirmation) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`agent:confirm:${outcome.runId}`)
          .setLabel('Confirm')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`agent:cancel:${outcome.runId}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger),
      );
      await message.reply({ content, components: [row] }).catch(() => undefined);
    } else if (!outcome.suppressReply) {
      await message.reply(content).catch(() => undefined);
    }
  }

  // ---------------------------------------------------------------------
  // Interactions (slash commands + buttons)
  // ---------------------------------------------------------------------

  private async onInteraction(interaction: Interaction): Promise<void> {
    const botId = this.client.user!.id;
    const botTag = this.client.user!.tag;

    // -------------------------------------------------------------------------
    // 1. Button click interactions
    // -------------------------------------------------------------------------
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // Agent confirm/cancel buttons (pre-existing)
      if (customId.startsWith('agent:')) {
        const [, verb, runId] = customId.split(':');
        if (!runId) return;
        const approved = verb === 'confirm';
        const ctx = contextFromInteraction(interaction, botId, botTag);
        await interaction.deferUpdate();
        const outcome = await this.runtime.resume(ctx, runId, approved);
        await interaction
          .editReply({ content: nonEmpty(outcome.response), components: [] })
          .catch(() => undefined);
        return;
      }

      // Bot component buttons (registered via discord.message.send_with_buttons)
      if (customId.startsWith('bot:')) {
        const bareId = customId.slice(4);
        const guildId = interaction.guildId;
        if (!guildId) return;

        const action = getButtonAction(guildId, bareId);
        if (!action) {
          await interaction.reply({ content: 'This button has no registered action.', ephemeral: true }).catch(() => undefined);
          return;
        }

        // Open a modal if the action is "open_modal:<modalId>"
        if (action.startsWith('open_modal:')) {
          const modalId = action.slice(11);
          const config = getModalConfig(guildId, modalId);
          if (!config) {
            await interaction.reply({ content: 'Modal not found.', ephemeral: true }).catch(() => undefined);
            return;
          }

          const modal = new ModalBuilder()
            .setCustomId(`modal:${modalId}`)
            .setTitle(config.title);

          for (const field of config.fields) {
            const style =
              field.style === 'paragraph' || field.style === 'long'
                ? TextInputStyle.Paragraph
                : TextInputStyle.Short;
            const input = new TextInputBuilder()
              .setCustomId(field.id)
              .setLabel(field.label)
              .setStyle(style)
              .setRequired(field.required);
            if (field.placeholder) input.setPlaceholder(field.placeholder);
            if (field.min) input.setMinLength(field.min);
            if (field.max) input.setMaxLength(field.max);
            modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
          }

          await interaction.showModal(modal).catch(() => undefined);
          return;
        }

        // Run the stored action via the agent runtime
        await interaction.deferReply({ ephemeral: true }).catch(() => undefined);
        const ctx = contextFromInteraction(interaction, botId, botTag);
        const mode = detectMode(action);
        try {
          const outcome = await this.runtime.run(ctx, action, mode);
          await interaction.editReply(nonEmpty(outcome.response)).catch(() => undefined);
        } catch {
          await interaction.editReply('Something went wrong processing this button action.').catch(() => undefined);
        }
        return;
      }

      // Fallback for unknown button IDs
      const [scope, verb, runId] = customId.split(':');
      if (scope !== 'agent' || !runId) return;
      const approved = verb === 'confirm';
      const ctx = contextFromInteraction(interaction, botId, botTag);
      await interaction.deferUpdate();
      const outcome = await this.runtime.resume(ctx, runId, approved);
      await interaction
        .editReply({ content: nonEmpty(outcome.response), components: [] })
        .catch(() => undefined);
      return;
    }

    // -------------------------------------------------------------------------
    // 2. Modal (form) submissions
    // -------------------------------------------------------------------------
    if (interaction.isModalSubmit()) {
      const modalCustomId = interaction.customId;
      if (!modalCustomId.startsWith('modal:')) return;

      const modalId = modalCustomId.slice(6);
      const guildId = interaction.guildId;
      if (!guildId) return;

      const config = getModalConfig(guildId, modalId);
      await interaction.deferReply({ ephemeral: true }).catch(() => undefined);

      // Collect field values
      const fields: Record<string, string> = {};
      for (const row of interaction.components) {
        if (row.type !== 1) continue;
        for (const comp of row.components) {
          // ModalSubmitInteraction rows always contain TextInputModalData
          const c = comp as { customId?: string; value?: string };
          if (c.customId !== undefined && c.value !== undefined) {
            fields[c.customId] = String(c.value);
          }
        }
      }

      const submissionSummary = Object.entries(fields)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');

      const action = config?.action
        ? `${config.action}. User submitted form "${modalId}" with: ${submissionSummary}`
        : `Process form submission from modal "${modalId}" with fields: ${submissionSummary}`;

      const ctx = contextFromInteraction(interaction, botId, botTag);
      const mode = detectMode(action);
      try {
        const outcome = await this.runtime.run(ctx, action, mode);
        await interaction.editReply(nonEmpty(outcome.response)).catch(() => undefined);
      } catch {
        await interaction.editReply('Your form was received but something went wrong processing it.').catch(() => undefined);
      }
      return;
    }

    // -------------------------------------------------------------------------
    // 3. Slash commands (/agent)
    // -------------------------------------------------------------------------
    if (interaction.isChatInputCommand() && interaction.commandName === 'agent') {
      const text = interaction.options.getString('message', false);
      if (!text) {
        await interaction.reply({ content: 'Please provide a message.', ephemeral: true });
        return;
      }
      await interaction.deferReply();
      const ctx = contextFromInteraction(interaction, botId, botTag);
      const mode = detectMode(text);
      let outcome;
      try {
        outcome = await this.runtime.run(ctx, text, mode);
      } catch (err) {
        getLogger().error({ err }, 'slash agent run failed');
        await interaction.editReply('Something went wrong processing your request.');
        return;
      }
      await interaction.editReply(nonEmpty(outcome.response));
    }
  }

  // ---------------------------------------------------------------------
  // Guild join + automations + scheduling
  // ---------------------------------------------------------------------

  private async onGuildJoin(guild: Guild): Promise<void> {
    guildRepository.upsertGuild({ id: guild.id, name: guild.name, ownerId: guild.ownerId });
    guildRepository.ensureConfig(guild.id);

    const systemChannel = guild.systemChannel;
    if (systemChannel) {
      await systemChannel
        .send({
          content: [
            `Hi! I'm **${this.config.agent.name}**, an AI administrator for this server.`,
            '',
            'I can inspect the server, create channels/roles, configure permissions, audit for issues, remember preferences, and more.',
            '',
            `**How to use me:** mention me — e.g. \`@${this.config.agent.name} organize this server\``,
            'Administrators can adjust my behavior (confirmation level, allowed roles, etc.) by asking me.',
          ].join('\n'),
        })
        .catch(() => undefined);
    }
  }

  private async onEvent(trigger: string, payload: EventPayload): Promise<void> {
    if (!this.config.features.automations) return;
    await automationEngine.handleEvent(trigger, payload);
  }

  private async runAutomation(
    guildId: string,
    action: string,
    channelId: string | null,
  ): Promise<void> {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return;

    let channel: GuildChannel | null = null;
    if (channelId) {
      channel =
        (guild.channels.cache.get(channelId) as GuildChannel | undefined) ??
        (guild.channels.cache.find((c) => c.name === channelId) as GuildChannel | undefined) ??
        null;
    }

    const ctx = syntheticExecutionContext(
      this.client,
      guild,
      (channel as unknown as import('discord.js').Channel) ?? null,
    );
    const outcome = await this.runtime.run(ctx, action, 'normal');

    if (outcome.suppressReply) {
      getLogger().info({ guildId, response: outcome.response }, 'automation result (already posted)');
      return;
    }

    if (channel && 'send' in channel) {
      await (channel as unknown as { send: (content: string) => Promise<unknown> })
        .send(truncate(outcome.response))
        .catch(() => undefined);
    } else {
      getLogger().info({ guildId, response: outcome.response }, 'automation result (no channel)');
    }
  }

  private async registerSlashCommands(): Promise<void> {
    const appId = this.config.discord.applicationId;
    if (!appId) {
      getLogger().warn('DISCORD_APPLICATION_ID is empty — skipping slash command registration.');
      return;
    }
    await this.client.application?.commands.set([
      {
        name: 'agent',
        description: 'Ask the AI agent to do something in this server.',
        options: [
          {
            name: 'message',
            description: 'What would you like the agent to do?',
            type: 3, // STRING
            required: true,
          },
        ],
      },
    ]);
    getLogger().info('slash commands registered');
  }
}

function detectMode(text: string): RuntimeMode {
  const lower = text.toLowerCase().trim();
  if (/^(plan|preview|dry[- ]run)\b/.test(lower)) return 'planning';
  if (/^(analy[sz]e|analysis|audit)\b/.test(lower)) return 'analysis';
  return 'normal';
}
