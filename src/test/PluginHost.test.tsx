import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginHost } from '../plugins/PluginHost';
import { useAppStore } from '../stores/appStore';
import { usePluginStore } from '../plugins/pluginStore';
import * as tauri from '../utils/tauri';
import type { PluginInfo } from '../utils/tauri';

vi.mock('../utils/tauri', async () => {
  const actual = await vi.importActual<typeof import('../utils/tauri')>('../utils/tauri');
  return {
    ...actual,
    ensureBundledPlugins: vi.fn(),
  };
});

vi.mock('../plugins/externalPluginLoader', async () => {
  const { usePluginStore } = await vi.importActual<typeof import('../plugins/pluginStore')>('../plugins/pluginStore');
  return {
    loadExternalPlugin: vi.fn(async (manifest: { id: string; name: string }) => (
      usePluginStore.getState().registerToolbarButton({
        id: `open-${manifest.id}`,
        pluginId: manifest.id,
        label: manifest.name,
        onClick: vi.fn(),
      })
    )),
  };
});

const exportPdfPlugin: PluginInfo = {
  id: 'export-pdf',
  name: 'Export PDF',
  version: '1.0.2',
  description: 'Экспорт Markdown в PDF',
  author: 'Mivra Team',
  entry: 'index.js',
  styles: 'style.css',
  permissions: ['document:read', 'dialog', 'export:pdf'],
  apiVersion: 1,
  enabled: true,
};

describe('PluginHost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ enabledPlugins: ['export-pdf'] });
    usePluginStore.getState().reset();
  });

  it('перечитывает установленные плагины по refresh, даже если enabledPlugins не изменился', async () => {
    const ensureBundledPlugins = vi.mocked(tauri.ensureBundledPlugins);
    ensureBundledPlugins
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([exportPdfPlugin]);

    render(<PluginHost />);

    await waitFor(() => expect(ensureBundledPlugins).toHaveBeenCalledTimes(1));
    expect(usePluginStore.getState().toolbarButtons).toEqual([]);

    act(() => {
      usePluginStore.getState().requestRefresh();
    });

    await waitFor(() => expect(ensureBundledPlugins).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(usePluginStore.getState().toolbarButtons).toEqual([
        expect.objectContaining({
          id: 'open-export-pdf',
          pluginId: 'export-pdf',
          label: 'Export PDF',
        }),
      ]);
    });
  });
});

