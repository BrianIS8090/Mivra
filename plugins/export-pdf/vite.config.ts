import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const pluginDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(pluginDir, '../..');
const pluginId = 'export-pdf';

export default defineConfig({
  base: './',
  plugins: [react()],
  publicDir: false,
  experimental: {
    renderBuiltUrl(filename, { hostType }) {
      if (hostType === 'js') {
        return {
          runtime: `window.__mivraResolvePluginAsset(${JSON.stringify(pluginId)}, ${JSON.stringify(filename)})`,
        };
      }
      return { relative: true };
    },
  },
  build: {
    outDir: resolve(repoRoot, 'src-tauri/bundled-plugins/export-pdf'),
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      input: resolve(pluginDir, 'src/register.tsx'),
      output: {
        format: 'es',
        inlineDynamicImports: true,
        entryFileNames: 'index.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return 'style.css';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
});
