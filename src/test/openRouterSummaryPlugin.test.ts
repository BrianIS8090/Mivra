import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RegisteredPlugin = {
  id: string;
  activate: (api: FakePluginApi) => () => void;
};

type FakePluginApi = {
  toolbar: {
    registerButton: ReturnType<typeof vi.fn>;
  };
  dialogs: {
    registerRenderer: ReturnType<typeof vi.fn>;
    open: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  document: {
    getContent: ReturnType<typeof vi.fn>;
    getFilePath: ReturnType<typeof vi.fn>;
    subscribeContent: ReturnType<typeof vi.fn>;
  };
};

const pluginDir = resolve(process.cwd(), 'plugins/openrouter-summary');
const tauriConfigPath = resolve(process.cwd(), 'src-tauri/tauri.conf.json');

function loadPlugin(): RegisteredPlugin {
  let registered: RegisteredPlugin | null = null;

  Object.defineProperty(window, 'MivraExternalPlugin', {
    configurable: true,
    value: {
      register: (plugin: RegisteredPlugin) => {
        registered = plugin;
      },
    },
  });

  const code = readFileSync(resolve(pluginDir, 'index.js'), 'utf8');
  window.eval(code);

  if (!registered) {
    throw new Error('Плагин не зарегистрирован');
  }

  return registered;
}

function createFakeApi(overrides: Partial<FakePluginApi['document']> = {}): FakePluginApi {
  return {
    toolbar: {
      registerButton: vi.fn(() => vi.fn()),
    },
    dialogs: {
      registerRenderer: vi.fn(() => vi.fn()),
      open: vi.fn(),
      close: vi.fn(),
    },
    document: {
      getContent: vi.fn(() => '# Заголовок\n\nТекст документа.'),
      getFilePath: vi.fn(() => 'C:/docs/demo.md'),
      subscribeContent: vi.fn(() => vi.fn()),
      ...overrides,
    },
  };
}

describe('openrouter-summary plugin', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('имеет валидный manifest для внешнего плагина Mivra API v1', () => {
    const manifest = JSON.parse(readFileSync(resolve(pluginDir, 'plugin.json'), 'utf8'));

    expect(manifest).toMatchObject({
      id: 'openrouter-summary',
      name: 'OpenRouter Summary',
      version: '1.0.1',
      entry: 'index.js',
      styles: 'style.css',
      permissions: ['document:read', 'dialog'],
      apiVersion: 1,
    });
  });

  it('разрешает сетевые запросы к OpenRouter в Tauri CSP', () => {
    const config = JSON.parse(readFileSync(tauriConfigPath, 'utf8'));
    const csp = config.app.security.csp;

    expect(csp).toContain('connect-src');
    expect(csp).toContain('https://openrouter.ai');
  });

  it('регистрирует пункт меню и ресайзабельный диалог', () => {
    const plugin = loadPlugin();
    const api = createFakeApi();

    const cleanup = plugin.activate(api);

    expect(api.dialogs.registerRenderer).toHaveBeenCalledWith(
      'openrouter-summary-dialog',
      expect.objectContaining({ render: expect.any(Function) }),
    );
    expect(api.toolbar.registerButton).toHaveBeenCalledWith(expect.objectContaining({
      id: 'openrouter-summary-open',
      label: 'Суммаризация',
      onClick: expect.any(Function),
    }));

    const renderer = api.dialogs.registerRenderer.mock.calls[0][1];
    const container = document.createElement('div');
    const dispose = renderer.render({ container, api });

    expect(container.querySelector('.openrouter-summary-dialog')).not.toBeNull();
    expect(container.querySelector('[data-openrouter-summary-resize]')).not.toBeNull();

    dispose();
    cleanup();
  });

  it('отправляет текущий Markdown в OpenRouter и показывает ответ', async () => {
    const plugin = loadPlugin();
    const api = createFakeApi();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: 'Краткое резюме документа.' } },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    plugin.activate(api);
    const renderer = api.dialogs.registerRenderer.mock.calls[0][1];
    const container = document.createElement('div');
    renderer.render({ container, api });

    const keyInput = container.querySelector('[data-openrouter-summary-key]');
    const form = container.querySelector('[data-openrouter-summary-form]');
    if (!(keyInput instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) {
      throw new Error('Форма суммаризации не найдена');
    }

    keyInput.value = 'sk-or-test';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolvePromise) => window.setTimeout(resolvePromise, 0));

    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-or-test',
          'Content-Type': 'application/json',
          'X-OpenRouter-Title': 'Mivra OpenRouter Summary',
        }),
      }),
    );
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('X-Title');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages.at(-1).content).toContain('# Заголовок');
    expect(container.textContent).toContain('Краткое резюме документа.');
  });

  it('не растягивает сайдбар длинным именем файла', () => {
    const plugin = loadPlugin();
    const api = createFakeApi({
      getFilePath: vi.fn(() => 'C:/docs/tenderplan_closed_designer_lighting_refined_2026-05-19_final_version_very_long_name.md'),
    });

    plugin.activate(api);
    const renderer = api.dialogs.registerRenderer.mock.calls[0][1];
    const container = document.createElement('div');
    renderer.render({ container, api });

    const documentName = container.querySelector('[data-openrouter-summary-document-name]');

    expect(documentName).not.toBeNull();
    expect(documentName).toHaveClass('openrouter-summary-stat-value');
    expect(documentName).toHaveAttribute(
      'title',
      'tenderplan_closed_designer_lighting_refined_2026-05-19_final_version_very_long_name.md',
    );
  });

  it('показывает понятную ошибку, если WebView блокирует сетевой запрос', async () => {
    const plugin = loadPlugin();
    const api = createFakeApi();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    plugin.activate(api);
    const renderer = api.dialogs.registerRenderer.mock.calls[0][1];
    const container = document.createElement('div');
    renderer.render({ container, api });

    const keyInput = container.querySelector('[data-openrouter-summary-key]');
    const form = container.querySelector('[data-openrouter-summary-form]');
    if (!(keyInput instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) {
      throw new Error('Форма суммаризации не найдена');
    }

    keyInput.value = 'sk-or-test';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolvePromise) => window.setTimeout(resolvePromise, 0));
    await new Promise((resolvePromise) => window.setTimeout(resolvePromise, 0));

    expect(container.textContent).toContain('Не удалось выполнить сетевой запрос к OpenRouter');
  });
});
