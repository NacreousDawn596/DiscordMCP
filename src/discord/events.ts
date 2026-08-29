import { Events, type Client, type Guild, type GuildMember, type Message, type Interaction } from 'discord.js';
import type { EventPayload } from '../automation/engine.js';
import { getLogger } from '../logging/logger.js';

export interface DiscordHandlers {
  onMessage(message: Message): Promise<void>;
  onInteraction(interaction: Interaction): Promise<void>;
  onGuildJoin(guild: Guild): Promise<void>;
  onEvent(trigger: string, payload: EventPayload): Promise<void>;
}

function run(task: Promise<void>, label: string): void {
  task.catch((err) => getLogger().error({ err }, `${label} failed`));
}

export function registerEvents(client: Client, handlers: DiscordHandlers): void {
  client.on(Events.ClientReady, () => {
    // no-op; handled at app level
  });

  client.on(Events.MessageCreate, (message) => {
    run(handlers.onMessage(message), 'message handler');
  });

  client.on(Events.InteractionCreate, (interaction) => {
    run(handlers.onInteraction(interaction), 'interaction handler');
  });

  client.on(Events.GuildCreate, (guild) => {
    run(handlers.onGuildJoin(guild), 'guild join handler');
  });

  // Automation / event-driven behavior.
  client.on(Events.MessageCreate, (message) => {
    if (!message.guild) return;
    run(handlers.onEvent('message_create', {
      guild: message.guild,
      member: message.member,
      user: { id: message.author.id, bot: message.author.bot },
      message,
      channelId: message.channelId,
    }), 'automation event');
  });

  client.on(Events.GuildMemberAdd, (member) => {
    run(handlers.onEvent('member_join', { guild: member.guild, member, channelId: null }), 'automation event');
  });

  client.on(Events.GuildMemberRemove, (member) => {
    run(handlers.onEvent('member_leave', {
      guild: member.guild,
      member: member as unknown as GuildMember,
      channelId: null,
    }), 'automation event');
  });

  client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    run(handlers.onEvent('member_update', {
      guild: newMember.guild,
      member: newMember as unknown as GuildMember,
      channelId: null,
    }), 'automation event');
  });

  client.on(Events.ChannelCreate, (channel) => {
    if (!('guild' in channel)) return;
    run(handlers.onEvent('channel_create', { guild: channel.guild, channelId: channel.id }), 'automation event');
  });

  client.on(Events.ChannelDelete, (channel) => {
    if (!('guild' in channel)) return;
    run(handlers.onEvent('channel_delete', { guild: channel.guild, channelId: channel.id }), 'automation event');
  });

  client.on(Events.GuildRoleCreate, (role) => {
    run(handlers.onEvent('role_create', { guild: role.guild, channelId: null }), 'automation event');
  });

  client.on(Events.GuildRoleDelete, (role) => {
    run(handlers.onEvent('role_delete', { guild: role.guild, channelId: null }), 'automation event');
  });

  client.on(Events.ThreadCreate, (thread) => {
    if (!('guild' in thread)) return;
    run(handlers.onEvent('thread_create', { guild: thread.guild, channelId: thread.id }), 'automation event');
  });

  client.on(Events.MessageReactionAdd, (reaction, user) => {
    void handleReactionEvent('reaction_add', reaction, user, handlers);
  });

  client.on(Events.MessageReactionRemove, (reaction, user) => {
    void handleReactionEvent('reaction_remove', reaction, user, handlers);
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    const guild = newState.guild;
    run(handlers.onEvent('voice_state_update', { guild, member: newState.member, channelId: newState.channelId }), 'automation event');
  });
}

async function handleReactionEvent(
  trigger: 'reaction_add' | 'reaction_remove',
  reaction: import('discord.js').MessageReaction | import('discord.js').PartialMessageReaction,
  user: import('discord.js').User | import('discord.js').PartialUser,
  handlers: DiscordHandlers,
): Promise<void> {
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
    if (user.partial) await user.fetch();

    const guild = reaction.message.guild;
    if (!guild) return;

    const member =
      guild.members.cache.get(user.id) ?? (await guild.members.fetch(user.id).catch(() => null));

    const emojiName = reaction.emoji.name;
    const emojiId = reaction.emoji.id;
    const emojiStr = emojiName ?? emojiId ?? '';

    run(
      handlers.onEvent(trigger, {
        guild,
        member,
        user: { id: user.id, bot: user.bot },
        message: reaction.message,
        messageId: reaction.message.id,
        channelId: reaction.message.channelId,
        emoji: { name: emojiName, id: emojiId, identifier: emojiStr },
      }),
      `automation event (${trigger})`,
    );
  } catch (err) {
    getLogger().debug({ err }, `failed to process ${trigger}`);
  }
}

