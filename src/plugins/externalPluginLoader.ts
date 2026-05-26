import { convertFileSrc } from '@tauri-apps/api/core';
import { ensureExternalPluginRegistry } from './externalPluginRegistry';
import { createMivraPluginApi } from './mivraApi';
import * as tauri from '../utils/tauri';
import type { PluginManifest } from './types';

export type ExternalPluginImporter = (url: string) => Promise<unknown>;

type PluginAssetRef = {
  pluginId: string;
  relativePath: string;
};

const pluginAssetRoots = new Map<string, string>();
const pluginAssetRefs = new Map<string, PluginAssetRef>();
const pluginAssetRefsByCacheKey = new Map<string, Map<string, PluginAssetRef>>();
const pluginAssetUrlsByPlugin = new Map<string, Set<string>>();
const pluginAssetCacheKeys = new Map<string, string>();
const loadedPluginModuleKeys = new Map<string, string>();

function normalizeAssetPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/g, '');

  if (normalized.startsWith('//?/UNC/')) {
    return `//${normalized.slice('//?/UNC/'.length)}`;
  }

  if (normalized.startsWith('//?/')) {
    return normalized.slice('//?/'.length);
  }

  return normalized;
}

function validateBuiltAssetPath(relativePath: string): void {
  if (
    !relativePath
    || relativePath.startsWith('/')
    || relativePath.startsWith('\\')
    || relativePath.includes('\\')
    || relativePath.split('/').some((part) => part === '..' || part === '')
    || /^[a-z][a-z0-9+.-]*:/i.test(relativePath)
  ) {
    throw new Error('plugin_path: путь должен быть относительным файлом внутри плагина');
  }
}

function pluginRootFromAssetPath(assetPath: string, relativePath: string): string {
  const normalizedPath = normalizeAssetPath(assetPath);
  const relativeSegments = relativePath.split('/').filter(Boolean);
  const pathSegments = normalizedPath.split('/');
  pathSegments.splice(Math.max(0, pathSegments.length - relativeSegments.length), relativeSegments.length);
  return pathSegments.join('/');
}

function ensurePluginAssetResolver(): void {
  window.__mivraResolvePluginAsset = (pluginId, relativePath) => {
    validateBuiltAssetPath(relativePath);
    const root = pluginAssetRoots.get(pluginId);
    if (!root) {
      throw new Error(`plugin_root_missing: ${pluginId}`);
    }
    const url = appendPluginCacheKey(
      convertFileSrc(`${root}/${relativePath}`),
      pluginAssetCacheKeys.get(pluginId),
    );
    rememberPluginAssetRef(url, { pluginId, relativePath });

    const urls = pluginAssetUrlsByPlugin.get(pluginId) ?? new Set<string>();
    urls.add(url);
    pluginAssetUrlsByPlugin.set(pluginId, urls);

    return url;
  };

  window.__mivraReadPluginAssetBytes = async (assetUrl) => {
    const assetRef = pluginAssetRefs.get(assetUrl);
    if (!assetRef) {
      throw new Error('plugin_asset_url_unknown');
    }

    return tauri.readPluginAssetBytes(assetRef.pluginId, assetRef.relativePath);
  };
}

function rememberPluginAssetRef(url: string, assetRef: PluginAssetRef): void {
  pluginAssetRefs.set(url, assetRef);

  const cacheKey = pluginAssetCacheKeys.get(assetRef.pluginId);
  if (!cacheKey) return;

  const cachedRefs = pluginAssetRefsByCacheKey.get(cacheKey) ?? new Map<string, PluginAssetRef>();
  cachedRefs.set(url, assetRef);
  pluginAssetRefsByCacheKey.set(cacheKey, cachedRefs);
}

function restorePluginAssetRefs(pluginId: string, cacheKey: string): void {
  const cachedRefs = pluginAssetRefsByCacheKey.get(cacheKey);
  if (!cachedRefs) return;

  const activeUrls = pluginAssetUrlsByPlugin.get(pluginId) ?? new Set<string>();
  for (const [url, assetRef] of cachedRefs) {
    if (assetRef.pluginId !== pluginId) continue;
    pluginAssetRefs.set(url, assetRef);
    activeUrls.add(url);
  }
  if (activeUrls.size > 0) {
    pluginAssetUrlsByPlugin.set(pluginId, activeUrls);
  }
}

function clearPluginAssetUrls(pluginId: string): void {
  const urls = pluginAssetUrlsByPlugin.get(pluginId);
  if (!urls) return;

  for (const url of urls) {
    pluginAssetRefs.delete(url);
  }
  pluginAssetUrlsByPlugin.delete(pluginId);
}

async function pluginAssetPath(pluginId: string, relativePath: string): Promise<string> {
  return tauri.getPluginAssetPath(pluginId, relativePath);
}

function pluginAssetUrl(path: string): string {
  return convertFileSrc(normalizeAssetPath(path));
}

function pluginCacheKey(manifest: PluginManifest): string {
  return `${manifest.id}@${manifest.version}`;
}

function appendPluginCacheKey(url: string, cacheKey: string | undefined): string {
  if (!cacheKey) return url;

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}mivra_plugin=${encodeURIComponent(cacheKey)}`;
}

export async function loadExternalPlugin(
  manifest: PluginManifest,
  importer: ExternalPluginImporter = (url) => import(/* @vite-ignore */ url),
): Promise<() => void> {
  if (!manifest.entry) {
    throw new Error(`plugin_entry_missing: ${manifest.id}`);
  }

  const registry = ensureExternalPluginRegistry();
  const cleanup: Array<() => void> = [];
  ensurePluginAssetResolver();
  const cacheKey = pluginCacheKey(manifest);

  if (manifest.styles) {
    const path = await pluginAssetPath(manifest.id, manifest.styles);
    const href = appendPluginCacheKey(pluginAssetUrl(path), cacheKey);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
    cleanup.push(() => link.remove());
  }

  try {
    const entryPath = await pluginAssetPath(manifest.id, manifest.entry);
    pluginAssetRoots.set(manifest.id, pluginRootFromAssetPath(entryPath, manifest.entry));
    pluginAssetCacheKeys.set(manifest.id, cacheKey);
    restorePluginAssetRefs(manifest.id, cacheKey);
    cleanup.push(() => {
      clearPluginAssetUrls(manifest.id);
      pluginAssetRoots.delete(manifest.id);
      pluginAssetCacheKeys.delete(manifest.id);
    });

    const entryUrl = appendPluginCacheKey(pluginAssetUrl(entryPath), cacheKey);
    const registerPluginModule = registry.register;
    let registeredForThisLoad = false;
    registry.register = (module) => {
      registerPluginModule(module);
      if (module.id === manifest.id) {
        registeredForThisLoad = true;
        loadedPluginModuleKeys.set(manifest.id, cacheKey);
      }
    };
    try {
      await importer(entryUrl);
    } finally {
      registry.register = registerPluginModule;
    }

    const module = registry.get(manifest.id);
    if (
      !module
      || (!registeredForThisLoad && loadedPluginModuleKeys.get(manifest.id) !== cacheKey)
    ) {
      throw new Error(`plugin_register_missing: ${manifest.id}`);
    }

    const pluginCleanup = await module.activate(createMivraPluginApi(manifest.id, manifest));
    if (pluginCleanup) cleanup.push(pluginCleanup);

    return () => {
      for (const dispose of cleanup.reverse()) {
        dispose();
      }
    };
  } catch (error) {
    for (const dispose of cleanup.reverse()) {
      dispose();
    }
    throw error;
  }
}
