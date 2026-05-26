import { fireEvent, render, screen } from '@testing-library/react';
import { open } from '@tauri-apps/plugin-dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginManagerDialog } from '../components/PluginManager/PluginManagerDialog';
import { useAppStore } from '../stores/appStore';
import { usePluginStore } from '../plugins/pluginStore';
import * as tauri from '../utils/tauri';

vi.mock('../utils/tauri', async () => {
  const actual = await vi.importActual<typeof import('../utils/tauri')>('../utils/tauri');
  return {
    ...actual,
    getInstalledPlugins: vi.fn().mockResolvedValue([
      {
        id: 'export-pdf',
        name: 'Export PDF',
        version: '1.0.0',
        description: 'Экспорт Markdown в PDF',
        author: 'Mivra Team',
        entry: 'index.js',
        styles: 'style.css',
        permissions: ['document:read', 'dialog', 'export:pdf'],
        apiVersion: 1,
        enabled: true,
      },
    ]),
    installPlugin: vi.fn(),
    installPluginPackage: vi.fn(),
    uninstallPlugin: vi.fn(),
  };
});

describe('PluginManagerDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tauri.getInstalledPlugins).mockResolvedValue([
      {
        id: 'export-pdf',
        name: 'Export PDF',
        version: '1.0.0',
        description: 'Экспорт Markdown в PDF',
        author: 'Mivra Team',
        entry: 'index.js',
        styles: 'style.css',
        permissions: ['document:read', 'dialog', 'export:pdf'],
        apiVersion: 1,
        enabled: true,
      },
    ]);
    vi.mocked(open).mockResolvedValue(null);
  });

  it('показывает Export PDF как установленный внешний плагин', async () => {
    useAppStore.setState({ language: 'ru', enabledPlugins: ['export-pdf'] });
    usePluginStore.getState().setManifests([]);

    render(<PluginManagerDialog onClose={vi.fn()} />);
    expect(await screen.findByText('Export PDF')).toBeInTheDocument();
    expect(screen.getByText('Установленный')).toBeInTheDocument();
    expect(screen.queryByText('Встроенный')).not.toBeInTheDocument();
  });

  it('разделяет карточку плагина на описание, метаданные и действия', async () => {
    useAppStore.setState({ language: 'ru', enabledPlugins: ['export-pdf'] });
    usePluginStore.getState().setManifests([]);

    render(<PluginManagerDialog onClose={vi.fn()} />);

    const card = await screen.findByTestId('plugin-manager-card-export-pdf');

    expect(card.querySelector('.plugin-manager-item-main')).not.toBeNull();
    expect(card.querySelector('.plugin-manager-item-actions')).not.toBeNull();
    expect(card.querySelectorAll('.plugin-manager-meta-pill')).toHaveLength(3);
    expect(screen.getByText('Включён')).toBeInTheDocument();
  });

  it('показывает технический текст ошибки при неудачной установке пакета', async () => {
    vi.mocked(open).mockResolvedValue('C:/plugins/exportPDF.mivraplugin');
    vi.mocked(tauri.installPluginPackage).mockRejectedValue("plugin_entry: файл 'index.js' не найден");
    useAppStore.setState({ language: 'ru', enabledPlugins: [] });
    usePluginStore.getState().setManifests([]);

    render(<PluginManagerDialog onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Добавить пакет' }));

    expect(await screen.findByText("Не удалось установить плагин: plugin_entry: файл 'index.js' не найден")).toBeInTheDocument();
  });

  it('показывает технический текст ошибки при неудачном удалении', async () => {
    vi.mocked(tauri.uninstallPlugin).mockRejectedValue('plugin_path: файл занят другим процессом');
    useAppStore.setState({ language: 'ru', enabledPlugins: ['export-pdf'] });
    usePluginStore.getState().setManifests([]);

    render(<PluginManagerDialog onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Удалить' }));

    expect(await screen.findByText('Не удалось удалить плагин: plugin_path: файл занят другим процессом')).toBeInTheDocument();
  });
});
