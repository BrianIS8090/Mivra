import { useAppStore } from '../stores/appStore';
import * as tauri from '../utils/tauri';
import { requirePluginPermission } from './pluginPermissions';
import { usePluginStore } from './pluginStore';
import type { MivraPluginApi, PluginManifest } from './types';

export function createMivraPluginApi(pluginId: string, manifest?: PluginManifest): MivraPluginApi {
  return {
    apiVersion: 1,
    pluginId,
    toolbar: {
      registerButton: (button) => usePluginStore.getState().registerToolbarButton({
        ...button,
        pluginId,
      }),
    },
    dialogs: {
      register: (id, component) => {
        requirePluginPermission(manifest, 'dialog');
        return usePluginStore.getState().registerDialog({ kind: 'component', id, pluginId, component });
      },
      registerRenderer: (id, renderer) => {
        requirePluginPermission(manifest, 'dialog');
        return usePluginStore.getState().registerDialog({
          kind: 'renderer',
          id,
          pluginId,
          renderer: {
            render: (context) => renderer.render({
              ...context,
              api: createMivraPluginApi(pluginId, manifest),
            }),
          },
        });
      },
      open: (id, props) => usePluginStore.getState().openDialog(id, props),
      close: (id) => usePluginStore.getState().closeDialog(id),
    },
    document: {
      getContent: () => {
        requirePluginPermission(manifest, 'document:read');
        return useAppStore.getState().content;
      },
      getFilePath: () => {
        requirePluginPermission(manifest, 'document:read');
        return useAppStore.getState().filePath;
      },
      subscribeContent: (callback) => {
        requirePluginPermission(manifest, 'document:read');
        let previous = useAppStore.getState().content;
        return useAppStore.subscribe((state) => {
          if (state.content === previous) return;
          previous = state.content;
          callback(state.content);
        });
      },
    },
    settings: {
      getLanguage: () => useAppStore.getState().language,
      getTheme: () => useAppStore.getState().theme,
    },
    exports: {
      saveHtml: (html, defaultName) => {
        requirePluginPermission(manifest, 'export:html');
        return tauri.exportToHtml(html, defaultName);
      },
      savePdfBytes: (bytes, defaultName) => {
        requirePluginPermission(manifest, 'export:pdf');
        return tauri.exportToPdf(bytes, defaultName);
      },
    },
  };
}
