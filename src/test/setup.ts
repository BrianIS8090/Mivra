import '@testing-library/jest-dom';

// Мок для Tauri API, чтобы тесты работали без Tauri runtime
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string) => `https://asset.localhost/${encodeURIComponent(path)}`),
}));

vi.mock('@tauri-apps/api/path', () => ({
  dirname: vi.fn(async (path: string) => {
    const sep = path.includes('/') ? '/' : '\\';
    const parts = path.split(sep);
    parts.pop();
    return parts.join(sep) || path;
  }),
  join: vi.fn(async (...parts: string[]) => parts.join('\\')),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn(async () => false),
  stat: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(async () => null),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    onCloseRequested: vi.fn(async () => vi.fn()),
    destroy: vi.fn(),
  })),
}));
