# Спека 2: новые фичи приложения (2026-08-18)

По запросу владельца продукта: закрываем критичные пробелы + проверка орфографии.
Общие правила прежние: TDD; комментарии на русском; отступ 2 пробела; коммитит только оркестратор;
точечные прогоны `npx vitest run <файлы>`; i18n-ключи УЖЕ добавлены оркестратором в `src/i18n/ru.ts` и
`src/i18n/en.ts` — кодеры их только используют, файлы i18n НЕ редактируют.

## F1 (волна A). Поиск и замена по документу (Ctrl+F / Ctrl+H)

Новые файлы: `src/components/Editor/editorSearch.ts` (чистое ядро поиска),
`src/components/Editor/SearchPanel.tsx` (+ `searchPanel.css`), тесты
`src/test/editorSearch.test.ts`, `src/test/SearchPanel.test.tsx`.
Разрешено менять: `src/App.tsx` (шорткаты), `src/components/Editor/Editor.tsx`,
`src/components/Editor/EditorContext.tsx` (расширение EditorHandle).

Требования:
- Ctrl+F — открыть панель поиска (preventDefault, чтобы подавить поиск браузера), фокус в поле запроса;
  Ctrl+H — открыть с развёрнутой строкой замены. Esc — закрыть. Enter — следующее, Shift+Enter — предыдущее.
- Счётчик совпадений «текущее/всего» (или t.noMatches), тоггл регистра (Aa), кнопки prev/next,
  заменить / заменить всё (строка замены).
- Visual-режим: поиск по ProseMirror-документу — обходить textblock'и через doc.descendants и маппить
  смещения в позиции PM (осторожно: textBetween вставляет '\n' на границах блоков, поэтому идём по блокам).
  Подсветка всех совпадений через плагин с DecorationSet (inline-декорации, текущее — отдельным классом),
  переход = setSelection + scrollIntoView.
- Source-режим: поиск по значению textarea, переход = setSelectionRange + focus + scroll;
  подсветки всех совпадений в textarea нет (известное ограничение, задокументировать в коде).
- ВАЖНО: программная замена в visual-режиме обязана синкаться в стор. Сейчас `markdownUpdated`
  (Editor.tsx:229-237) gated флагом `userInteractedRef`. Расширить `EditorHandle` полем
  `markUserInteracted: () => void` (Editor.tsx присваивает реализацию), вызывать перед dispatch замены.
- Замена текущего: один dispatch; замена всех: одна транзакция со всеми заменами (в обратном порядке
  смещений). После пересоздания Crepe панель обязана пересчитать совпадения (подписка на store.content).
- Ядро `editorSearch.ts` — чистые функции без DOM (findMatches(text, query, caseSensitive) → [{from,to}],
  навигация с wrap-around), полностью покрыто юнит-тестами; UI — компонентные тесты в jsdom.
- Панель НЕ ловится глобальными шорткатами (input вне .editor-container — shouldHandleGlobalShortcut
  уже фильтрует; проверить, что при фокусе в поиске Ctrl+B не мутирует документ).
- Стиль UI — в духе существующих диалогов/тулбара (классы вида search-panel-*), тёмная/светлая темы.

Приёмка: новые тесты зелёные; `npx tsc --noEmit` чист; полный `npx vitest run` зелёный.

## F3 (волна A). UI недавних файлов

Разрешено менять: `src/components/Toolbar/Toolbar.tsx`, `src/hooks/useFile.ts`,
`src/test/useFile.test.ts`, новый `src/test/recentFilesMenu.test.tsx` (или расширение Toolbar.test.tsx —
на усмотрение кодера, но без ослабления существующих тестов).

Требования:
- В Toolbar рядом с «Открыть» — кнопка «Недавние» (t.recentFiles) с выпадающим меню по паттерну
  плагин-меню (popover, закрытие по Esc и по клику вне). Список — `recentFiles` из appStore
  (макс. 10), пункт = имя файла, title = полный путь. Пусто → t.recentFilesEmpty (неактивный пункт).
- Клик по пункту: если есть несохранённые изменения — сначала `confirmUnsavedChanges` (utils/dialogs),
  затем открытие файла по пути. Для этого в `useFile` добавить `openPath(path: string)`:
  чтение через существующий `tauri.readFile`, загрузка в стор по тому же пути, что и `open()`
  (вынести общий loader, не дублируя логику baseDir/frontmatter). Ошибка чтения (файл удалён и т.п.) —
  toast с t.openRecentError, меню закрывается, список не трогаем.
- После успешного openPath — refreshRecentFiles уже есть в useFile (T4) — использовать его.

Приёмка: тесты зелёные; `npx tsc --noEmit` чист.

## F2 (волна B). Автосохранение документа

Разрешено менять: `src-tauri/src/commands.rs` (struct Settings), `src/bindings.ts` (ТОЛЬКО через
`npm run gen:types`), `src/stores/appStore.ts`, `src/hooks/useSettings.ts`, новый
`src/hooks/useAutosave.ts`, `src/App.tsx`, `src/components/Toolbar/Toolbar.tsx`,
`src/test/useAutosave.test.ts` (новый), `src/test/useSettings.test.ts`.

Требования:
- Rust: в `Settings` добавить `#[serde(default)] pub autosave: bool` (default false), регена bindings.
- Стор: поле `autosave` + маппинг в updateSettings; persist (useSettings) включает autosave.
- Новый хук `useAutosave` (монтируется один раз в App): следит за content/isDirty/filePath/autosave;
  дебаунс 2 секунды после последнего изменения; сохраняет ТОЛЬКО если autosave включён, isDirty=true и
  filePath != null (неназванный документ не автосохраняем). Сохранение через существующий tauri.saveFile.
  Ошибка — toast t.autosaveError, без спама: повторный тост только после следующей успешной записи
  или следующего изменения контента.
- Toolbar: тоггл «Автосохранение» (t.autosave / t.autosaveTooltip) в группе тема/режим,
  визуальное состояние вкл/выкл.
- Тесты с fake timers: дебаунс, отказ при выкл/без пути/без изменений, одна ошибка — один тост.
- Rust: тест, что autosave отсутствует в старом settings.json → false (serde default), roundtrip.

Приёмка: тесты зелёные; `cargo test` зелёный; bindings свежие; `npx tsc --noEmit` чист.

## F4 (волна B). Проверка орфографии

Разрешено менять: `src/components/Editor/Editor.tsx`, `index.html` (lang при необходимости),
`src/test/spellcheck.test.tsx` (новый). Факт из рекона: в tauri 2.10.3 нет опции spellcheck в
конфиге окна — WebView2 держит IsSpellCheckEnabled=true по умолчанию, поэтому делаем явные атрибуты.

Требования:
- Source-textarea: `spellCheck` + `lang` (из настроек language: ru→'ru', en→'en').
- Visual (Crepe/ProseMirror): после create/пересоздания выставлять атрибуты `spellcheck="true"` и `lang`
  на элементе `.ProseMirror` (через тот же путь, что и прочие post-create эффекты в Editor).
- Тесты: jsdom — атрибуты на textarea; для visual — реальный Milkdown в jsdom по образцу
  src/test/crepeKeymap.test.ts: после инициализации редактора атрибуты выставлены.
- Известное ограничение (задокументировать комментарием): подсказки вариантов исправления живут в
  нативном контекстном меню WebView2, которое в Tauri отключено — будут только подчёркивания.

Приёмка: тесты зелёные; `npx tsc --noEmit` чист. Живую проверку атрибутов в настоящем приложении
(CDP) делает оркестратор на финальной приёмке.

## Финальная приёмка (оркестратор)
Полные прогоны (vitest, cargo test, clippy, tsc, build, gen:types diff), e2e Playwright
desktop+mobile против продакшн-сборки (в т.ч. живая проверка панели поиска и атрибутов spellcheck),
сверка с этой спекой, коммиты по одному на фичу.
