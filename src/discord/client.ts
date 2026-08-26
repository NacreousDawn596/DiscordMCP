import { Client, GatewayIntentBits, Partials } from 'discord.js';
import type { AppConfig } from '../config/env.js';

export function createClient(config: AppConfig): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildEmojisAndStickers,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction],
  });
  return client;
}
