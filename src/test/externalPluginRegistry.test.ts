import { describe, expect, it } from 'vitest';
import { createExternalPluginRegistry } from '../plugins/externalPluginRegistry';

describe('external plugin registry', () => {
  it('регистрирует и сохраняет модуль для повторной активации', () => {
    const registry = createExternalPluginRegistry();
    const module = { id: 'test-plugin', activate: () => undefined };

    registry.register(module);

    expect(registry.get('test-plugin')).toBe(module);
    expect(registry.get('test-plugin')).toBe(module);
  });
});
