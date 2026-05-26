# Разработка внешних плагинов Mivra

Этот документ описывает актуальный контракт внешних плагинов Mivra: формат папки, `plugin.json`, API, сборку, установку и типовые ошибки. Он рассчитан на разработчиков, которые хотят сделать свой плагин и подключить его через `Менеджер плагинов`.

Пользовательская инструкция по установке плагинов находится отдельно: [PLUGIN_USER_GUIDE.md](./PLUGIN_USER_GUIDE.md).

## Коротко

Плагин Mivra — это локальная папка или пакет `.mivraplugin`, внутри которого лежат:

```text
my-plugin/
  plugin.json
  index.js
  style.css
  assets/
```

`plugin.json` описывает плагин. `index.js` регистрирует модуль через `window.MivraExternalPlugin.register(...)`. После включения плагина Mivra вызывает `activate(api)` и передаёт `MivraPluginApi`.

Плагин может:
- добавлять действия в раскрывающееся меню `Плагины`;
- открывать собственные диалоги;
- читать текущий Markdown-документ при permission `document:read`;
- сохранять HTML/PDF при permissions `export:html` и `export:pdf`;
- подключать CSS и assets из своей папки.

Плагин не должен добавлять отдельные кнопки в основной Toolbar. Даже если метод называется `api.toolbar.registerButton(...)`, действие отображается пунктом внутри dropdown-кнопки `Плагины`. Это сделано специально, чтобы несколько плагинов не забивали интерфейс приложения.

## Где живут плагины

В исходниках проекта эталонный внешний плагин находится здесь:

```text
plugins/export-pdf/
```

Эта папка предназначена для разработки и не устанавливается напрямую через `Добавить папку`: в ней нет готового `index.js`. Сначала соберите плагин.

Собранная bundled-версия, которую приложение копирует при запуске:

```text
src-tauri/bundled-plugins/export-pdf/
```

После установки в приложении плагины копируются в директорию данных Mivra:

```text
%APPDATA%/com.brian.mivra/plugins/<plugin-id>/
```

На Windows для `Export PDF` это обычно:

```text
C:/Users/<User>/AppData/Roaming/com.brian.mivra/plugins/export-pdf/
```

## Жизненный цикл

1. Пользователь устанавливает папку или пакет через `Менеджер плагинов`.
2. Backend проверяет `plugin.json`, `id`, пути и копирует плагин в `AppData/plugins`.
3. Плагин появляется в менеджере как установленный, но новый внешний плагин по умолчанию выключен.
4. Пользователь включает плагин.
5. Frontend загружает CSS из `styles`, затем импортирует `entry`.
6. Entry-файл вызывает `window.MivraExternalPlugin.register({ id, activate })`.
7. Mivra вызывает `activate(api)`.
8. Плагин регистрирует пункты меню, диалоги и подписки.
9. При выключении Mivra вызывает cleanup-функцию, которую вернул `activate`.

## Формат plugin.json

Минимальный пример:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Краткое описание плагина.",
  "author": "Author Name",
  "entry": "index.js",
  "styles": "style.css",
  "permissions": ["dialog"],
  "apiVersion": 1
}
```

Поля:

| Поле | Тип | Обязательно | Описание |
| --- | --- | --- | --- |
| `id` | `string` | да | Уникальный идентификатор плагина. |
| `name` | `string` | да | Название в менеджере и списках. |
| `version` | `string` | да | Версия плагина. Для bundled-плагинов используется сравнение semver-чисел. |
| `description` | `string` | да | Описание для менеджера плагинов. |
| `author` | `string` | да | Автор или команда. |
| `entry` | `string` | да для внешнего JS-плагина | Относительный путь к JS entry-файлу. |
| `styles` | `string` | нет | Относительный путь к CSS-файлу. |
| `permissions` | `string[]` | да | Разрешения, которые запрашивает плагин. |
| `apiVersion` | `1` | да | Версия Plugin API. Сейчас поддерживается `1`. |

Ограничения:
- `id`: от 3 до 64 символов;
- `id`: только `a-z`, `0-9`, `-`;
- `id` не может начинаться или заканчиваться дефисом;
- `entry` и `styles` должны быть относительными путями внутри папки плагина;
- файл из `entry` должен существовать и быть файлом;
- файл из `styles`, если указан, должен существовать и быть файлом;
- в путях используйте только `/`, не `\`;
- абсолютные пути запрещены;
- `..` в путях запрещён;
- symbolic links внутри плагина запрещены;
- повторная установка плагина с тем же `id` запрещена.

## Permissions

Доступные permissions:

```ts
type PluginPermission =
  | 'document:read'
  | 'dialog'
  | 'export:html'
  | 'export:pdf';
```

Что они открывают:

| Permission | Доступ |
| --- | --- |
| `document:read` | `api.document.getContent()`, `api.document.getFilePath()`, `api.document.subscribeContent(...)` |
| `dialog` | `api.dialogs.register(...)`, `api.dialogs.registerRenderer(...)` |
| `export:html` | `api.exports.saveHtml(...)` |
| `export:pdf` | `api.exports.savePdfBytes(...)` |

Регистрация пункта в меню `Плагины` доступна активированному плагину без отдельного permission. Но чтение документа, диалоги и экспорт проверяются явно.

Запрашивайте минимальные permissions. Например, если плагин только открывает окно и показывает статический UI, достаточно `["dialog"]`.

Важно: permissions ограничивают только методы `MivraPluginApi`. Внешний плагин всё равно является локальным исполняемым JavaScript-кодом в окне приложения, поэтому это не полноценная песочница для недоверенного кода. Устанавливайте и распространяйте плагины как trusted code, а manifest permissions используйте как контракт API и UX-сигнал для ревью.

## Текущий статус API v1 и будущая изоляция API v2

В Mivra сейчас поддерживается только `apiVersion: 1`. Это модель trusted plugins: плагин загружается как JavaScript в renderer-окно Mivra через dynamic import, получает `MivraPluginApi` и регистрирует действия, диалоги и cleanup-функции.

Это удобно для первого этапа и для bundled-плагинов вроде `Export PDF`, но важно понимать границу безопасности:
- `permissions` ограничивают официальный `MivraPluginApi`;
- плагин v1 всё равно исполняется в том же `window`, что и Mivra;
- плагин v1 потенциально может читать или менять DOM приложения, влиять на стили, вешать обработчики событий, потреблять CPU/память и ломать интерфейс;
- поэтому v1 нельзя позиционировать как безопасную установку произвольных плагинов из недоверенных источников.

Для публичного каталога плагинов, установки плагинов от неизвестных авторов или более строгой security-модели нужен отдельный этап `apiVersion: 2` с runtime-изоляцией. Предпочтительный вариант для Mivra — iframe sandbox:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "2.0.0",
  "entry": "index.html",
  "runtime": "iframe",
  "permissions": ["document:read", "dialog"],
  "apiVersion": 2
}
```

Целевая идея API v2:
- плагин запускается внутри `<iframe sandbox="allow-scripts">`, а не импортируется в основной `window`;
- UI плагина живёт внутри iframe и не имеет прямого доступа к DOM Mivra;
- Mivra и плагин общаются только через `postMessage`/RPC;
- плагин регистрирует действия декларативно, а не передаёт JS-callback в основной toolbar;
- при клике по пункту меню `Плагины` Mivra отправляет iframe событие запуска действия;
- доступ к документу, экспорту, настройкам и assets проходит только через проверяемые RPC-команды;
- permissions становятся ближе к реальной runtime-политике, потому что у плагина нет прямого доступа к объектам основного окна.

Ориентировочные события/команды v2:

```ts
type PluginV2Message =
  | { type: 'plugin:ready' }
  | { type: 'plugin:register-actions'; actions: Array<{ id: string; label: string; title?: string }> }
  | { type: 'plugin:run-action'; actionId: string }
  | { type: 'document:getContent'; requestId: string }
  | { type: 'document:content'; requestId: string; content: string }
  | { type: 'export:savePdfBytes'; requestId: string; bytes: Uint8Array; defaultName?: string }
  | { type: 'asset:readBytes'; requestId: string; relativePath: string };
```

Планируемая стратегия миграции:
1. Сохранить `apiVersion: 1` как trusted runtime для существующих плагинов.
2. Добавить `apiVersion: 2` и `runtime: "iframe"` параллельно, без поломки v1.
3. Перенести `Export PDF` на v2 как эталонный сложный плагин с UI, assets и PDF-экспортом.
4. После проверки v2 использовать его как рекомендуемый формат для сторонних плагинов.
5. В документации явно разделять `v1 trusted plugin` и `v2 sandboxed plugin`.

Не надо менять `apiVersion` на `2` до реализации runtime: текущий backend намеренно отклоняет все версии, кроме `1`.

## Entry-файл

Entry-файл должен зарегистрировать модуль:

```js
window.MivraExternalPlugin.register({
  id: 'my-plugin',
  activate(api) {
    const disposeDialog = api.dialogs.registerRenderer('my-plugin-dialog', {
      render({ container, api }) {
        container.innerHTML = `
          <section class="my-plugin-dialog">
            <h2>My Plugin</h2>
            <button type="button" data-close>Закрыть</button>
          </section>
        `;

        const closeButton = container.querySelector('[data-close]');
        const close = () => api.dialogs.close('my-plugin-dialog');
        closeButton?.addEventListener('click', close);

        return () => {
          closeButton?.removeEventListener('click', close);
          container.innerHTML = '';
        };
      },
    });

    const disposeButton = api.toolbar.registerButton({
      id: 'open-my-plugin',
      label: 'My Plugin',
      title: 'Открыть My Plugin',
      order: 100,
      onClick: () => api.dialogs.open('my-plugin-dialog'),
    });

    return () => {
      disposeButton();
      disposeDialog();
    };
  },
});
```

Важные правила:
- `id` в `register(...)` должен совпадать с `plugin.json`;
- `activate(api)` вызывается при включении плагина;
- если `activate` вернул функцию, она будет вызвана при выключении или выгрузке;
- снимайте DOM listeners, subscriptions, timers и React root в cleanup;
- используйте уникальные id для действий и диалогов, лучше с префиксом своего плагина.

## MivraPluginApi

Текущий API:

```ts
type MivraPluginApi = {
  apiVersion: 1;
  pluginId: string;
  toolbar: {
    registerButton(button: {
      id: string;
      label: string;
      title?: string;
      order?: number;
      onClick: () => void;
    }): () => void;
  };
  dialogs: {
    register(id: string, component: React.ComponentType<Record<string, unknown>>): () => void;
    registerRenderer(id: string, renderer: PluginDialogRenderer): () => void;
    open(id: string, props?: Record<string, unknown>): void;
    close(id: string): void;
  };
  document: {
    getContent(): string;
    getFilePath(): string | null;
    subscribeContent(callback: (content: string) => void): () => void;
  };
  settings: {
    getLanguage(): 'ru' | 'en';
    getTheme(): 'light' | 'dark' | 'system';
  };
  exports: {
    saveHtml(html: string, defaultName?: string): Promise<string | null>;
    savePdfBytes(bytes: Uint8Array, defaultName?: string): Promise<string | null>;
  };
};
```

### `api.toolbar.registerButton`

Регистрирует действие плагина:

```js
const dispose = api.toolbar.registerButton({
  id: 'open-report',
  label: 'Report',
  title: 'Открыть отчёт',
  order: 20,
  onClick: () => api.dialogs.open('report-dialog'),
});
```

В UI это будет пункт в dropdown `Плагины`, а не отдельная кнопка Toolbar. `order` управляет сортировкой пунктов.

### `api.dialogs.registerRenderer`

Рекомендуемый способ для внешних плагинов. Плагин сам управляет DOM внутри выданного контейнера:

```js
const dispose = api.dialogs.registerRenderer('report-dialog', {
  render({ container, props, api }) {
    container.innerHTML = `<pre>${String(props.title ?? '')}</pre>`;
    return () => {
      container.innerHTML = '';
    };
  },
});
```

Для этого нужен permission `dialog`.

### `api.dialogs.register`

Позволяет зарегистрировать React-компонент. Для внешних плагинов обычно удобнее `registerRenderer`, потому что плагин сам контролирует свой React root и версию React.

### `api.document`

Пример чтения текущего Markdown:

```js
const markdown = api.document.getContent();
const filePath = api.document.getFilePath();

const unsubscribe = api.document.subscribeContent((nextContent) => {
  console.log('Длина документа:', nextContent.length);
});
```

Для этого нужен permission `document:read`.

### `api.settings`

Позволяет подстроиться под язык и тему приложения:

```js
const language = api.settings.getLanguage();
const theme = api.settings.getTheme();
```

### `api.exports.saveHtml`

Сохраняет HTML через системный диалог:

```js
const savedPath = await api.exports.saveHtml('<h1>Hello</h1>', 'document.html');
```

Для этого нужен permission `export:html`.

### `api.exports.savePdfBytes`

Сохраняет PDF-байты через системный диалог:

```js
const bytes = new Uint8Array([/* PDF bytes */]);
const savedPath = await api.exports.savePdfBytes(bytes, 'document.pdf');
```

Для этого нужен permission `export:pdf`.

## React-плагин

React-плагин лучше подключать через `registerRenderer`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';

function PluginApp({ api }: { api: MivraPluginApi }) {
  return (
    <section className="my-plugin">
      <h2>My Plugin</h2>
      <button type="button" onClick={() => api.dialogs.close('my-plugin-dialog')}>
        Закрыть
      </button>
    </section>
  );
}

window.MivraExternalPlugin?.register({
  id: 'my-plugin',
  activate(api) {
    const disposeDialog = api.dialogs.registerRenderer('my-plugin-dialog', {
      render({ container }) {
        const root = createRoot(container);
        root.render(<PluginApp api={api} />);
        return () => root.unmount();
      },
    });

    const disposeButton = api.toolbar.registerButton({
      id: 'open-my-plugin',
      label: 'My Plugin',
      onClick: () => api.dialogs.open('my-plugin-dialog'),
    });

    return () => {
      disposeButton();
      disposeDialog();
    };
  },
});
```

## CSS

CSS плагина подключается глобально, поэтому классы нужно неймспейсить:

```css
.my-plugin {
  display: grid;
  gap: 12px;
}

.my-plugin__button {
  border-radius: 6px;
}
```

Не используйте общие селекторы вроде `button`, `body`, `.modal`, `.toolbar`, если это не осознанное изменение. Такой CSS может сломать интерфейс Mivra или другой плагин.

## Assets и файлы плагина

Обычные CSS assets можно подключать через сборщик. Для JS assets в Vite нужно использовать resolver Mivra, иначе на Windows относительные пути могут сломаться из-за `asset.localhost` и кодирования абсолютного пути.

В Mivra доступен runtime helper:

```ts
window.__mivraResolvePluginAsset(pluginId, relativePath): string
```

Он принимает `pluginId` и относительный путь внутри установленной папки плагина, возвращает URL для WebView.

Для бинарных assets, которые нужно читать как байты, доступен helper:

```ts
window.__mivraReadPluginAssetBytes(assetUrl): Promise<Uint8Array>
```

Он работает только с URL, который ранее был получен через `__mivraResolvePluginAsset(...)`. Это нужно, например, для PDF-шрифтов: прямой `fetch(asset.localhost/...)` для `.ttf` может вернуть `404`, поэтому `Export PDF` читает шрифты через backend-команду.

Пример:

```ts
const fontUrl = window.__mivraResolvePluginAsset?.('my-plugin', 'assets/MyFont.ttf');
if (!fontUrl || !window.__mivraReadPluginAssetBytes) {
  throw new Error('Plugin asset API is unavailable');
}

const fontBytes = await window.__mivraReadPluginAssetBytes(fontUrl);
```

Эти helpers являются инфраструктурой загрузчика. Для большинства простых плагинов они не нужны напрямую, но они важны для Vite-сборки и бинарных ресурсов.

## Сборка через Vite

Рекомендуемый `vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const pluginDir = dirname(fileURLToPath(import.meta.url));
const pluginId = 'my-plugin';

export default defineConfig({
  base: './',
  plugins: [react()],
  publicDir: false,
  experimental: {
    renderBuiltUrl(filename, { hostType }) {
      if (hostType === 'js') {
        return {
          runtime: `window.__mivraResolvePluginAsset(${JSON.stringify(pluginId)}, ${JSON.stringify(filename)})`,
        };
      }
      return { relative: true };
    },
  },
  build: {
    outDir: resolve(pluginDir, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      input: resolve(pluginDir, 'src/register.tsx'),
      output: {
        format: 'es',
        inlineDynamicImports: true,
        entryFileNames: 'index.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return 'style.css';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
});
```

Почему так:
- `base: './'` нужен для относительных CSS assets;
- `inlineDynamicImports: true` убирает runtime dynamic import chunks;
- `renderBuiltUrl(...)` заставляет JS-asset пути проходить через Mivra resolver;
- `assetFileNames` кладёт CSS в `style.css`, чтобы его можно было указать в `plugin.json`.

После сборки скопируйте `plugin.json` в `dist/`:

```js
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(scriptDir, '..');
const target = resolve(pluginDir, 'dist/plugin.json');

await mkdir(dirname(target), { recursive: true });
await copyFile(resolve(pluginDir, 'plugin.json'), target);
```

## Установка папки

В режиме разработки:

1. Соберите плагин в `dist/`.
2. Проверьте, что в `dist/` лежит `plugin.json`.
3. Откройте Mivra.
4. В Toolbar нажмите `Плагины`.
5. Откройте `Менеджер плагинов`.
6. Нажмите `Добавить папку`.
7. Выберите папку `dist/`.
8. Включите плагин.
9. Откройте dropdown `Плагины` и выберите действие плагина.

## Пакет .mivraplugin

Пакет `.mivraplugin` — это zip-архив с другим расширением. `plugin.json` должен лежать в корне архива или внутри единственной верхней папки пакета.

Правильно:

```text
my-plugin.mivraplugin
  plugin.json
  index.js
  style.css
  assets/
```

Также поддерживается:

```text
my-plugin.mivraplugin
  my-plugin/
    plugin.json
    index.js
    style.css
    assets/
```

Неправильно:

```text
my-plugin.mivraplugin
  release/
    my-plugin/
      plugin.json
      index.js
```

Если в архиве несколько верхних папок или `plugin.json` находится глубже, Mivra отклонит пакет.

Поддерживаются расширения:
- `.mivraplugin`;
- `.zip`.

Пути внутри архива проходят те же проверки: нельзя абсолютные пути, `..` и `\`.

## Export PDF как эталонный плагин

`Export PDF` — это не встроенный React-компонент Toolbar, а внешний bundled plugin. Он показывает, как делать сложный плагин с React, CSS, assets, PDF-генерацией и диалогом.

Исходники:

```text
plugins/export-pdf/
  plugin.json
  vite.config.ts
  src/
    register.tsx
    ExportPdfDialog.tsx
    PdfPreviewPages.tsx
    pdfDefinition.ts
    pdfMakeClient.ts
    pdfFonts.ts
    export-pdf.css
```

Сборка:

```bash
npm run build:plugins
```

Результат:

```text
src-tauri/bundled-plugins/export-pdf/
  plugin.json
  index.js
  style.css
  assets/
```

При запуске Mivra команда `ensure_bundled_plugins` копирует bundled plugin в `AppData/plugins/export-pdf`, если установленной версии нет или bundled-версия новее. Если пользователь удалил bundled-плагин через менеджер, его `id` сохраняется в `settings.removed_bundled_plugins`, и Mivra не восстанавливает этот плагин при следующем запуске.

Если меняете `Export PDF`, увеличивайте `version` в `plugins/export-pdf/plugin.json`. Иначе уже установленная копия в `AppData` может не обновиться.

## OpenRouter Summary как простой внешний плагин

`OpenRouter Summary` показывает минимальный формат внешнего плагина без Vite-сборки. Он читает текущий Markdown, открывает ресайзабельное модальное окно и отправляет документ в OpenRouter Chat Completions API.

Исходники:

```text
plugins/openrouter-summary/
  plugin.json
  index.js
  style.css
```

Для установки как папки выберите именно:

```text
plugins/openrouter-summary/
```

Для распространения соберите `.mivraplugin`:

```powershell
Compress-Archive -Path plugins\openrouter-summary\* -DestinationPath plugins\openrouter-summary-1.0.1.mivraplugin -Force
```

Плагин запрашивает только:

```json
["document:read", "dialog"]
```

API-ключ OpenRouter вводится пользователем в окне плагина. По умолчанию ключ не сохраняется; сохранение включается отдельным чекбоксом внутри диалога.

## Типовые ошибки

### Плагин установлен, но не появился в dropdown

Проверьте:
- плагин включён в менеджере;
- `activate(api)` вызвал `api.toolbar.registerButton(...)`;
- `id` в `window.MivraExternalPlugin.register(...)` совпадает с `plugin.json`;
- в консоли нет ошибки `plugin_register_missing`.

### `plugin_register_missing`

Entry-файл загрузился, но не вызвал:

```js
window.MivraExternalPlugin.register(...)
```

Или `id` в register не совпадает с `plugin.json`.

### `plugin_root_missing`

JS пытается получить asset до того, как загрузчик зарегистрировал корень плагина. Обычно это ошибка в ручном вызове `__mivraResolvePluginAsset` или некорректная сборка.

### `Failed to fetch dynamically imported module: http://asset.localhost/chunks/...`

Сборка оставила runtime dynamic import. Для внешних Vite-плагинов используйте:

```ts
inlineDynamicImports: true
```

### Asset уходит в `http://asset.localhost/chunks/...`

Сборка оставила относительный asset URL внутри JS. Используйте `experimental.renderBuiltUrl(...)` из примера выше.

### Шрифт или бинарный asset возвращает `404`

Не полагайтесь только на `fetch(assetUrl)`. Для бинарных файлов используйте:

```ts
const bytes = await window.__mivraReadPluginAssetBytes(assetUrl);
```

URL должен быть получен через:

```ts
window.__mivraResolvePluginAsset(pluginId, relativePath);
```

### Permission denied

Плагин вызывает API без нужного permission. Добавьте нужное разрешение в `plugin.json` и переустановите или обновите плагин.

Если permission написан с ошибкой или не поддерживается текущей версией Mivra, плагин будет отклонён при установке.

### `plugin_api_version`

Mivra сейчас поддерживает только `apiVersion: 1`. Плагины с другой версией API отклоняются при установке или загрузке.

### Пакет не устанавливается

Проверьте:
- расширение `.mivraplugin` или `.zip`;
- `plugin.json` лежит в корне архива;
- внутри архива нет `..`, абсолютных путей и `\`;
- в папке плагина нет symbolic links;
- плагин с таким `id` ещё не установлен.

## Чеклист перед публикацией

- `plugin.json` лежит в корне папки или архива.
- `id` валиден и уникален.
- `entry` указывает на существующий JS-файл.
- `styles`, если указан, указывает на существующий CSS-файл.
- Все пути относительные и используют `/`.
- В плагине нет symbolic links.
- Permissions минимальные.
- `activate(api)` возвращает cleanup.
- Все DOM listeners, subscriptions, timers и React roots освобождаются в cleanup.
- Действие плагина появляется в dropdown `Плагины`.
- Плагин не добавляет отдельную кнопку в основной Toolbar.
- CSS использует namespace плагина.
- Плагин устанавливается как папка.
- Плагин устанавливается как `.mivraplugin`.
- После изменения bundled-плагина увеличена версия в `plugin.json`.
