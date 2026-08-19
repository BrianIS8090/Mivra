import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuBar } from '../components/MenuBar/MenuBar';
import { useAppStore } from '../stores/appStore';
import { usePluginStore } from '../plugins/pluginStore';

const mockedInvoke = vi.mocked(invoke);

// Открыть подменю «Файл ▸ Недавние» и вернуть его
function openRecentSubmenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Файл' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Недавние' }));
  return screen.getByRole('menu', { name: 'Недавние' });
}

describe('MenuBar — меню недавних файлов', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    mockedInvoke.mockResolvedValue({
      font_family: 'Segoe UI Variable',
      font_size: 15,
      theme: 'system',
      language: 'ru',
      recent_files: [],
      enabled_plugins: ['export-pdf'],
    });
    useAppStore.setState({
      fontFamily: 'Segoe UI Variable',
      fontSize: 15,
      theme: 'system',
      language: 'ru',
      recentFiles: [],
      enabledPlugins: ['export-pdf'],
      filePath: null,
      content: '',
      isDirty: false,
      autosave: false,
      s3: null,
      s3Verified: false,
    });
    usePluginStore.setState({
      toolbarButtons: [],
      dialogs: [],
      openDialogs: [],
    });
  });

  it('показывает пункты: имя файла, title — полный путь, максимум 10', () => {
    const paths = Array.from({ length: 12 }, (_, i) => `C:\\docs\\file${i}.md`);
    useAppStore.setState({ recentFiles: paths });

    render(<MenuBar onFind={vi.fn()} onReplace={vi.fn()} />);
    const submenu = openRecentSubmenu();

    const items = within(submenu).getAllByRole('menuitem');
    expect(items).toHaveLength(10);
    expect(items[0]).toHaveTextContent('file0.md');
    expect(items[0]).toHaveAttribute('title', 'C:\\docs\\file0.md');
    expect(items[9]).toHaveTextContent('file9.md');
  });

  it('пустой список — неактивный пункт «Нет недавних файлов»', () => {
    render(<MenuBar onFind={vi.fn()} onReplace={vi.fn()} />);
    const submenu = openRecentSubmenu();

    expect(within(submenu).getByText('Нет недавних файлов')).toBeInTheDocument();
    expect(within(submenu).queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('дедуплицирует пути с разным регистром/слэшами, показывая первое вхождение', () => {
    // Такое возможно при ручной правке settings.json; на Windows один путь
    // встречается с разным регистром буквы диска и разными слэшами
    useAppStore.setState({
      recentFiles: ['C:\\docs\\a.md', 'c:\\docs\\a.md', 'C:/docs/a.md', 'C:\\docs\\b.md'],
    });

    render(<MenuBar onFind={vi.fn()} onReplace={vi.fn()} />);
    const submenu = openRecentSubmenu();

    const items = within(submenu).getAllByRole('menuitem');
    expect(items).toHaveLength(2);
    // Остаётся первое вхождение в исходном написании
    expect(items[0]).toHaveAttribute('title', 'C:\\docs\\a.md');
    expect(items[1]).toHaveAttribute('title', 'C:\\docs\\b.md');
  });

  it('клик по пункту открывает файл по пути и закрывает меню', async () => {
    useAppStore.setState({ recentFiles: ['C:\\docs\\alpha.md'] });
    mockedInvoke.mockImplementation((cmd) => {
      if (cmd === 'read_file') {
        return Promise.resolve('# Альфа');
      }
      if (cmd === 'get_recent_files') {
        return Promise.resolve(['C:\\docs\\alpha.md']);
      }
      return Promise.resolve(null);
    });

    render(<MenuBar onFind={vi.fn()} onReplace={vi.fn()} />);
    const submenu = openRecentSubmenu();
    fireEvent.click(within(submenu).getByRole('menuitem', { name: 'alpha.md' }));

    await waitFor(() => {
      expect(useAppStore.getState().content).toBe('# Альфа');
    });
    expect(mockedInvoke).toHaveBeenCalledWith('read_file', { path: 'C:\\docs\\alpha.md' });
    expect(useAppStore.getState().filePath).toBe('C:\\docs\\alpha.md');
    expect(useAppStore.getState().isDirty).toBe(false);
    // Меню закрыто после клика
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('меню закрывается по Esc', () => {
    useAppStore.setState({ recentFiles: ['C:\\docs\\alpha.md'] });

    render(<MenuBar onFind={vi.fn()} onReplace={vi.fn()} />);
    const submenu = openRecentSubmenu();
    expect(within(submenu).getByRole('menuitem', { name: 'alpha.md' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('меню закрывается по клику вне', () => {
    useAppStore.setState({ recentFiles: ['C:\\docs\\alpha.md'] });

    render(<MenuBar onFind={vi.fn()} onReplace={vi.fn()} />);
    const submenu = openRecentSubmenu();
    expect(within(submenu).getByRole('menuitem', { name: 'alpha.md' })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
