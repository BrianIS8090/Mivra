import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FakePluginApi = {
  toolbar: {
    registerButton: ReturnType<typeof vi.fn>;
  };
  dialogs: {
    registerRenderer: ReturnType<typeof vi.fn>;
    open: ReturnType<typeof vi.fn>;
  };
};

type RegisteredPlugin = {
  id: string;
  activate: (api: FakePluginApi) => void | (() => void);
};

const pluginDir = resolve(process.cwd(), 'plugins/markitdown-import');

async function loadPlugin(): Promise<RegisteredPlugin> {
  let registered: RegisteredPlugin | null = null;

  Object.defineProperty(window, 'MivraExternalPlugin', {
    configurable: true,
    value: {
      register: (plugin: RegisteredPlugin) => {
        registered = plugin;
      },
    },
  });

  vi.resetModules();
  await import('../../plugins/markitdown-import/src/index');

  if (!registered) {
    throw new Error('Плагин не зарегистрирован');
  }

  return registered;
}

function createFakeApi(): FakePluginApi {
  return {
    toolbar: {
      registerButton: vi.fn(() => vi.fn()),
    },
    dialogs: {
      registerRenderer: vi.fn(() => vi.fn()),
      open: vi.fn(),
    },
  };
}

describe('markitdown import plugin', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('имеет валидный manifest для внешнего плагина Mivra API v1', () => {
    const manifest = JSON.parse(readFileSync(resolve(pluginDir, 'plugin.json'), 'utf8'));

    expect(manifest).toMatchObject({
      id: 'markitdown-import',
      name: 'Import to Markdown',
      version: '1.0.0',
      entry: 'index.js',
      styles: 'style.css',
      permissions: ['document:read', 'document:write', 'dialog', 'assets:write'],
      apiVersion: 1,
    });
  });

  it('регистрирует пункт меню и renderer-диалог', async () => {
    const plugin = await loadPlugin();
    const api = createFakeApi();

    const cleanup = plugin.activate(api);

    expect(api.dialogs.registerRenderer).toHaveBeenCalledWith(
      'markitdown-import-dialog',
      expect.objectContaining({ render: expect.any(Function) }),
    );
    expect(api.toolbar.registerButton).toHaveBeenCalledWith(expect.objectContaining({
      id: 'markitdown-import-open',
      label: 'Import to Markdown',
      onClick: expect.any(Function),
    }));

    const renderer = api.dialogs.registerRenderer.mock.calls[0][1];
    const container = document.createElement('div');
    renderer.render({ container });

    expect(container.querySelector('.markitdown-import')).not.toBeNull();
    expect(container.querySelector('[data-markitdown-import-file]')).not.toBeNull();

    cleanup?.();
  });
});
