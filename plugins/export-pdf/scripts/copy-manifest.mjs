import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(scriptDir, '..');
const repoRoot = resolve(pluginDir, '../..');
const target = resolve(repoRoot, 'src-tauri/bundled-plugins/export-pdf/plugin.json');

await mkdir(dirname(target), { recursive: true });
await copyFile(resolve(pluginDir, 'plugin.json'), target);
