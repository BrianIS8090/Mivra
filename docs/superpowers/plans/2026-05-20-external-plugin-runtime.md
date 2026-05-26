# External Plugin Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать полноценное подключение внешних плагинов в Mivra и перевести Export PDF из встроенного плагина во внешний плагин, поставляемый вместе с приложением.

**Architecture:** Внешний плагин хранится в папке AppData/Mivra/plugins/{id}, описывается `plugin.json` и загружается frontend-loader через asset URL. Entry-файл плагина является ESM-модулем и регистрирует себя через `window.MivraExternalPlugin.register({ id, activate })`; приложение выдаёт ему permission-scoped `MivraPluginApi`. Все действия плагинов регистрируются как launcher actions и отображаются только внутри раскрывающегося меню Toolbar-кнопки `Плагины`; отдельные кнопки плагинов в основном Toolbar запрещены, чтобы интерфейс не засорялся при установке нескольких плагинов. Export PDF становится bundled external plugin: он поставляется как готовая папка плагина, автоматически устанавливается/обновляется в AppData и тестирует весь внешний runtime.

**Tech Stack:** Tauri 2, Rust IPC, React 19, TypeScript, Zustand, Vite, Vitest, pdfmake/pdfjs-dist для Export PDF.

---

## File Structure

**New files:**
- `src/plugins/externalPluginTypes.ts` — типы runtime-контракта внешнего плагина.
- `src/plugins/externalPluginRegistry.ts` — глобальный registry `window.MivraExternalPlugin`.
- `src/plugins/externalPluginLoader.ts` — загрузка CSS/ESM entry, активация и cleanup внешних плагинов.
- `src/plugins/pluginPermissions.ts` — permission-gating для `MivraPluginApi`.
- `src/plugins/PluginDialogRendererHost.tsx` — хост для renderer-диалогов внешних плагинов.
- `src/test/externalPluginRegistry.test.ts` — тесты registry.
- `src/test/externalPluginLoader.test.ts` — тесты loader.
- `src/test/pluginPermissions.test.ts` — тесты permission-gating.
- `plugins/export-pdf/plugin.json` — manifest Export PDF как внешнего плагина.
- `plugins/export-pdf/package.json` — build scripts внешнего плагина.
- `plugins/export-pdf/vite.config.ts` — Vite build для ESM bundle.
- `plugins/export-pdf/src/register.tsx` — entry внешнего Export PDF.
- `docs/PLUGINS.md` — документация для авторов плагинов.

**Modified files:**
- `src/plugins/types.ts` — расширить API для renderer-диалогов и runtime-модулей.
- `src/plugins/mivraApi.ts` — принимать manifest permissions и выдавать ограниченный API.
- `src/plugins/pluginStore.ts` — хранить dialog kind: React component или external renderer.
- `src/plugins/PluginDialogHost.tsx` — рендерить оба типа диалогов.
- `src/plugins/PluginHost.tsx` — грузить installed external plugins, а не `builtinPlugins`.
- `src/plugins/builtinPlugins.ts` — удалить Export PDF из списка runtime-встроенных плагинов.
- `src/components/PluginManager/PluginManagerDialog.tsx` — убрать предупреждение “сторонний код не исполняется”, показать runtime status.
- `src/components/Toolbar/Toolbar.tsx` — без логики Export PDF; рендерит одну кнопку `Плагины` с dropdown-списком зарегистрированных plugin actions.
- `src/components/Toolbar/toolbar.css` — стили dropdown-меню `Плагины`.
- `src/i18n/ru.ts` и `src/i18n/en.ts` — тексты пустого списка и пункта открытия Plugin Manager.
- `src/test/Toolbar.test.tsx` — тесты, что plugin actions не становятся отдельными Toolbar-кнопками.
- `src-tauri/src/commands.rs` — добавить команды получения asset path и установки zip-пакета.
- `src-tauri/src/lib.rs` — зарегистрировать новые команды.
- `src-tauri/tauri.conf.json` — разрешить asset script/style для папки плагинов.
- `package.json` — добавить build script для bundled external plugins.

---

## Runtime Contract

`api.toolbar.registerButton(...)` сохраняет старое имя API, но не создаёт отдельную кнопку в верхнем Toolbar. Метод регистрирует действие плагина, которое Mivra показывает пунктом в раскрывающемся меню `Плагины`.

Целевой entry внешнего плагина:

```ts
window.MivraExternalPlugin.register({
  id: 'my-plugin',
  activate(api) {
    const disposeButton = api.toolbar.registerButton({
      id: 'open-my-plugin',
      label: 'My Plugin',
      title: 'Открыть My Plugin',
      order: 100,
      onClick: () => api.dialogs.open('my-plugin-dialog'),
    });

    const disposeDialog = api.dialogs.registerRenderer('my-plugin-dialog', {
      render({ container }) {
        container.innerHTML = '<div class="my-plugin-dialog">Hello</div>';
        return () => {
          container.innerHTML = '';
        };
      },
    });

    return () => {
      disposeButton();
      disposeDialog();
    };
  },
});
```

---

### Task 1: Add External Runtime Types

**Files:**
- Modify: `src/plugins/types.ts`
- Create: `src/plugins/externalPluginTypes.ts`
- Test: `src/test/externalPluginRegistry.test.ts`

- [ ] **Step 1: Write failing registry type test**

```ts
import { describe, expect, it } from 'vitest';
import { createExternalPluginRegistry } from '../plugins/externalPluginRegistry';

describe('external plugin registry', () => {
  it('registers plugin module by id and returns it once', () => {
    const registry = createExternalPluginRegistry();
    const module = { id: 'test-plugin', activate: () => undefined };

    registry.register(module);

    expect(registry.take('test-plugin')).toBe(module);
    expect(registry.take('test-plugin')).toBeNull();
  });
});
```

- [ ] **Step 2: Run red test**

Run: `npx vitest run src/test/externalPluginRegistry.test.ts`

Expected: FAIL because `externalPluginRegistry` does not exist.

- [ ] **Step 3: Add runtime types**

Create `src/plugins/externalPluginTypes.ts`:

```ts
import type { MivraPluginApi } from './types';

export type ExternalPluginActivate = (api: MivraPluginApi) => void | (() => void) | Promise<void | (() => void)>;

export type ExternalPluginModule = {
  id: string;
  activate: ExternalPluginActivate;
};

export type ExternalPluginRegistry = {
  register: (module: ExternalPluginModule) => void;
  take: (pluginId: string) => ExternalPluginModule | null;
};

declare global {
  interface Window {
    MivraExternalPlugin?: ExternalPluginRegistry;
  }
}
```

- [ ] **Step 4: Add registry implementation**

Create `src/plugins/externalPluginRegistry.ts`:

```ts
import type { ExternalPluginModule, ExternalPluginRegistry } from './externalPluginTypes';

export function createExternalPluginRegistry(): ExternalPluginRegistry {
  const modules = new Map<string, ExternalPluginModule>();

  return {
    register: (module) => {
      modules.set(module.id, module);
    },
    take: (pluginId) => {
      const module = modules.get(pluginId) ?? null;
      modules.delete(pluginId);
      return module;
    },
  };
}

export function ensureExternalPluginRegistry(): ExternalPluginRegistry {
  if (!window.MivraExternalPlugin) {
    window.MivraExternalPlugin = createExternalPluginRegistry();
  }

  return window.MivraExternalPlugin;
}
```

- [ ] **Step 5: Run green test**

Run: `npx vitest run src/test/externalPluginRegistry.test.ts`

Expected: PASS.

---

### Task 2: Support Renderer Dialogs

**Files:**
- Modify: `src/plugins/types.ts`
- Modify: `src/plugins/pluginStore.ts`
- Modify: `src/plugins/PluginDialogHost.tsx`
- Test: `src/test/pluginRegistry.test.ts`

- [ ] **Step 1: Write failing test for renderer dialog**

Append to `src/test/pluginRegistry.test.ts`:

```ts
it('registers and opens renderer dialogs', () => {
  const api = createMivraPluginApi('test-plugin', {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'Test',
    author: 'Test',
    permissions: ['dialog'],
    apiVersion: 1,
  });

  const dispose = api.dialogs.registerRenderer('test-dialog', {
    render: () => () => undefined,
  });
  api.dialogs.open('test-dialog', { value: 1 });

  expect(usePluginStore.getState().dialogs[0]).toMatchObject({
    id: 'test-dialog',
    pluginId: 'test-plugin',
    kind: 'renderer',
  });
  expect(usePluginStore.getState().openDialogs[0]).toEqual({
    id: 'test-dialog',
    props: { value: 1 },
  });

  dispose();
  expect(usePluginStore.getState().dialogs).toHaveLength(0);
});
```

- [ ] **Step 2: Run red test**

Run: `npx vitest run src/test/pluginRegistry.test.ts`

Expected: FAIL because `registerRenderer` does not exist.

- [ ] **Step 3: Update plugin types**

In `src/plugins/types.ts`, add:

```ts
export type PluginDialogRenderContext = {
  container: HTMLElement;
  props: Record<string, unknown>;
  api: MivraPluginApi;
};

export type PluginDialogRenderer = {
  render: (context: PluginDialogRenderContext) => void | (() => void);
};
```

Replace `RegisteredDialog` with a discriminated union:

```ts
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
```

Add to `MivraPluginApi.dialogs`:

```ts
registerRenderer: (id: string, renderer: PluginDialogRenderer) => () => void;
```

- [ ] **Step 4: Update `mivraApi`**

Change signature:

```ts
export function createMivraPluginApi(pluginId: string, manifest?: PluginManifest): MivraPluginApi
```

Add renderer registration:

```ts
registerRenderer: (id, renderer) => usePluginStore.getState().registerDialog({
  kind: 'renderer',
  id,
  pluginId,
  renderer,
}),
```

Existing React dialogs must register with `kind: 'component'`.

- [ ] **Step 5: Update `PluginDialogHost`**

For component dialogs, render existing component path.

For renderer dialogs, render:

```tsx
function PluginRendererDialog({ dialog, props }: {
  dialog: Extract<RegisteredDialog, { kind: 'renderer' }>;
  props: Record<string, unknown>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const api = createMivraPluginApi(dialog.pluginId);
    const cleanup = dialog.renderer.render({
      container: containerRef.current,
      props,
      api,
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, [dialog, props]);

  return <div ref={containerRef} />;
}
```

- [ ] **Step 6: Run green test**

Run: `npx vitest run src/test/pluginRegistry.test.ts`

Expected: PASS.

---

### Task 3: Add Permission-Scoped Plugin API

**Files:**
- Create: `src/plugins/pluginPermissions.ts`
- Modify: `src/plugins/mivraApi.ts`
- Test: `src/test/pluginPermissions.test.ts`

- [ ] **Step 1: Write failing permission tests**

Create `src/test/pluginPermissions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMivraPluginApi } from '../plugins/mivraApi';
import type { PluginManifest } from '../plugins/types';

const baseManifest: PluginManifest = {
  id: 'test-plugin',
  name: 'Test',
  version: '1.0.0',
  description: 'Test',
  author: 'Test',
  permissions: [],
  apiVersion: 1,
};

describe('plugin permissions', () => {
  it('blocks document read without document:read permission', () => {
    const api = createMivraPluginApi('test-plugin', baseManifest);

    expect(() => api.document.getContent()).toThrow('permission_denied');
  });

  it('allows document read with document:read permission', () => {
    const api = createMivraPluginApi('test-plugin', {
      ...baseManifest,
      permissions: ['document:read'],
    });

    expect(() => api.document.getContent()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run red test**

Run: `npx vitest run src/test/pluginPermissions.test.ts`

Expected: FAIL because permission checks do not exist.

- [ ] **Step 3: Add permission helper**

Create `src/plugins/pluginPermissions.ts`:

```ts
import type { PluginManifest, PluginPermission } from './types';

export function requirePluginPermission(manifest: PluginManifest | undefined, permission: PluginPermission): void {
  if (!manifest) return;
  if (!manifest.permissions.includes(permission)) {
    throw new Error(`permission_denied: ${permission}`);
  }
}
```

- [ ] **Step 4: Gate sensitive API methods**

In `src/plugins/mivraApi.ts`:

```ts
import { requirePluginPermission } from './pluginPermissions';
import type { MivraPluginApi, PluginManifest } from './types';
```

Wrap:

```ts
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
  ...
},
register: (id, component) => {
  requirePluginPermission(manifest, 'dialog');
  ...
},
registerRenderer: (id, renderer) => {
  requirePluginPermission(manifest, 'dialog');
  ...
},
saveHtml: (html, defaultName) => {
  requirePluginPermission(manifest, 'export:html');
  return tauri.exportToHtml(html, defaultName);
},
savePdfBytes: (bytes, defaultName) => {
  requirePluginPermission(manifest, 'export:pdf');
  return tauri.exportToPdf(bytes, defaultName);
},
```

- [ ] **Step 5: Run green tests**

Run:
- `npx vitest run src/test/pluginPermissions.test.ts`
- `npx vitest run src/test/pluginRegistry.test.ts`

Expected: PASS.

---

### Task 3A: Move Plugin Actions Into Plugins Dropdown

**Files:**
- Modify: `src/components/Toolbar/Toolbar.tsx`
- Modify: `src/components/Toolbar/toolbar.css`
- Modify: `src/test/Toolbar.test.tsx`

- [ ] **Step 1: Write failing toolbar dropdown test**

Add a test that proves plugin actions do not appear as separate Toolbar buttons before the dropdown is opened:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Toolbar } from '../components/Toolbar/Toolbar';
import { usePluginStore } from '../plugins/pluginStore';

describe('Toolbar plugin menu', () => {
  beforeEach(() => {
    usePluginStore.setState({ toolbarButtons: [] });
  });

  it('shows registered plugin actions only inside the Plugins dropdown', () => {
    usePluginStore.setState({
      toolbarButtons: [
        {
          id: 'open-export-pdf',
          pluginId: 'export-pdf',
          label: 'Export PDF',
          title: 'Экспортировать документ в PDF',
          order: 10,
          onClick: () => undefined,
        },
        {
          id: 'open-test-plugin',
          pluginId: 'test-plugin',
          label: 'Test Plugin',
          title: 'Открыть Test Plugin',
          order: 20,
          onClick: () => undefined,
        },
      ],
    });

    render(<Toolbar />);

    expect(screen.queryByRole('button', { name: 'Export PDF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Test Plugin' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Плагины|Plugins/i }));

    expect(screen.getByRole('menuitem', { name: 'Export PDF' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Test Plugin' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run red test**

Run: `npx vitest run src/test/Toolbar.test.tsx`

Expected: FAIL while plugin buttons are still rendered directly in Toolbar.

- [ ] **Step 3: Replace direct button rendering with a menu**

In `src/components/Toolbar/Toolbar.tsx`:
- sort registered actions once as `sortedPluginButtons`;
- remove direct `.map(...)` rendering of plugin actions as top-level `<button>`;
- render one `Плагины` button with `aria-haspopup="menu"` and `aria-expanded`;
- inside the popover render registered plugin actions as `role="menuitem"`;
- include a menu item for opening the Plugin Manager;
- close the menu after action click, Escape, outside click, and blur outside the menu.

Implementation outline:

```tsx
const [isPluginMenuOpen, setIsPluginMenuOpen] = useState(false);
const pluginMenuRef = useRef<HTMLDivElement>(null);

const sortedPluginButtons = useMemo(
  () => pluginButtons.slice().sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
  [pluginButtons],
);
```

```tsx
<div className="toolbar-plugin-menu" ref={pluginMenuRef}>
  <button
    type="button"
    className="toolbar-btn"
    aria-haspopup="menu"
    aria-expanded={isPluginMenuOpen}
    onClick={() => setIsPluginMenuOpen((open) => !open)}
  >
    {t.plugins}
  </button>

  {isPluginMenuOpen && (
    <div className="toolbar-plugin-menu-popover" role="menu" aria-label={t.plugins}>
      {sortedPluginButtons.length > 0 ? (
        sortedPluginButtons.map((button) => (
          <button
            key={`${button.pluginId}:${button.id}`}
            type="button"
            className="toolbar-plugin-menu-item"
            role="menuitem"
            title={button.title}
            onClick={() => {
              setIsPluginMenuOpen(false);
              button.onClick();
            }}
          >
            {button.label}
          </button>
        ))
      ) : (
        <div className="toolbar-plugin-menu-empty">{t.pluginMenuEmpty}</div>
      )}

      <div className="toolbar-plugin-menu-separator" />
      <button
        type="button"
        className="toolbar-plugin-menu-item"
        role="menuitem"
        onClick={() => {
          setIsPluginMenuOpen(false);
          setShowPlugins(true);
        }}
      >
        {t.pluginManagerTitle}
      </button>
    </div>
  )}
</div>
```

- [ ] **Step 4: Add dropdown styles**

In `src/components/Toolbar/toolbar.css`, add styles for:
- `.toolbar-plugin-menu`
- `.toolbar-plugin-menu-popover`
- `.toolbar-plugin-menu-item`
- `.toolbar-plugin-menu-empty`
- `.toolbar-plugin-menu-separator`

The popover must have a high `z-index`, fixed min/max width, vertical scroll for long plugin lists, and must not resize the Toolbar.

- [ ] **Step 5: Add localization**

Add keys to `src/i18n/ru.ts` and `src/i18n/en.ts`:
- `pluginMenuEmpty`: `Нет активных плагинов` / `No active plugins`
- `pluginManagerTitle`: `Менеджер плагинов` / `Plugin Manager`

- [ ] **Step 6: Run green test**

Run: `npx vitest run src/test/Toolbar.test.tsx`

Expected: PASS. Export PDF и все будущие плагины запускаются из dropdown `Плагины`, а не из отдельных Toolbar-кнопок.

---

### Task 4: Add Backend Asset Path Command

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Run: `npm run gen:types`
- Test: `cd src-tauri; cargo test`

- [ ] **Step 1: Add Rust tests**

Append to existing `commands.rs` tests:

```rust
#[test]
fn validate_plugin_relative_file_accepts_nested_forward_path() {
  assert!(super::validate_plugin_relative_file("assets/index.js").is_ok());
}

#[test]
fn validate_plugin_relative_file_rejects_backslash_path() {
  let err = super::validate_plugin_relative_file("assets\\index.js").unwrap_err();
  assert!(err.contains("plugin_path"), "got: {}", err);
}
```

- [ ] **Step 2: Run red or current validation tests**

Run: `cd src-tauri; cargo test validate_plugin_relative_file`

Expected: PASS for existing validation; new command still missing.

- [ ] **Step 3: Add command**

Add to `commands.rs`:

```rust
#[tauri::command]
#[specta::specta]
pub async fn get_plugin_asset_path(
  app: tauri::AppHandle,
  plugin_id: String,
  relative_path: String,
) -> Result<String, String> {
  validate_plugin_id(&plugin_id)?;
  validate_plugin_relative_file(&relative_path)?;

  let plugins = plugins_dir(&app)?;
  let plugin_dir = plugins.join(plugin_id);
  let target = plugin_dir.join(relative_path);

  let canonical_plugins = plugins
    .canonicalize()
    .map_err(|e| format!("Ошибка проверки директории плагинов: {}", e))?;
  let canonical_target = target
    .canonicalize()
    .map_err(|e| format!("Ошибка проверки файла плагина: {}", e))?;

  if !canonical_target.starts_with(&canonical_plugins) {
    return Err("plugin_path: файл вне директории плагинов".to_string());
  }

  if !canonical_target.is_file() {
    return Err("plugin_path: файл плагина не найден".to_string());
  }

  Ok(canonical_target.to_string_lossy().to_string())
}
```

- [ ] **Step 4: Register command**

In `src-tauri/src/lib.rs`, import and add `get_plugin_asset_path` to `tauri::generate_handler!`.

- [ ] **Step 5: Regenerate bindings**

Run: `npm run gen:types`

Expected: `src/bindings.ts` contains `getPluginAssetPath`.

- [ ] **Step 6: Run backend tests**

Run: `cd src-tauri; cargo test`

Expected: PASS.

---

### Task 5: Implement External Plugin Loader

**Files:**
- Create: `src/plugins/externalPluginLoader.ts`
- Modify: `src/plugins/PluginHost.tsx`
- Modify: `src/utils/tauri.ts`
- Modify: `src-tauri/tauri.conf.json`
- Test: `src/test/externalPluginLoader.test.ts`

- [ ] **Step 1: Write failing loader test**

Create `src/test/externalPluginLoader.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadExternalPlugin } from '../plugins/externalPluginLoader';
import { ensureExternalPluginRegistry } from '../plugins/externalPluginRegistry';
import type { PluginManifest } from '../plugins/types';

vi.mock('../utils/tauri', () => ({
  getPluginAssetPath: vi.fn(async (_pluginId: string, relativePath: string) => `C:/plugins/export-pdf/${relativePath}`),
}));

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}));

const manifest: PluginManifest = {
  id: 'export-pdf',
  name: 'Export PDF',
  version: '1.0.0',
  description: 'Export PDF',
  author: 'Mivra Team',
  entry: 'index.js',
  styles: 'style.css',
  permissions: ['document:read', 'dialog', 'export:pdf'],
  apiVersion: 1,
};

describe('external plugin loader', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    delete window.MivraExternalPlugin;
  });

  it('loads style and activates registered module', async () => {
    const registry = ensureExternalPluginRegistry();
    const activate = vi.fn(() => vi.fn());
    registry.register({ id: 'export-pdf', activate });

    const dispose = await loadExternalPlugin(manifest);

    expect(document.head.querySelector('link[href="asset://C:/plugins/export-pdf/style.css"]')).not.toBeNull();
    expect(activate).toHaveBeenCalledTimes(1);

    dispose();
    expect(document.head.querySelector('link')).toBeNull();
  });
});
```

- [ ] **Step 2: Run red test**

Run: `npx vitest run src/test/externalPluginLoader.test.ts`

Expected: FAIL because loader does not exist.

- [ ] **Step 3: Implement loader**

Create `src/plugins/externalPluginLoader.ts`:

```ts
import { convertFileSrc } from '@tauri-apps/api/core';
import { createMivraPluginApi } from './mivraApi';
import { ensureExternalPluginRegistry } from './externalPluginRegistry';
import * as tauri from '../utils/tauri';
import type { PluginManifest } from './types';

async function pluginAssetUrl(pluginId: string, relativePath: string): Promise<string> {
  const path = await tauri.getPluginAssetPath(pluginId, relativePath);
  return convertFileSrc(path);
}

export async function loadExternalPlugin(manifest: PluginManifest): Promise<() => void> {
  if (!manifest.entry) {
    throw new Error(`plugin_entry_missing: ${manifest.id}`);
  }

  const registry = ensureExternalPluginRegistry();
  const cleanup: Array<() => void> = [];

  if (manifest.styles) {
    const href = await pluginAssetUrl(manifest.id, manifest.styles);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
    cleanup.push(() => link.remove());
  }

  const scriptUrl = await pluginAssetUrl(manifest.id, manifest.entry);
  await import(/* @vite-ignore */ scriptUrl);

  const module = registry.take(manifest.id);
  if (!module) {
    throw new Error(`plugin_register_missing: ${manifest.id}`);
  }

  const pluginCleanup = await module.activate(createMivraPluginApi(manifest.id, manifest));
  if (pluginCleanup) cleanup.push(pluginCleanup);

  return () => {
    for (const dispose of cleanup.reverse()) {
      dispose();
    }
  };
}
```

- [ ] **Step 4: Add tauri wrapper**

In `src/utils/tauri.ts` add:

```ts
export async function getPluginAssetPath(pluginId: string, relativePath: string): Promise<string> {
  return unwrap(commands.getPluginAssetPath(pluginId, relativePath));
}
```

- [ ] **Step 5: Update CSP**

In `src-tauri/tauri.conf.json`, extend `script-src` and `style-src`:

```json
"script-src 'self' asset: http://asset.localhost https://asset.localhost"
```

```json
"style-src 'self' 'unsafe-inline' asset: http://asset.localhost https://asset.localhost"
```

Keep existing directives intact.

- [ ] **Step 6: Run loader test**

Run: `npx vitest run src/test/externalPluginLoader.test.ts`

Expected: PASS.

---

### Task 6: Load External Plugins in PluginHost

**Files:**
- Modify: `src/plugins/PluginHost.tsx`
- Modify: `src/components/PluginManager/PluginManagerDialog.tsx`
- Test: `src/test/pluginRegistry.test.ts`, `src/test/pluginManager.test.tsx`

- [ ] **Step 1: Add PluginHost test**

Create or extend `src/test/pluginRegistry.test.ts` with:

```ts
it('does not expose Export PDF as builtin plugin after migration', async () => {
  const { builtinPlugins } = await import('../plugins/builtinPlugins');
  expect(builtinPlugins.some((plugin) => plugin.manifest.id === 'export-pdf')).toBe(false);
});
```

- [ ] **Step 2: Run red test**

Run: `npx vitest run src/test/pluginRegistry.test.ts -t "does not expose Export PDF"`

Expected: FAIL while Export PDF is still in `builtinPlugins`.

- [ ] **Step 3: Update PluginHost**

`PluginHost` must:
- call `tauri.getInstalledPlugins()`;
- merge installed manifests into `pluginStore.manifests`;
- load only enabled external plugins with `loadExternalPlugin`;
- cleanup disabled plugins by calling returned dispose functions;
- call `usePluginStore.getState().clearPlugin(pluginId)` when unloading.

Implementation outline:

```ts
useEffect(() => {
  let active = true;

  tauri.getInstalledPlugins().then((plugins) => {
    if (!active) return;
    setManifests(plugins.map(pluginInfoToManifest));
  });

  return () => {
    active = false;
  };
}, [setManifests]);
```

```ts
useEffect(() => {
  let active = true;
  const disposers: Array<() => void> = [];

  async function loadEnabledPlugins() {
    const plugins = await tauri.getInstalledPlugins();
    for (const plugin of plugins) {
      if (!active || !enabledPlugins.includes(plugin.id)) continue;
      const dispose = await loadExternalPlugin(pluginInfoToManifest(plugin));
      disposers.push(dispose);
    }
  }

  void loadEnabledPlugins();

  return () => {
    active = false;
    for (const dispose of disposers.reverse()) dispose();
  };
}, [enabledPlugins]);
```

- [ ] **Step 4: Update PluginManager warning**

Remove `pluginExternalRuntimeDisabled`. Replace with a runtime state text:
- enabled plugin: `Работает`
- disabled plugin: `Отключён`
- missing entry: `Нет entry-файла`

- [ ] **Step 5: Run tests**

Run:
- `npx vitest run src/test/pluginRegistry.test.ts`
- `npx vitest run src/test/pluginManager.test.tsx`

Expected: PASS.

---

### Task 7: Add Zip/MivraPlugin Package Installation

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src/components/PluginManager/PluginManagerDialog.tsx`
- Test: `cd src-tauri; cargo test plugin`

- [ ] **Step 1: Add Rust dependency**

In `src-tauri/Cargo.toml` add:

```toml
zip = "2"
```

- [ ] **Step 2: Add package validation tests**

Add tests in `commands.rs`:

```rust
#[test]
fn validate_plugin_relative_file_rejects_zip_slip_path() {
  let err = super::validate_plugin_relative_file("../../evil.js").unwrap_err();
  assert!(err.contains("plugin_path"), "got: {}", err);
}
```

- [ ] **Step 3: Add `install_plugin_package` command**

The command accepts `.zip` and `.mivraplugin`, extracts into a temp dir, reads `plugin.json`, validates every entry path with the same path traversal rules, then copies to AppData plugins dir.

Command signature:

```rust
#[tauri::command]
#[specta::specta]
pub async fn install_plugin_package(
  app: tauri::AppHandle,
  package_path: String,
) -> Result<PluginInfo, String>
```

- [ ] **Step 4: Update bindings**

Run: `npm run gen:types`

Expected: `src/bindings.ts` contains `installPluginPackage`.

- [ ] **Step 5: Update Plugin Manager**

Add two install actions:
- `Добавить папку` -> current `installPlugin(folderPath)`
- `Добавить пакет` -> file dialog with `.zip` and `.mivraplugin`, then `installPluginPackage(packagePath)`

- [ ] **Step 6: Run backend and frontend tests**

Run:
- `cd src-tauri; cargo test plugin`
- `npx vitest run src/test/pluginManager.test.tsx`

Expected: PASS.

---

### Task 8: Move Export PDF to External Plugin

**Files:**
- Move from: `src/plugins/builtins/export-pdf/*`
- Create under: `plugins/export-pdf/src/*`
- Create: `plugins/export-pdf/plugin.json`
- Create: `plugins/export-pdf/vite.config.ts`
- Modify: `src/plugins/builtinPlugins.ts`
- Modify: `package.json`
- Test: all Export PDF tests

- [ ] **Step 1: Add plugin manifest**

Create `plugins/export-pdf/plugin.json`:

```json
{
  "id": "export-pdf",
  "name": "Export PDF",
  "version": "1.0.0",
  "description": "Экспорт Markdown в PDF с постраничным предпросмотром, настройкой листов и поддержкой основных Markdown-элементов.",
  "author": "Mivra Team",
  "entry": "index.js",
  "styles": "style.css",
  "permissions": ["document:read", "dialog", "export:pdf"],
  "apiVersion": 1
}
```

- [ ] **Step 2: Refactor ExportPdfDialog**

Remove direct import/use of `usePluginStore` from Export PDF. Dialog close must use:

```ts
api?.dialogs.close('export-pdf-dialog');
```

All document access must go through `api.document.getContent()` and `api.document.getFilePath()`.

- [ ] **Step 3: Add external register entry**

Create `plugins/export-pdf/src/register.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ExportPdfDialog } from './ExportPdfDialog';
import './export-pdf.css';
import type { MivraPluginApi } from '../../../src/plugins/types';

const DIALOG_ID = 'export-pdf-dialog';

window.MivraExternalPlugin?.register({
  id: 'export-pdf',
  activate(api: MivraPluginApi) {
    const disposeDialog = api.dialogs.registerRenderer(DIALOG_ID, {
      render({ container }) {
        const root = createRoot(container);
        root.render(<ExportPdfDialog api={api} />);
        return () => root.unmount();
      },
    });

    const disposeButton = api.toolbar.registerButton({
      id: 'open-export-pdf',
      label: 'Export PDF',
      title: 'Экспортировать документ в PDF',
      order: 10,
      onClick: () => api.dialogs.open(DIALOG_ID),
    });

    return () => {
      disposeButton();
      disposeDialog();
    };
  },
});
```

Это зарегистрированное действие должно появляться внутри dropdown `Плагины` как `Export PDF`; отдельную Toolbar-кнопку рендерить нельзя.

- [ ] **Step 4: Add Vite plugin build**

Create `plugins/export-pdf/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../../src-tauri/bundled-plugins/export-pdf',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: 'src/register.tsx',
      output: {
        format: 'es',
        entryFileNames: 'index.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
```

- [ ] **Step 5: Copy manifest into bundled output**

Add a small Node script `plugins/export-pdf/scripts/copy-manifest.mjs`:

```js
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const target = resolve(import.meta.dirname, '../../../src-tauri/bundled-plugins/export-pdf/plugin.json');
await mkdir(dirname(target), { recursive: true });
await copyFile(resolve(import.meta.dirname, '../plugin.json'), target);
```

- [ ] **Step 6: Add root build script**

In root `package.json`:

```json
"build:plugins": "npm --prefix plugins/export-pdf run build",
"build": "npm run build:plugins && tsc && vite build"
```

In `plugins/export-pdf/package.json`:

```json
{
  "type": "module",
  "scripts": {
    "build": "vite build && node scripts/copy-manifest.mjs"
  }
}
```

- [ ] **Step 7: Remove builtin registration**

Change `src/plugins/builtinPlugins.ts`:

```ts
export const builtinPlugins: BuiltinPlugin[] = [];
```

- [ ] **Step 8: Run Export PDF tests**

Run:
- `npx vitest run src/test/exportPdfDefinition.test.ts`
- `npx vitest run src/test/exportPdfBytes.test.ts`
- `npx vitest run src/test/exportPdfDialog.test.tsx`

Expected: PASS after imports are updated to new paths.

---

### Task 9: Bootstrap Bundled External Plugins

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/plugins/PluginHost.tsx`
- Test: Rust plugin tests

- [ ] **Step 1: Bundle plugin resource**

In `src-tauri/tauri.conf.json`, add bundle resources:

```json
"resources": [
  "bundled-plugins/export-pdf"
]
```

- [ ] **Step 2: Add bootstrap command**

Add command:

```rust
#[tauri::command]
#[specta::specta]
pub async fn ensure_bundled_plugins(app: tauri::AppHandle) -> Result<Vec<PluginInfo>, String>
```

Behavior:
- locate bundled resource `bundled-plugins/export-pdf`;
- read its `plugin.json`;
- copy to AppData plugins dir if missing;
- replace only when bundled version is newer than installed version;
- return `get_installed_plugins(app).await`.

- [ ] **Step 3: Call bootstrap before plugin load**

In `PluginHost`, call:

```ts
const plugins = await tauri.ensureBundledPlugins();
```

Use returned plugins for manifest list and activation.

- [ ] **Step 4: Verify Export PDF appears as external installed plugin**

Update `src/test/pluginManager.test.tsx`:

```ts
expect(screen.getByText('Установленный')).toBeInTheDocument();
expect(screen.queryByText('Встроенный')).not.toBeInTheDocument();
```

- [ ] **Step 5: Run tests**

Run:
- `cd src-tauri; cargo test plugin`
- `npx vitest run src/test/pluginManager.test.tsx`

Expected: PASS.

---

### Task 10: Plugin Documentation

**Files:**
- Create: `docs/PLUGINS.md`
- Modify: `README.md` if it exists and has a docs index
- Test: docs are linkable and examples match runtime types

- [ ] **Step 1: Write docs**

Create `docs/PLUGINS.md` with the sections:
- “Что такое внешний плагин Mivra”
- “Структура папки”
- “plugin.json”
- “Entry-файл”
- “MivraPluginApi”
- “Permissions”
- “Диалоги”
- “Сборка через Vite”
- “Установка через менеджер плагинов”
- “Пакет `.mivraplugin`”
- “Чеклист перед публикацией”

- [ ] **Step 2: Verify examples compile conceptually**

Every API name in docs must exist in `src/plugins/types.ts`:
- `window.MivraExternalPlugin.register`
- `api.toolbar.registerButton`
- `api.dialogs.registerRenderer`
- `api.dialogs.open`
- `api.dialogs.close`
- `api.document.getContent`
- `api.exports.savePdfBytes`

- [ ] **Step 3: Run final verification**

Run:
- `npx tsc --noEmit`
- `npm run test`
- `npm run build`
- `cd src-tauri; cargo test`
- `graphify update .`

Expected: all tests/build pass. `graphify update .` may print existing extraction warnings, but must exit with code 0.

---

## Manual Verification

- [ ] Start `npm run tauri dev`.
- [ ] Open Plugin Manager.
- [ ] Confirm Export PDF is listed as “Установленный”, not “Встроенный”.
- [ ] Confirm Export PDF is enabled by default from `enabled_plugins`.
- [ ] Confirm Toolbar contains one `Плагины` dropdown and no separate `Export PDF` button.
- [ ] Open `Плагины` dropdown and confirm `Export PDF` appears as a menu item.
- [ ] Click `Export PDF` menu item and confirm Export PDF dialog opens.
- [ ] Open Export PDF dialog.
- [ ] Change PDF settings and confirm preview updates without full UI reload.
- [ ] Export PDF and confirm generated file opens.
- [ ] Disable Export PDF in Plugin Manager and confirm `Export PDF` disappears from `Плагины` dropdown.
- [ ] Enable Export PDF and confirm `Export PDF` returns to `Плагины` dropdown.
- [ ] Install a test plugin folder with `plugin.json` + `index.js`; confirm it appears in Plugin Manager and can register a launcher item inside `Плагины`.
- [ ] Install the same plugin as `.mivraplugin`; confirm zip extraction validates paths and loads the plugin.

---

## Self-Review

Spec coverage:
- External plugin runtime: Tasks 1-7.
- Plugin dropdown UX: Task 3A and Manual Verification.
- Export PDF as external plugin: Tasks 8-9.
- Testing on Export PDF: Tasks 8-9 and Manual Verification.
- Plugin documentation: Task 10 and `docs/PLUGINS.md`.

No intentional placeholders are left. The plan uses exact command names, file paths, API names, and verification commands.
