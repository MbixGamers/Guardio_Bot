import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadEvents(client) {
  const eventsPath = join(__dirname, '../events');
  const files = readdirSync(eventsPath).filter(f => f.endsWith('.js'));

  for (const file of files) {
    const filePath = pathToFileURL(join(eventsPath, file)).href;
    const mod = await import(filePath);

    // Register default export
    const ev = mod.default;
    if (ev?.name && ev?.execute) {
      if (ev.once) {
        client.once(ev.name, (...args) => ev.execute(...args, client));
      } else {
        client.on(ev.name, (...args) => ev.execute(...args, client));
      }
      console.log(`[EVT] Loaded: ${ev.name}`);
    }

    // Register named exports (for multi-event files like nukeDetection)
    for (const [key, namedExport] of Object.entries(mod)) {
      if (key === 'default') continue;
      if (namedExport?.name && namedExport?.execute) {
        if (namedExport.once) {
          client.once(namedExport.name, (...args) => namedExport.execute(...args, client));
        } else {
          client.on(namedExport.name, (...args) => namedExport.execute(...args, client));
        }
        console.log(`[EVT] Loaded: ${namedExport.name} (from ${file})`);
      }
    }
  }
}
