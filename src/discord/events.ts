import { Events, type Client, type Guild, type GuildMember, type Message, type Interaction } from 'discord.js';
import type { EventPayload } from '../automation/engine.js';

export interface DiscordHandlers {
  onMessage(message: Message): Promise<void>;
  onInteraction(interaction: Interaction): Promise<void>;
  onGuildJoin(guild: Guild): Promise<void>;
  onEvent(trigger: string, payload: EventPayload): Promise<void>;
}

export function registerEvents(client: Client, handlers: DiscordHandlers): void {
  client.on(Events.ClientReady, () => {
    // no-op; handled at app level
  });

  client.on(Events.MessageCreate, (message) => {
    void handlers.onMessage(message);
  });

  client.on(Events.InteractionCreate, (interaction) => {
    void handlers.onInteraction(interaction);
  });

  client.on(Events.GuildCreate, (guild) => {
    void handlers.onGuildJoin(guild);
  });

  // Automation / event-driven behavior.
  client.on(Events.MessageCreate, (message) => {
    if (!message.guild) return;
    void handlers.onEvent('message_create', {
      guild: message.guild,
      member: message.member,
      message,
      channelId: message.channelId,
    });
  });

  client.on(Events.GuildMemberAdd, (member) => {
    void handlers.onEvent('member_join', { guild: member.guild, member, channelId: null });
  });

  client.on(Events.GuildMemberRemove, (member) => {
    void handlers.onEvent('member_leave', {
      guild: member.guild,
      member: member as unknown as GuildMember,
      channelId: null,
    });
  });

  client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    void handlers.onEvent('member_update', {
      guild: newMember.guild,
      member: newMember as unknown as GuildMember,
      channelId: null,
    });
  });

  client.on(Events.ChannelCreate, (channel) => {
    if (!('guild' in channel)) return;
    void handlers.onEvent('channel_create', { guild: channel.guild, channelId: channel.id });
  });

  client.on(Events.ChannelDelete, (channel) => {
    if (!('guild' in channel)) return;
    void handlers.onEvent('channel_delete', { guild: channel.guild, channelId: channel.id });
  });

  client.on(Events.GuildRoleCreate, (role) => {
    void handlers.onEvent('role_create', { guild: role.guild, channelId: null });
  });

  client.on(Events.GuildRoleDelete, (role) => {
    void handlers.onEvent('role_delete', { guild: role.guild, channelId: null });
  });

  client.on(Events.ThreadCreate, (thread) => {
    if (!('guild' in thread)) return;
    void handlers.onEvent('thread_create', { guild: thread.guild, channelId: thread.id });
  });

  client.on(Events.MessageReactionAdd, (reaction) => {
    const guild = reaction.message.guild;
    if (!guild) return;
    void handlers.onEvent('reaction_add', {
      guild,
      member: null,
      message: reaction.message.partial ? null : reaction.message,
      channelId: reaction.message.channelId,
    });
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    const guild = newState.guild;
    void handlers.onEvent('voice_state_update', { guild, member: newState.member, channelId: newState.channelId });
  });
}
