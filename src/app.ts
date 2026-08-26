import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
import { createClient } from './discord/client.js';
import { registerEvents, type DiscordHandlers } from './discord/events.js';
import type { EventPayload } from './automation/engine.js';
import { automationEngine } from './automation/engine.js';
import { scheduler } from './scheduler/scheduler.js';
import { createLLMProvider } from './llm/factory.js';
import { createExecutor } from './mcp/executor.js';
import { registerAllTools } from './mcp/tools/index.js';
import { getLogger, initLogger } from './logging/logger.js';
import { truncate } from './mcp/tools/helpers.js';

const YES_WORDS = new Set(['yes', 'y', 'confirm', 'proceed', 'execute', 'go ahead', 'approved']);
const NO_WORDS = new Set(['no', 'n', 'cancel', 'stop', 'abort']);

export class AgentApp {
  readonly config: AppConfig;
  private client: Client;
  private runtime!: AgentRuntime;
  private memory!: MemoryManager;
  private pendingConfirmations = new Map<string, string>();

  constructor(config: AppConfig) {
    this.config = config;
    this.client = createClient(config);
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

    const mode = detectMode(text);
    const ctx = contextFromMessage(message, botId, botTag);

    await this.runAndReply(ctx, text, mode, message);
  }

  private async runAndReply(
    ctx: Parameters<AgentRuntime['run']>[0],
    text: string,
    mode: RuntimeMode,
    message: Message,
  ): Promise<void> {
    const channel = ctx.channel;
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
      await message.reply({ content: truncate(outcome.response), components: [row] });
    } else {
      await message.reply(truncate(outcome.response));
    }
  }

  // ---------------------------------------------------------------------
  // Interactions (slash commands + buttons)
  // ---------------------------------------------------------------------

  private async onInteraction(interaction: Interaction): Promise<void> {
    const botId = this.client.user!.id;
    const botTag = this.client.user!.tag;

    if (interaction.isButton()) {
      const [scope, verb, runId] = interaction.customId.split(':');
      if (scope !== 'agent' || !runId) return;
      const approved = verb === 'confirm';
      const ctx = contextFromInteraction(interaction, botId, botTag);
      await interaction.deferUpdate();
      const outcome = await this.runtime.resume(ctx, runId, approved);
      await interaction
        .editReply({ content: truncate(outcome.response), components: [] })
        .catch(() => undefined);
      return;
    }

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
      await interaction.editReply(truncate(outcome.response));
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
