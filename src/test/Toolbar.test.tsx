import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toolbar } from '../components/Toolbar/Toolbar';
import { useAppStore } from '../stores/appStore';
import { usePluginStore } from '../plugins/pluginStore';

const mockedInvoke = vi.mocked(invoke);

describe('Toolbar', () => {
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
      s3: null,
      s3Verified: false,
    });
    usePluginStore.setState({
      toolbarButtons: [],
      dialogs: [],
      openDialogs: [],
    });
  });

  it('показывает меню шрифтов поверх интерфейса и выбирает шрифт', async () => {
    render(<Toolbar />);

    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledWith('read_settings'));

    const trigger = screen.getByRole('button', { name: 'Segoe UI Variable' });
    fireEvent.click(trigger);

    const menu = screen.getByRole('listbox', { name: 'Шрифт' });
    expect(menu).toHaveClass('toolbar-font-select-menu');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: 'Georgia' }));

    await waitFor(() => {
      expect(useAppStore.getState().fontFamily).toBe('Georgia');
    });
    await screen.findByRole('button', { name: 'Georgia' });
    expect(screen.queryByRole('listbox', { name: 'Шрифт' })).not.toBeInTheDocument();
  });

  it('показывает действия плагинов только внутри меню Плагины', async () => {
    const exportPdfClick = vi.fn();
    const testPluginClick = vi.fn();

    usePluginStore.setState({
      toolbarButtons: [
        {
          id: 'open-export-pdf',
          pluginId: 'export-pdf',
          label: 'Export PDF',
          title: 'Экспортировать документ в PDF',
          order: 10,
          onClick: exportPdfClick,
        },
        {
          id: 'open-test-plugin',
          pluginId: 'test-plugin',
          label: 'Test Plugin',
          title: 'Открыть Test Plugin',
          order: 20,
          onClick: testPluginClick,
        },
      ],
    });

    render(<Toolbar />);

    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledWith('read_settings'));

    expect(screen.queryByRole('button', { name: 'Export PDF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Test Plugin' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Плагины' }));

    fireEvent.click(screen.getByRole('menuitem', { name: 'Export PDF' }));

    expect(exportPdfClick).toHaveBeenCalledTimes(1);
    expect(testPluginClick).not.toHaveBeenCalled();
    expect(screen.queryByRole('menuitem', { name: 'Export PDF' })).not.toBeInTheDocument();
  });
});
