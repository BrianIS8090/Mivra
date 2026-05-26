import type { ExternalPluginModule, ExternalPluginRegistry } from './externalPluginTypes';

export function createExternalPluginRegistry(): ExternalPluginRegistry {
  const modules = new Map<string, ExternalPluginModule>();

  return {
    register: (module) => {
      modules.set(module.id, module);
    },
    get: (pluginId) => modules.get(pluginId) ?? null,
  };
}

export function ensureExternalPluginRegistry(): ExternalPluginRegistry {
  if (!window.MivraExternalPlugin) {
    window.MivraExternalPlugin = createExternalPluginRegistry();
  }

  return window.MivraExternalPlugin;
}
