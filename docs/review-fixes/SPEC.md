# Спека: исправления по итогам ревью роем (2026-08-18)

Источник: сводное ревью 13 агентов. Общие правила для всех тикетов:
- TDD: сначала падающий тест, потом реализация.
- Комментарии в коде — на русском, отступ 2 пробела, стиль соседних файлов.
- Кодеры не коммитят; коммиты делает только оркестратор (conventional commits, как в истории).
- Проверка фронтенда: `npx vitest run <файлы>` из корня. Rust: `cargo test` / `cargo check` в `src-tauri`.

## T1. Защита fenced code blocks в нормализации markdown
Файлы: `src/components/Editor/sourceMarkdown.ts`, `src/test/sourceMarkdown.test.ts`.
Проблема: `normalizeMarkdownForSource` / `denormalizeMarkdownForEditor` применяют regex ко всему тексту, включая тела fenced-блоков (``` и ~~~): `<br />` внутри кода вырезается/вставляется — молчаливая порча данных пользователя.
Требование: содержимое fenced-блоков байт-в-байт сохраняется при round-trip в обе стороны; поведение вне блоков не меняется (существующие тесты зелёные).
Приёмка: новые тесты (python-блок с пустыми строками, html-блок с `<br />`, mermaid с пустыми строками, round-trip) + весь файл тестов зелёный.

## T3. Удаление мёртвых fs-разрешений
Файлы: `src-tauri/capabilities/default.json`.
Убрать `fs:allow-read-text-file` и `fs:allow-write-text-file` (разрешения без scope, не используются фронтендом — только `exists`/`stat`).
Приёмка: `cargo check` в `src-tauri` зелёный; grep подтверждает, что `readTextFile`/`writeTextFile` не используются в src.

## T5. Защита от усечённого перевода (openrouter-translate)
Файлы: `plugins/openrouter-translate/index.js`, `src/test/openRouterTranslatePlugin.test.ts`.
Проблема: `max_completion_tokens: 4000`, `finish_reason === 'length'` не проверяется — обрезанный перевод молча затирает весь документ.
Требование: после ответа API проверять `choices[0].finish_reason` и `native_finish_reason`; при `'length'` — явное предупреждение «перевод обрезан» и блокировка применения результата (кнопка применения недоступна).
Приёмка: новые тесты (усечённый ответ блокируется, полный применяется) зелёные.

## T7. Глобальный keydown-хендлер App
Файлы: `src/App.tsx`, при необходимости минимально `src/components/Editor/Editor.tsx` (идентификатор source-textarea), новый тест `src/test/App.test.tsx` (или выделение предиката в utils + его тест).
Проблемы: (а) нет проверки `e.defaultPrevented` — двойная обработка Ctrl+B/I с keymap Milkdown, нельзя снять жирный; (б) нет проверки `e.target` — шорткаты срабатывают из полей ввода диалогов и мутируют документ.
Требование: первой строкой `if (e.defaultPrevented) return;`; игнорировать события из `input/textarea/select/contenteditable` вне редактора; source-textarea редактора должна продолжать работать (идентифицировать через data-атрибут/класс).
Приёмка: тесты на оба случая зелёные, существующие тесты не сломаны.

## T8. cargo test в CI + тесты useExit
Файлы: `.github/workflows/ci.yml`, `src/test/setup.ts`, новый `src/test/useExit.test.ts`.
- CI: шаг `cargo test` (working-directory: src-tauri) после `Cargo check`, перед clippy.
- setup.ts: в мок окна добавить `onCloseRequested: vi.fn(async () => vi.fn())` и `destroy: vi.fn()`; в мок `@tauri-apps/plugin-fs` добавить `stat: vi.fn()`.
- Тесты useExit: закрытие без изменений → return без preventDefault/destroy (окно закрывает система; destroy нужен только после отменённого закрытия); с изменениями → диалог; ветки save / saveAs / discard / cancel.
Приёмка: `npx vitest run src/test/useExit.test.ts` зелёный, весь `npm test` зелёный.

## T4 (волна 2a). Надёжность settings.json + атомарное сохранение документов
Файлы: `src-tauri/src/commands.rs`, `src/hooks/useSettings.ts`, `src/hooks/useFile.ts` (точечно), `src/test/useSettings.test.ts`, Rust unit-тесты в commands.rs.
- Rust: при повреждении `settings.json` не затирать дефолтом молча — сохранять копию в `settings.corrupt.bak`, затем работать с дефолтом; unit-тест.
- Rust: `write_settings` сохраняет `recent_files` из файла на диске (поле принадлежит Rust), а не берёт из payload — закрывает гонку read-modify-write и ловушку частичной записи; unit-тест.
- Rust: `save_file` / `save_file_as` пишут через существующий `atomic_write`; unit-тесты.
- Frontend: автосейв настроек не стартует до завершения первичной загрузки (флаг loaded); логика загрузки/персиста исполняется один раз (не дублируется в App и Toolbar); после open/saveAs стор обновляет `recentFiles` через `getRecentFiles`.
Приёмка: новые Rust и TS тесты зелёные; `cargo test` в src-tauri зелёный.

## T6 (волна 2b). Тест S3-соединения без записи секрета + гонки диалога
Файлы: `src-tauri/src/commands.rs`, `src-tauri/src/s3.rs` (если нужно), `src/bindings.ts` (регенерация через `npm run gen:types`), `src/utils/tauri.ts`, `src/components/S3Settings/S3SettingsDialog.tsx`, новый `src/test/S3SettingsDialog.test.tsx`.
- Rust: `s3_test_connection` принимает опциональный `secret: Option<String>` — при наличии тестирует его (уже есть `s3::test_connection_with_secret`), не трогая keyring.
- Frontend: «Тест» передаёт введённый секрет напрямую; запись в keyring — только по «Сохранить».
- Гонки: поля и кнопки блокируются на время теста; позднее завершение теста после закрытия/изменения формы не взводит `testedOk` (cancelled-флаг/снапшот конфига).
Приёмка: тесты диалога зелёные; `cargo test` зелёный; `git diff src/bindings.ts` пуст после gen:types.

## T2 (волна 3). Обновление уязвимых зависимостей
Файлы: `package.json`, `package-lock.json`, `plugins/markitdown-import/package.json` (+ lock при наличии), возможно код использования (`src/utils/mermaid.ts`, `plugins/export-pdf/src/PdfPreviewPages.tsx`, `plugins/markitdown-import/src/converters/pdf.ts`).
- `pdfjs-dist` → `^6.2.108` (закрывает arbitrary JS execution); проверить совместимость API, поправить код при необходимости.
- `mermaid` → `^11.16.1` или новее (тянет свежий dompurify).
- `xlsx` → tarball с cdn.sheetjs.com (актуальный 0.20.x) в корне и в плагине; если установка с CDN невозможна — задокументировать и предложить альтернативу.
- `vite` → актуальный 7.x (≥7.3.4), `vitest` → `^4.1.0` или новее, совместимо с `@vitejs/plugin-react`.
- `lodash-es`: проверить реально существующие версии/адвизори; если пропатченной версии не существует — НЕ выдумывать, зафиксировать обоснование в отчёте.
Приёмка: `npm install` чисто, `npm test` зелёный, `npm run build` зелёный (включая сборку плагинов), `npx tsc --noEmit` зелёный.

## Финальная приёмка (оркестратор)
1. Полные прогоны: `npm test`, `cargo test` + `cargo clippy -- -D warnings` в src-tauri, `npx tsc --noEmit`, `npm run build`, `npm run gen:types` + пустой diff bindings.
2. e2e через Playwright: продакшн-сборка (`vite preview`), desktop- и mobile-вьюпорты: приложение открывается, редактор рендерится, базовое взаимодействие работает.
3. Сверка каждого тикета с критериями этой спеки.
