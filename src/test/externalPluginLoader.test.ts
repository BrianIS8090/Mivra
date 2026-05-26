import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadExternalPlugin } from '../plugins/externalPluginLoader';
import { ensureExternalPluginRegistry } from '../plugins/externalPluginRegistry';
import type { PluginManifest } from '../plugins/types';

vi.mock('../utils/tauri', async () => {
  const actual = await vi.importActual<typeof import('../utils/tauri')>('../utils/tauri');
  return {
    ...actual,
    getPluginAssetPath: vi.fn(async (_pluginId: string, relativePath: string) => (
      `\\\\?\\C:\\Users\\Brian\\AppData\\Roaming\\com.brian.mivra\\plugins\\export-pdf\\${relativePath.replace(/\//g, '\\')}`
    )),
    readPluginAssetBytes: vi.fn(async (_pluginId: string, relativePath: string) => (
      new TextEncoder().encode(relativePath)
    )),
  };
});

const manifest: PluginManifest = {
  id: 'export-pdf',
  name: 'Export PDF',
  version: '1.0.0',
  description: 'Export PDF',
  author: 'Mivra Team',
  entry: 'index.js',
  styles: 'style.css',
  permissions: ['document:read', 'dialog', 'export:pdf'],
  apiVersion: 1,
};

describe('external plugin loader', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    delete window.MivraExternalPlugin;
    delete window.__mivraResolvePluginAsset;
    delete window.__mivraReadPluginAssetBytes;
  });

  it('загружает CSS, импортирует entry и активирует зарегистрированный модуль', async () => {
    const activate = vi.fn(() => vi.fn());
    const dispose = await loadExternalPlugin(manifest, async () => {
      ensureExternalPluginRegistry().register({ id: 'export-pdf', activate });
    });

    expect(document.head.querySelector('link[href="https://asset.localhost/C%3A%2FUsers%2FBrian%2FAppData%2FRoaming%2Fcom.brian.mivra%2Fplugins%2Fexport-pdf%2Fstyle.css?mivra_plugin=export-pdf%401.0.0"]')).not.toBeNull();
    expect(activate).toHaveBeenCalledTimes(1);

    dispose();
    expect(document.head.querySelector('link')).toBeNull();
  });

  it('повторно активирует модуль после кэшированного import в React StrictMode', async () => {
    const activate = vi.fn(() => vi.fn());
    let imports = 0;
    const importer = async () => {
      imports += 1;
      if (imports === 1) {
        ensureExternalPluginRegistry().register({ id: 'export-pdf', activate });
      }
    };

    const disposeFirst = await loadExternalPlugin(manifest, importer);
    disposeFirst();

    const disposeSecond = await loadExternalPlugin(manifest, importer);

    expect(activate).toHaveBeenCalledTimes(2);
    disposeSecond();
  });

  it('восстанавливает asset refs после повторной загрузки кэшированного модуля', async () => {
    let imports = 0;
    let fontUrl = '';
    const importer = async () => {
      imports += 1;
      if (imports === 1) {
        fontUrl = window.__mivraResolvePluginAsset?.('export-pdf', 'assets/font.ttf') ?? '';
        ensureExternalPluginRegistry().register({ id: 'export-pdf', activate: () => undefined });
      }
    };

    const disposeFirst = await loadExternalPlugin(manifest, importer);
    await expect(window.__mivraReadPluginAssetBytes?.(fontUrl)).resolves.toEqual(
      new TextEncoder().encode('assets/font.ttf'),
    );

    disposeFirst();
    await expect(window.__mivraReadPluginAssetBytes?.(fontUrl)).rejects.toThrow('plugin_asset_url_unknown');

    const disposeSecond = await loadExternalPlugin(manifest, importer);

    expect(imports).toBe(2);
    await expect(window.__mivraReadPluginAssetBytes?.(fontUrl)).resolves.toEqual(
      new TextEncoder().encode('assets/font.ttf'),
    );
    disposeSecond();
  });

  it('не активирует старый модуль, если новая версия entry не зарегистрировалась', async () => {
    const activate = vi.fn(() => vi.fn());
    const disposeFirst = await loadExternalPlugin(manifest, async () => {
      ensureExternalPluginRegistry().register({ id: 'export-pdf', activate });
    });
    disposeFirst();

    await expect(loadExternalPlugin({
      ...manifest,
      version: '1.0.1',
    }, async () => undefined)).rejects.toThrow('plugin_register_missing');
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('резолвит built assets относительно папки плагина и читает их байты через backend', async () => {
    const importedUrls: string[] = [];
    const dispose = await loadExternalPlugin(manifest, async (url) => {
      importedUrls.push(url);
      ensureExternalPluginRegistry().register({ id: 'export-pdf', activate: () => undefined });
    });
    const assetUrl = window.__mivraResolvePluginAsset?.('export-pdf', 'assets/font.ttf');

    expect(importedUrls).toEqual([
      'https://asset.localhost/C%3A%2FUsers%2FBrian%2FAppData%2FRoaming%2Fcom.brian.mivra%2Fplugins%2Fexport-pdf%2Findex.js?mivra_plugin=export-pdf%401.0.0',
    ]);

    expect(window.__mivraResolvePluginAsset?.('export-pdf', 'chunks/pdfmake.js')).toBe(
      'https://asset.localhost/C%3A%2FUsers%2FBrian%2FAppData%2FRoaming%2Fcom.brian.mivra%2Fplugins%2Fexport-pdf%2Fchunks%2Fpdfmake.js?mivra_plugin=export-pdf%401.0.0',
    );
    expect(assetUrl).toBe(
      'https://asset.localhost/C%3A%2FUsers%2FBrian%2FAppData%2FRoaming%2Fcom.brian.mivra%2Fplugins%2Fexport-pdf%2Fassets%2Ffont.ttf?mivra_plugin=export-pdf%401.0.0',
    );
    await expect(window.__mivraReadPluginAssetBytes?.(assetUrl ?? '')).resolves.toEqual(
      new TextEncoder().encode('assets/font.ttf'),
    );
    expect(() => window.__mivraResolvePluginAsset?.('export-pdf', '../secret.js')).toThrow('plugin_path');

    dispose();
    await expect(window.__mivraReadPluginAssetBytes?.(assetUrl ?? '')).rejects.toThrow('plugin_asset_url_unknown');
  });
});
