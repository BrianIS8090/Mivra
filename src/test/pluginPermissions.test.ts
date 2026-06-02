import { beforeEach, describe, expect, it } from 'vitest';
import { createMivraPluginApi } from '../plugins/mivraApi';
import { useAppStore } from '../stores/appStore';
import type { PluginManifest } from '../plugins/types';

const baseManifest: PluginManifest = {
  id: 'test-plugin',
  name: 'Test',
  version: '1.0.0',
  description: 'Test',
  author: 'Test',
  permissions: [],
  apiVersion: 1,
};

describe('plugin permissions', () => {
  beforeEach(() => {
    useAppStore.setState({
      content: 'Old content',
      isDirty: false,
    });
  });

  it('запрещает чтение документа без document:read', () => {
    const api = createMivraPluginApi('test-plugin', baseManifest);

    expect(() => api.document.getContent()).toThrow('permission_denied');
  });

  it('разрешает чтение документа с document:read', () => {
    const api = createMivraPluginApi('test-plugin', {
      ...baseManifest,
      permissions: ['document:read'],
    });

    expect(() => api.document.getContent()).not.toThrow();
  });

  it('запрещает запись документа без document:write', () => {
    const api = createMivraPluginApi('test-plugin', baseManifest);

    expect(() => api.document.setContent('New content')).toThrow('permission_denied');
    expect(useAppStore.getState().content).toBe('Old content');
  });

  it('разрешает запись документа с document:write и помечает документ изменённым', () => {
    const api = createMivraPluginApi('test-plugin', {
      ...baseManifest,
      permissions: ['document:write'],
    });

    api.document.setContent('New content');

    expect(useAppStore.getState().content).toBe('New content');
    expect(useAppStore.getState().isDirty).toBe(true);
  });

  it('запрещает сохранение asset без assets:write', async () => {
    const api = createMivraPluginApi('test-plugin', baseManifest);

    await expect(api.assets.saveBytes({
      bytes: new Uint8Array([1, 2, 3]),
      filename: 'image.png',
      kind: 'image',
    })).rejects.toThrow('permission_denied');
  });

  it('разрешает доступ к assets API с assets:write', () => {
    const api = createMivraPluginApi('test-plugin', {
      ...baseManifest,
      permissions: ['assets:write'],
    });

    expect(api.assets).toBeDefined();
    expect(typeof api.assets.saveBytes).toBe('function');
  });
});
