import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const commands = [];

for (const folder of readdirSync(join(__dirname, 'commands'))) {
  for (const file of readdirSync(join(__dirname, 'commands', folder)).filter(f => f.endsWith('.js'))) {
    const mod = await import(pathToFileURL(join(__dirname, 'commands', folder, file)).href);
    if (mod.default?.data) commands.push(mod.default.data.toJSON());
  }
}

await new REST().setToken(process.env.DISCORD_TOKEN).put(
  Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
  { body: commands }
);

console.log(`Deployed ${commands.length} commands.`);
