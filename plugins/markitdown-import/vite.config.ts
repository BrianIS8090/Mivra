import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const pluginDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  publicDir: false,
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
