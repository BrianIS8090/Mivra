import type { MivraPluginApi } from './types';

export type ExternalPluginActivate = (
  api: MivraPluginApi,
) => void | (() => void) | Promise<void | (() => void)>;

export type ExternalPluginModule = {
  id: string;
  activate: ExternalPluginActivate;
};

export type ExternalPluginRegistry = {
  register: (module: ExternalPluginModule) => void;
  get: (pluginId: string) => ExternalPluginModule | null;
};

declare global {
  interface Window {
    MivraExternalPlugin?: ExternalPluginRegistry;
    __mivraResolvePluginAsset?: (pluginId: string, relativePath: string) => string;
    __mivraReadPluginAssetBytes?: (assetUrl: string) => Promise<Uint8Array>;
  }
}
