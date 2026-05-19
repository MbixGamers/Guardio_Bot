import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const commands = [];
const commandFolders = readdirSync(join(__dirname, 'commands'));

for (const folder of commandFolders) {
  const commandFiles = readdirSync(join(__dirname, 'commands', folder)).filter(f => f.endsWith('.js'));
  for (const file of commandFiles) {
    const command = await import(pathToFileURL(join(__dirname, 'commands', folder, file)).href);
    if (command.default?.data) {
      commands.push(command.default.data.toJSON());
      console.log(`[DEPLOY] Queued: ${command.default.data.name}`);
    }
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

try {
  console.log(`Deploying ${commands.length} slash commands globally...`);
  await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands });
  console.log('Successfully deployed slash commands.');
} catch (err) {
  console.error(err);
}
