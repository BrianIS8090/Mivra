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
    setContent: ReturnType<typeof vi.fn>;
  };
  settings: {
    getLanguage: ReturnType<typeof vi.fn>;
  };
};

const pluginDir = resolve(process.cwd(), 'plugins/openrouter-translate');

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

function createFakeApi(): FakePluginApi {
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
      getContent: vi.fn(() => '# Title\n\nHello, **world**.\n\n```ts\nconst value = "Hello";\n```'),
      getFilePath: vi.fn(() => 'C:/docs/demo.md'),
      subscribeContent: vi.fn(() => vi.fn()),
      setContent: vi.fn(),
    },
    settings: {
      getLanguage: vi.fn(() => 'ru'),
    },
  };
}

async function flushAsync(): Promise<void> {
  await new Promise((resolvePromise) => window.setTimeout(resolvePromise, 0));
}

describe('openrouter-translate plugin', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('имеет валидный manifest для записи перевода в документ', () => {
    const manifest = JSON.parse(readFileSync(resolve(pluginDir, 'plugin.json'), 'utf8'));

    expect(manifest).toMatchObject({
      id: 'openrouter-translate',
      name: 'OpenRouter Translate',
      version: '1.0.0',
      entry: 'index.js',
      styles: 'style.css',
      permissions: ['document:read', 'document:write', 'dialog'],
      apiVersion: 1,
    });
  });

  it('регистрирует пункт меню и renderer-диалог', () => {
    const plugin = loadPlugin();
    const api = createFakeApi();

    const cleanup = plugin.activate(api);

    expect(api.dialogs.registerRenderer).toHaveBeenCalledWith(
      'openrouter-translate-dialog',
      expect.objectContaining({ render: expect.any(Function) }),
    );
    expect(api.toolbar.registerButton).toHaveBeenCalledWith(expect.objectContaining({
      id: 'openrouter-translate-open',
      label: 'Перевод',
      onClick: expect.any(Function),
    }));

    const renderer = api.dialogs.registerRenderer.mock.calls[0][1];
    const container = document.createElement('div');
    const dispose = renderer.render({ container, api });

    expect(container.querySelector('.openrouter-translate-dialog')).not.toBeNull();
    expect(container.querySelector('[data-openrouter-translate-apply]')).not.toBeNull();

    dispose();
    cleanup();
  });

  it('отправляет Markdown в OpenRouter с выбранным направлением и показывает перевод', async () => {
    const plugin = loadPlugin();
    const api = createFakeApi();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: '# Заголовок\n\nПривет, **мир**.' } },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    plugin.activate(api);
    const renderer = api.dialogs.registerRenderer.mock.calls[0][1];
    const container = document.createElement('div');
    renderer.render({ container, api });

    const keyInput = container.querySelector('[data-openrouter-translate-key]');
    const form = container.querySelector('[data-openrouter-translate-form]');
    if (!(keyInput instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) {
      throw new Error('Форма перевода не найдена');
    }

    keyInput.value = 'sk-or-test';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushAsync();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-or-test',
          'X-OpenRouter-Title': 'Mivra OpenRouter Translate',
        }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('Translate the Markdown document from English to Russian');
    expect(body.messages.at(-1).content).toContain('# Title');
    expect(container.textContent).toContain('Привет, **мир**.');
  });

  it('применяет перевод к документу только после явного нажатия', async () => {
    const plugin = loadPlugin();
    const api = createFakeApi();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: '# Заголовок\n\nПривет, **мир**.' } },
        ],
      }),
    }));

    plugin.activate(api);
    const renderer = api.dialogs.registerRenderer.mock.calls[0][1];
    const container = document.createElement('div');
    renderer.render({ container, api });

    const keyInput = container.querySelector('[data-openrouter-translate-key]');
    const form = container.querySelector('[data-openrouter-translate-form]');
    if (!(keyInput instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) {
      throw new Error('Форма перевода не найдена');
    }

    keyInput.value = 'sk-or-test';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushAsync();

    expect(api.document.setContent).not.toHaveBeenCalled();

    const applyButton = container.querySelector('[data-openrouter-translate-apply]');
    if (!(applyButton instanceof HTMLButtonElement)) {
      throw new Error('Кнопка применения не найдена');
    }

    applyButton.click();

    expect(api.document.setContent).toHaveBeenCalledWith('# Заголовок\n\nПривет, **мир**.');
  });

  it('показывает понятную ошибку, если WebView блокирует сетевой запрос', async () => {
    const plugin = loadPlugin();
    const api = createFakeApi();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    plugin.activate(api);
    const renderer = api.dialogs.registerRenderer.mock.calls[0][1];
    const container = document.createElement('div');
    renderer.render({ container, api });

    const keyInput = container.querySelector('[data-openrouter-translate-key]');
    const form = container.querySelector('[data-openrouter-translate-form]');
    if (!(keyInput instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) {
      throw new Error('Форма перевода не найдена');
    }

    keyInput.value = 'sk-or-test';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushAsync();
    await flushAsync();

    expect(container.textContent).toContain('Не удалось выполнить сетевой запрос к OpenRouter');
  });
});
