import type { PluginInfo } from '../utils/tauri';
import type { PluginManifest, PluginPermission } from './types';

const pluginPermissions: PluginPermission[] = ['document:read', 'dialog', 'export:html', 'export:pdf'];
const supportedPluginApiVersion = 1;

function isPluginPermission(value: string): value is PluginPermission {
  return pluginPermissions.includes(value as PluginPermission);
}

export function pluginInfoToManifest(plugin: PluginInfo): PluginManifest {
  const apiVersion = plugin.apiVersion ?? supportedPluginApiVersion;
  if (apiVersion !== supportedPluginApiVersion) {
    throw new Error(`plugin_api_version_unsupported: ${apiVersion}`);
  }

  const rawPermissions = plugin.permissions ?? [];
  const unsupportedPermission = rawPermissions.find((permission) => !isPluginPermission(permission));
  if (unsupportedPermission) {
    throw new Error(`plugin_permission_unsupported: ${unsupportedPermission}`);
  }
  const permissions = rawPermissions.filter(isPluginPermission);

  return {
    id: plugin.id,
    name: plugin.name,
    version: plugin.version,
    description: plugin.description,
    author: plugin.author,
    entry: plugin.entry ?? undefined,
    styles: plugin.styles ?? undefined,
    permissions,
    apiVersion: supportedPluginApiVersion,
  };
}
