import type { MivraPluginApi, PluginManifest } from './types';

export type BuiltinPlugin = {
  manifest: PluginManifest;
  register: (api: MivraPluginApi) => () => void;
};

export const builtinPlugins: BuiltinPlugin[] = [];
