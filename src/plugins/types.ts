import type { ComponentType } from 'react';

export type PluginKind = 'builtin' | 'external';

export type PluginPermission =
  | 'document:read'
  | 'document:write'
  | 'dialog'
  | 'export:html'
  | 'export:pdf'
  | 'assets:write';

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  entry?: string;
  styles?: string;
  permissions: PluginPermission[];
  apiVersion: 1;
};

export type ToolbarButtonConfig = {
  id: string;
  pluginId: string;
  label: string;
  title?: string;
  order?: number;
  onClick: () => void;
};

export type PluginDialogRenderContext = {
  container: HTMLElement;
  props: Record<string, unknown>;
  api: MivraPluginApi;
};

export type PluginDialogRenderer = {
  render: (context: PluginDialogRenderContext) => void | (() => void);
};

export type PluginAssetSaveInput = {
  bytes: Uint8Array;
  filename: string;
  alt?: string;
  kind?: 'image' | 'file';
};

export type PluginAssetSaveResult = {
  url: string;
  markdown: string;
  storage: 's3' | 'local';
};

export type RegisteredDialog =
  | {
    kind: 'component';
    id: string;
    pluginId: string;
    component: ComponentType<Record<string, unknown>>;
  }
  | {
    kind: 'renderer';
    id: string;
    pluginId: string;
    renderer: PluginDialogRenderer;
  };

export type MivraPluginApi = {
  apiVersion: 1;
  pluginId: string;
  toolbar: {
    registerButton: (button: Omit<ToolbarButtonConfig, 'pluginId'>) => () => void;
  };
  dialogs: {
    register: (id: string, component: ComponentType<Record<string, unknown>>) => () => void;
    registerRenderer: (id: string, renderer: PluginDialogRenderer) => () => void;
    open: (id: string, props?: Record<string, unknown>) => void;
    close: (id: string) => void;
  };
  document: {
    getContent: () => string;
    getFilePath: () => string | null;
    subscribeContent: (callback: (content: string) => void) => () => void;
    setContent: (content: string) => void;
  };
  settings: {
    getLanguage: () => 'ru' | 'en';
    getTheme: () => 'light' | 'dark' | 'system';
  };
  exports: {
    saveHtml: (html: string, defaultName?: string) => Promise<string | null>;
    savePdfBytes: (bytes: Uint8Array, defaultName?: string) => Promise<string | null>;
  };
  assets: {
    saveBytes: (input: PluginAssetSaveInput) => Promise<PluginAssetSaveResult>;
  };
};
