import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../stores/appStore';
import { createMivraPluginApi } from '../plugins/mivraApi';
import { usePluginStore } from '../plugins/pluginStore';

describe('plugin registry', () => {
  beforeEach(() => {
    usePluginStore.getState().reset();
    useAppStore.setState({
      content: 'Hello',
      filePath: 'C:/doc.md',
      language: 'ru',
      theme: 'light',
    });
  });

  it('регистрирует и очищает кнопку тулбара', () => {
    const api = createMivraPluginApi('test-plugin');
    const dispose = api.toolbar.registerButton({
      id: 'open',
      label: 'Open',
      onClick: vi.fn(),
    });

    expect(usePluginStore.getState().toolbarButtons).toHaveLength(1);
    dispose();
    expect(usePluginStore.getState().toolbarButtons).toHaveLength(0);
  });

  it('даёт безопасное чтение документа без доступа к raw store', () => {
    const api = createMivraPluginApi('test-plugin');
    expect(api.document.getContent()).toBe('Hello');
    expect(api.document.getFilePath()).toBe('C:/doc.md');
    expect('store' in api).toBe(false);
  });

  it('подписывается на изменения контента и возвращает unsubscribe', () => {
    const api = createMivraPluginApi('test-plugin');
    const callback = vi.fn();
    const unsubscribe = api.document.subscribeContent(callback);

    useAppStore.getState().setContent('Next');
    expect(callback).toHaveBeenCalledWith('Next');

    unsubscribe();
    useAppStore.getState().setContent('Ignored');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('регистрирует renderer-диалог внешнего плагина', () => {
    const api = createMivraPluginApi('test-plugin');
    const renderer = { render: () => () => undefined };

    const dispose = api.dialogs.registerRenderer('test-dialog', renderer);
    api.dialogs.open('test-dialog', { value: 1 });

    expect(usePluginStore.getState().dialogs[0]).toMatchObject({
      id: 'test-dialog',
      pluginId: 'test-plugin',
      kind: 'renderer',
    });
    expect(usePluginStore.getState().dialogs[0]).toHaveProperty('renderer');
    expect(usePluginStore.getState().openDialogs[0]).toEqual({
      id: 'test-dialog',
      props: { value: 1 },
    });

    dispose();
    expect(usePluginStore.getState().dialogs).toHaveLength(0);
  });

  it('не публикует Export PDF как встроенный плагин после миграции', async () => {
    const { builtinPlugins } = await import('../plugins/builtinPlugins');

    expect(builtinPlugins.some((plugin) => plugin.manifest.id === 'export-pdf')).toBe(false);
  });

  it('не принимает несовместимую версию Plugin API из backend manifest', async () => {
    const { pluginInfoToManifest } = await import('../plugins/pluginManifest');

    expect(() => pluginInfoToManifest({
      id: 'future-plugin',
      name: 'Future',
      version: '1.0.0',
      description: 'Future plugin',
      author: 'Mivra',
      entry: 'index.js',
      styles: null,
      permissions: ['dialog'],
      apiVersion: 2,
      enabled: false,
    })).toThrow('plugin_api_version_unsupported');
  });

  it('не принимает неизвестный permission из backend manifest', async () => {
    const { pluginInfoToManifest } = await import('../plugins/pluginManifest');

    expect(() => pluginInfoToManifest({
      id: 'bad-permission-plugin',
      name: 'Bad Permission',
      version: '1.0.0',
      description: 'Bad permission plugin',
      author: 'Mivra',
      entry: 'index.js',
      styles: null,
      permissions: ['dialog', 'fs'],
      apiVersion: 1,
      enabled: false,
    })).toThrow('plugin_permission_unsupported');
  });

  it('принимает document:write permission из backend manifest', async () => {
    const { pluginInfoToManifest } = await import('../plugins/pluginManifest');

    const manifest = pluginInfoToManifest({
      id: 'writer-plugin',
      name: 'Writer',
      version: '1.0.0',
      description: 'Writer plugin',
      author: 'Mivra',
      entry: 'index.js',
      styles: null,
      permissions: ['document:read', 'document:write', 'dialog'],
      apiVersion: 1,
      enabled: false,
    });

    expect(manifest.permissions).toEqual(['document:read', 'document:write', 'dialog']);
  });
});
