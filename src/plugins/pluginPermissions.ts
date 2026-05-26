import type { PluginManifest, PluginPermission } from './types';

export function requirePluginPermission(
  manifest: PluginManifest | undefined,
  permission: PluginPermission,
): void {
  if (!manifest) return;
  if (!manifest.permissions.includes(permission)) {
    throw new Error(`permission_denied: ${permission}`);
  }
}
