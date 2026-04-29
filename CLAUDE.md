# Mivra

Markdown-редактор для Windows (Tauri 2 + Rust backend, React 19 + TypeScript frontend, Milkdown Crepe для визуального редактирования, Zustand для состояния). Пользовательский язык — **русский**: общение, UI-сообщения и комментарии в коде на русском.

## Команды

```bash
npm run dev          # dev-режим (Vite)
npm run tauri dev    # dev-режим всего приложения (Vite + Rust)
npm run build        # production-сборка фронтенда (tsc && vite build)
npm run tauri build  # production-сборка установщика → src-tauri/target/release/bundle/
npm run test         # vitest run
npm run test:watch   # vitest в watch-режиме
npx tsc --noEmit     # проверка типов TS
```

Rust-часть (`cd src-tauri`): `cargo check`, `cargo clippy`, `cargo test`.

## Структура

```
src/
  components/   # Editor, StatusBar, TitleBar, Toolbar, S3Settings, Toast, Dialog, Help
  hooks/        # useFile, useSettings, useTheme, useS3Upload, useToast,
                # useMarkdownActions, useExit
  stores/       # appStore.ts + toastStore.ts (Zustand)
  types/        # index.ts — UI-типы; реэкспорт сгенерированных Settings/S3Config
  utils/        # tauri.ts — обёртки над bindings; mermaid.ts; paths.ts; dialogs.ts
  themes/       # variables.css + light/dark
  test/         # setup.ts с моками Tauri API
  bindings.ts   # АВТО-генерация specta — НЕ ПРАВИТЬ РУКАМИ
src-tauri/src/
  lib.rs, main.rs, commands.rs   # точки входа и Tauri-команды
  s3.rs                          # S3-загрузка: sanitize, build_key, upload, keyring
  bin/export_bindings.rs         # генератор bindings.ts (npm run gen:types)
```

## Критические правила

- **Все Tauri IPC-вызовы — только через `src/utils/tauri.ts`**, не использовать `invoke` напрямую из компонентов.
- **Zustand: только селекторы** (`useAppStore((s) => s.content)`), не деструктурировать весь стор в компонентах.
- **Типы централизованы в `src/types/index.ts`** и синхронизированы с Rust-структурами в `src-tauri/src/commands.rs`.
- **Комментарии и пользовательские сообщения об ошибках — на русском.**
- **Версия выпуска обновляется одновременно в трёх файлах:** `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (см. `RELEASE.md`).
- **Окружение: Windows + bash/PowerShell.** В PowerShell нет `&&` (использовать `;`), избегать многострочных heredoc в bash.

## S3-загрузка (фича)

Mivra умеет грузить файлы в S3-совместимое облако (Yandex, TimeWeb, AWS, R2 и т. п.). Архитектура и точки входа:

- **Rust-сторона:** `src-tauri/src/s3.rs` — модуль с `S3Config`, `sanitize_filename`, `build_key`, `derive_public_url`, keyring (`set_secret`/`get_secret`/`delete_secret`/`secret_exists`), `upload_bytes_with_secret`, `upload_file_with_secret`, `test_connection_with_secret`. Использует `rust-s3` (с features `tokio-rustls-tls` + `with_path_style()` для не-AWS), `keyring` (нужны features `windows-native`/`apple-native`/`linux-native-sync-persistent`/`crypto-rust` — без них fallback на mock backend), `uuid`, `mime_guess`. Retry x3 (1s/2s/4s) для network/5xx, без retry на 4xx.
- **IPC-команды** (`src-tauri/src/commands.rs`): `s3_set_secret`, `s3_clear_secret`, `s3_secret_exists`, `s3_test_connection`, `s3_upload_file`, `s3_upload_bytes`, `save_local_asset_file`, `save_local_asset_bytes`. Secret НИКОГДА не возвращается на фронт — только через keyring. Local-asset команды копируют в `{baseDir}/assets/` с дедупликацией имён через helper `unique_filename` и возвращают относительный путь для markdown.
- **Settings:** `Settings.s3: Option<S3Config>` + `Settings.s3_verified: bool` (зелёная подсветка кнопки в Toolbar). `s3_verified` сбрасывается при изменении любого поля конфига (`setS3Config` в `appStore`).
- **Frontend:**
  - `src/hooks/useS3Upload.ts` — основной хук с `ready` = `s3 != null && secretExists && s3Verified`. Без verified мы НЕ пытаемся грузить — это предотвращает ошибки в середине операции при невалидных настройках. `uploadAndInsertBytes` (paste/clipboard), `uploadAndInsertFile` (drag&drop/file picker). Whitelist: картинки + pdf/zip/mp4/webm. Hard-limit 100 MB, soft-warn confirm на >10 MB.
  - `src/components/S3Settings/S3SettingsDialog.tsx` — форма настроек, открывается из Toolbar.
  - `src/components/Editor/Editor.tsx` — drag&drop через `getCurrentWindow().onDragDropEvent`, paste через `document.addEventListener('paste', ..., true)` (capture-phase, до Crepe). Оба триггера ВСЕГДА подписываются (не только при `s3.ready`) и решают по `s3.ready`: облако или локальный `assets/` через `tauri.saveLocalAssetFile/Bytes`. Если документ не сохранён (нет `baseDir`) — toast info «Сохраните документ».
  - `src/hooks/useMarkdownActions.ts` — `insertAssetAction` ветвится: если S3 ready → file dialog → upload, иначе → старый `pickAndFormatAsset` (локальный assets/).
  - `src/components/Toast/` — Toast-инфраструктура для прогресс-индикации.
- **Capabilities:** `fs:allow-stat` нужен для drag&drop (читаем размер файла перед upload). `fs:allow-exists` уже был. CSP не трогаем — S3-запросы идут из Rust, не из webview.
- **Документация для пользователей:** `docs/S3.md` — маппинг ключей провайдеров (Yandex/TimeWeb/AWS), как настроить публичный bucket, troubleshooting.

**При изменении Rust-структур** (Settings, S3Config, новые команды) обязательно `npm run gen:types` — bindings.ts регенерируется, TS-ошибки точно покажут затронутые места.

## Связанные документы

- `AGENTS.md` — полные конвенции по стилю кода, импортам, тестам.
- `DEVELOPMENT.md` — установка, требования, особенности реализации.
- `RELEASE.md` — процесс выпуска версий и CI.
- `docs/S3.md` — гид по настройке S3-загрузки для пользователей.

---

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Mivra** (344 symbols, 797 relationships, 24 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/Mivra/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Mivra/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Mivra/clusters` | All functional areas |
| `gitnexus://repo/Mivra/processes` | All execution flows |
| `gitnexus://repo/Mivra/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
