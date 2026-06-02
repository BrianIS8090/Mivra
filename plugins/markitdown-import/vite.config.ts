import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const pluginDir = dirname(fileURLToPath(import.meta.url));
const pluginId = 'markitdown-import';

export default defineConfig({
  base: './',
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
    outDir: resolve(pluginDir, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      input: resolve(pluginDir, 'src/index.ts'),
      output: {
        format: 'es',
        inlineDynamicImports: true,
        entryFileNames: 'index.js',
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
