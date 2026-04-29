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
  components/   # Editor, StatusBar, TitleBar, Toolbar
  hooks/        # useFile, useSettings, useTheme
  stores/       # appStore.ts (Zustand)
  types/        # index.ts — все TS-интерфейсы (синхронизировать с Rust-структурами)
  utils/        # tauri.ts — обёртки над всеми вызовами IPC
  themes/       # variables.css + light/dark
  test/         # setup.ts с моками Tauri API
src-tauri/src/
  lib.rs, main.rs, commands.rs   # точки входа и Tauri-команды
```

## Критические правила

- **Все Tauri IPC-вызовы — только через `src/utils/tauri.ts`**, не использовать `invoke` напрямую из компонентов.
- **Zustand: только селекторы** (`useAppStore((s) => s.content)`), не деструктурировать весь стор в компонентах.
- **Типы централизованы в `src/types/index.ts`** и синхронизированы с Rust-структурами в `src-tauri/src/commands.rs`.
- **Комментарии и пользовательские сообщения об ошибках — на русском.**
- **Версия выпуска обновляется одновременно в трёх файлах:** `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (см. `RELEASE.md`).
- **Окружение: Windows + bash/PowerShell.** В PowerShell нет `&&` (использовать `;`), избегать многострочных heredoc в bash.

## Связанные документы

- `AGENTS.md` — полные конвенции по стилю кода, импортам, тестам.
- `DEVELOPMENT.md` — установка, требования, особенности реализации.
- `RELEASE.md` — процесс выпуска версий и CI.

---

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Mivra** (328 symbols, 761 relationships, 22 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
