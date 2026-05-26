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
});
