import { useAppStore } from '../stores/appStore';
import * as tauri from '../utils/tauri';
import { requirePluginPermission } from './pluginPermissions';
import { usePluginStore } from './pluginStore';
import type { MivraPluginApi, PluginManifest } from './types';

function nameWithoutExt(name: string): string {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(0, index) : name;
}

function escapeMarkdownLabel(label: string): string {
  return label.replace(/[[\]\\]/g, '\\$&');
}

function assetMarkdown(filename: string, url: string, kind: 'image' | 'file' | undefined, alt?: string): string {
  const label = escapeMarkdownLabel(alt?.trim() || nameWithoutExt(filename));
  return kind === 'file' ? `[${label}](${url})` : `![${label}](${url})`;
}

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
      setContent: (content) => {
        requirePluginPermission(manifest, 'document:write');
        useAppStore.getState().setContent(content);
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
    assets: {
      saveBytes: async (input) => {
        requirePluginPermission(manifest, 'assets:write');
        const state = useAppStore.getState();

        if (state.s3 && state.s3Verified && await tauri.s3SecretExists()) {
          const url = await tauri.s3UploadBytes(input.bytes, input.filename, state.s3);
          return {
            url,
            markdown: assetMarkdown(input.filename, url, input.kind, input.alt),
            storage: 's3',
          };
        }

        if (!state.baseDir) {
          throw new Error('asset_base_dir_missing');
        }

        const url = await tauri.saveLocalAssetBytes(input.bytes, state.baseDir, input.filename);
        return {
          url,
          markdown: assetMarkdown(input.filename, url, input.kind, input.alt),
          storage: 'local',
        };
      },
    },
  };
}
