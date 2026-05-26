import { useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import * as tauri from '../utils/tauri';
import { loadExternalPlugin } from './externalPluginLoader';
import { pluginInfoToManifest } from './pluginManifest';
import { PluginDialogHost } from './PluginDialogHost';
import { usePluginStore } from './pluginStore';

export function PluginHost() {
  const enabledPlugins = useAppStore((s) => s.enabledPlugins);
  const setManifests = usePluginStore((s) => s.setManifests);
  const clearPlugin = usePluginStore((s) => s.clearPlugin);
  const refreshKey = usePluginStore((s) => s.refreshKey);

  useEffect(() => {
    let active = true;
    const disposers: Array<() => void> = [];

    async function loadPlugins() {
      try {
        const plugins = await tauri.ensureBundledPlugins();
        if (!active) return;

        setManifests(plugins.map(pluginInfoToManifest));

        for (const plugin of plugins) {
          clearPlugin(plugin.id);
          if (!enabledPlugins.includes(plugin.id)) continue;

          try {
            const dispose = await loadExternalPlugin(pluginInfoToManifest(plugin));
            if (active) {
              disposers.push(dispose);
            } else {
              dispose();
            }
          } catch (error) {
            console.error(`[plugins] Не удалось загрузить плагин ${plugin.id}:`, error);
          }
        }
      } catch (error) {
        console.error('[plugins] Не удалось загрузить список плагинов:', error);
      }
    }

    void loadPlugins();

    return () => {
      active = false;
      for (const dispose of disposers) {
        dispose();
      }
      for (const pluginId of enabledPlugins) {
        clearPlugin(pluginId);
      }
    };
  }, [clearPlugin, enabledPlugins, refreshKey, setManifests]);

  return <PluginDialogHost />;
}
