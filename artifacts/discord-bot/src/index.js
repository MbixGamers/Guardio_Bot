import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { initStore } from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Global crash guards ───────────────────────────────────────────────────────
// Prevent any single unhandled promise rejection or exception from killing the
// whole process — log it and keep the bot alive.
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
});

// Log Discord client-level errors without crashing
client.on('error', (err) => console.error('[CLIENT ERROR]', err));
client.on('warn',  (msg) => console.warn('[CLIENT WARN]', msg));

client.commands = new Collection();
initStore();

// Load commands
for (const folder of readdirSync(join(__dirname, 'commands'))) {
  for (const file of readdirSync(join(__dirname, 'commands', folder)).filter(f => f.endsWith('.js'))) {
    const mod = await import(pathToFileURL(join(__dirname, 'commands', folder, file)).href);
    if (mod.default?.data) {
      client.commands.set(mod.default.data.name, mod.default);
      console.log(`[CMD] ${mod.default.data.name}`);
    }
  }
}

// Load events
for (const file of readdirSync(join(__dirname, 'events')).filter(f => f.endsWith('.js'))) {
  const mod = await import(pathToFileURL(join(__dirname, 'events', file)).href);
  for (const ev of Object.values(mod)) {
    if (!ev?.name) continue;
    ev.once
      ? client.once(ev.name, (...a) => ev.execute(...a, client))
      : client.on(ev.name,  (...a) => ev.execute(...a, client));
    console.log(`[EVT] ${ev.name}`);
  }
}

client.login(process.env.DISCORD_TOKEN);
