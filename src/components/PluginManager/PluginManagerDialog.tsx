import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { getTranslations } from '../../i18n';
import { useAppStore } from '../../stores/appStore';
import { pluginInfoToManifest } from '../../plugins/pluginManifest';
import { usePluginStore } from '../../plugins/pluginStore';
import * as tauri from '../../utils/tauri';
import type { PluginManifest } from '../../plugins/types';
import '../Dialog/dialog.css';
import './plugin-manager.css';

const BUNDLED_PLUGIN_IDS = new Set(['export-pdf']);

type Props = {
  onClose: () => void;
};

type ExternalPlugin = PluginManifest & {
  kind: 'external';
};

function pluginErrorMessage(prefix: string, error: unknown): string {
  if (typeof error === 'string' && error.trim()) {
    return `${prefix}: ${error}`;
  }
  if (error instanceof Error && error.message.trim()) {
    return `${prefix}: ${error.message}`;
  }
  return prefix;
}

export function PluginManagerDialog({ onClose }: Props) {
  const language = useAppStore((s) => s.language);
  const enabledPlugins = useAppStore((s) => s.enabledPlugins);
  const setPluginEnabled = useAppStore((s) => s.setPluginEnabled);
  const setBundledPluginRemoved = useAppStore((s) => s.setBundledPluginRemoved);
  const setManifests = usePluginStore((s) => s.setManifests);
  const requestRefresh = usePluginStore((s) => s.requestRefresh);
  const [externalPlugins, setExternalPlugins] = useState<ExternalPlugin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const t = getTranslations(language);

  const loadExternalPlugins = async () => {
    try {
      const plugins = await tauri.getInstalledPlugins();
      const manifests = plugins.map(pluginInfoToManifest);
      setManifests(manifests);
      setExternalPlugins(manifests.map((plugin) => ({ ...plugin, kind: 'external' })));
      requestRefresh();
      setError(null);
    } catch (e) {
      setError(pluginErrorMessage(t.pluginLoadError, e));
    }
  };

  useEffect(() => {
    loadExternalPlugins();
  }, []);

  const addPluginFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected !== 'string') return;
    try {
      const plugin = await tauri.installPlugin(selected);
      setBundledPluginRemoved(plugin.id, false);
      await loadExternalPlugins();
    } catch (e) {
      setError(pluginErrorMessage(t.pluginInstallError, e));
    }
  };

  const addPluginPackage = async () => {
    const selected = await open({
      directory: false,
      multiple: false,
      filters: [{ name: 'Mivra Plugin', extensions: ['mivraplugin', 'zip'] }],
    });
    if (typeof selected !== 'string') return;
    try {
      const plugin = await tauri.installPluginPackage(selected);
      setBundledPluginRemoved(plugin.id, false);
      await loadExternalPlugins();
    } catch (e) {
      setError(pluginErrorMessage(t.pluginInstallError, e));
    }
  };

  const removePlugin = async (pluginId: string) => {
    try {
      await tauri.uninstallPlugin(pluginId);
      setPluginEnabled(pluginId, false);
      if (BUNDLED_PLUGIN_IDS.has(pluginId)) {
        setBundledPluginRemoved(pluginId, true);
      }
      await loadExternalPlugins();
    } catch (e) {
      setError(pluginErrorMessage(t.pluginDeleteError, e));
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="plugin-manager dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plugin-manager-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="plugin-manager-header">
          <h2 id="plugin-manager-title" className="dialog-title">{t.pluginManagerTitle}</h2>
          <button className="dialog-btn dialog-btn-ghost" onClick={onClose}>{t.close}</button>
        </div>

        {error && <div className="plugin-manager-error">{error}</div>}

        <div className="plugin-manager-list">
          {externalPlugins.map((plugin) => {
            const isEnabled = enabledPlugins.includes(plugin.id);
            return (
              <article
                className="plugin-manager-item"
                data-testid={`plugin-manager-card-${plugin.id}`}
                key={`${plugin.kind}:${plugin.id}`}
              >
                <div className="plugin-manager-item-main">
                  <div className="plugin-manager-item-title">
                    <h3>{plugin.name}</h3>
                    <span className="plugin-manager-kind">
                      {t.pluginExternal}
                    </span>
                  </div>
                  <p className="plugin-manager-description">{plugin.description}</p>
                  <div className="plugin-manager-meta">
                    <span className="plugin-manager-meta-pill">v{plugin.version}</span>
                    <span className="plugin-manager-meta-pill">{plugin.author}</span>
                    <span className="plugin-manager-meta-pill">API {plugin.apiVersion}</span>
                  </div>
                </div>
                <div className="plugin-manager-item-actions">
                  <span className={`plugin-manager-status ${isEnabled ? 'is-enabled' : 'is-disabled'}`}>
                    {isEnabled ? t.pluginEnabledStatus : t.pluginDisabledStatus}
                  </span>
                  <label className="plugin-manager-switch">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      aria-label={`${plugin.name}: ${isEnabled ? t.pluginDisable : t.pluginEnable}`}
                      onChange={(e) => setPluginEnabled(plugin.id, e.target.checked)}
                    />
                    <span className="plugin-manager-switch-track" aria-hidden="true">
                      <span className="plugin-manager-switch-thumb" />
                    </span>
                    <span>{isEnabled ? t.pluginDisable : t.pluginEnable}</span>
                  </label>
                  <button className="dialog-btn" onClick={() => removePlugin(plugin.id)}>
                    {t.pluginDelete}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="plugin-manager-footer">
          <button className="dialog-btn" onClick={addPluginFolder}>{t.pluginAddFolder}</button>
          <button className="dialog-btn dialog-btn-primary" onClick={addPluginPackage}>{t.pluginAddPackage}</button>
        </div>
      </div>
    </div>
  );
}
