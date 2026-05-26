import { describe, expect, it } from 'vitest';
import { createMivraPluginApi } from '../plugins/mivraApi';
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
});
