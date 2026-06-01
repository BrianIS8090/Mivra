import { copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(scriptDir, '..');

await copyFile(resolve(pluginDir, 'plugin.json'), resolve(pluginDir, 'dist/plugin.json'));
