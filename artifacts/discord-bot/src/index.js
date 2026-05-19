import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import { loadCommands } from './handlers/commandHandler.js';
import { loadEvents } from './handlers/eventHandler.js';
import { initDatabase } from './db/database.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.commands = new Collection();

initDatabase();
await loadCommands(client);
await loadEvents(client);

client.login(process.env.DISCORD_TOKEN);
