# AGENTS.md — Руководство для AI-агентов

## Описание проекта

**Mivra** — Markdown-редактор для Windows 11, построенный на Tauri 2 (Rust backend + React/TypeScript frontend). Использует Milkdown Crepe для визуального редактирования и Zustand для управления состоянием.

---

## Команды сборки, проверки и тестирования

### Frontend (TypeScript/React)

```bash
npm run dev          # Запуск в режиме разработки (Vite + Tauri)
npm run build        # Сборка production (tsc && vite build)
npm run preview      # Просмотр production-сборки
npm run test         # Запуск всех тестов (vitest run)
npm run test:watch   # Тесты в режиме наблюдения
npx vitest run src/test/appStore.test.ts     # Запуск одного тестового файла
npx vitest run --reporter=verbose             # Подробный вывод
npm run tauri dev    # Запуск Tauri в режиме разработки
npm run tauri build  # Сборка Tauri-приложения
```

### Backend (Rust)

```bash
cd src-tauri
cargo build          # Сборка
cargo check          # Быстрая проверка типов
cargo clippy         # Линтер
cargo test           # Запуск тестов
cargo test --test <name>  # Запуск конкретного теста
```

### Проверка типов

```bash
npx tsc --noEmit     # Проверка TypeScript
```

---

## Архитектура проекта

```
src/
├── components/          # React-компоненты (по папкам)
│   ├── Editor/          # Milkdown Crepe редактор
│   ├── StatusBar/       # Статус-бар (слова, символы)
│   ├── TitleBar/        # Заголовок окна
│   └── Toolbar/         # Панель инструментов
├── hooks/               # Кастомные хуки
│   ├── useFile.ts       # Операции с файлами
│   ├── useSettings.ts   # Настройки приложения
│   └── useTheme.ts      # Переключение темы
├── stores/              # Zustand store
│   └── appStore.ts      # Глобальное состояние
├── types/               # TypeScript типы
│   └── index.ts         # Все интерфейсы
├── utils/               # Утилиты
│   └── tauri.ts         # Обёртки над Tauri IPC
├── test/                # Тесты
│   └── setup.ts         # Моки для Tauri API
└── themes/              # CSS-темы (light/dark/variables)

src-tauri/src/
├── lib.rs               # Точка входа Tauri
├── main.rs              # Main
└── commands.rs          # Tauri IPC команды
```

---

## Стиль кода: TypeScript/React

### Импорты

```typescript
// 1. React и внешние библиотеки
import { useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

// 2. Внутренние модули (относительные пути)
import { useAppStore } from '../stores/appStore';
import type { Settings } from '../types';

// 3. CSS
import './component.css';
```

### Типизация

- Использовать `type` для типов объектов, `interface` для расширяемых сущностей
- Явные типы для параметров функций и возвращаемых значений
- Использовать `Partial<T>` для опциональных обновлений
- Избегать `any`, использовать `unknown` при необходимости

```typescript
// Хорошо
export function useFile(): {
  open: () => Promise<void>;
  save: () => Promise<void>;
} { ... }

// Типы в отдельном файле src/types/index.ts
export type EditorMode = 'visual' | 'source';
```

### Компоненты

- Функциональные компоненты с именованными экспортами
- Хуки в начале компонента
- Рефы для доступа к DOM и стабильных колбэков

```typescript
export function Editor() {
  const content = useAppStore((s) => s.content);
  const setContent = useAppStore((s) => s.setContent);
  const editorRef = useRef<HTMLDivElement>(null);

  const handleChange = useCallback((value: string) => {
    setContentRef.current(value);
  }, []);

  return ( ... );
}
```

### Состояние (Zustand)

- Использовать селекторы для оптимизации ре-рендеров
- Именование: `use + сущность + Store`

```typescript
// Селектор
const content = useAppStore((s) => s.content);

// Деструктуризация для нескольких значений
const { filePath, content, setContent } = useAppStore();
```

### Обработка ошибок

- try/catch для async операций
- Пользовательские сообщения на русском

```typescript
try {
  await tauri.saveFile(path, content);
} catch (e) {
  console.error('Ошибка сохранения:', e);
}
```

---

## Стиль кода: Rust

### Структура команд

```rust
#[tauri::command]
pub async fn open_file(app: tauri::AppHandle) -> Result<FileData, String> {
  // ...
}
```

### Сериализация

- `#[derive(Serialize, Deserialize)]` для структур
- `#[serde(default = "fn_name")]` для значений по умолчанию

### Обработка ошибок

- Возвращать `Result<T, String>` с русскими сообщениями об ошибках
- Использовать `.map_err(|e| format!("Описание: {}", e))?`

---

## Стиль кода: CSS

- Отдельный CSS-файл для каждого компонента
- CSS-переменные в `themes/variables.css`
- Классы в kebab-case: `.statusbar-item`

---

## Тестирование

### Настройка

- Vitest с jsdom и globals
- Setup файл: `src/test/setup.ts` (моки Tauri API)

### Структура теста

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('ComponentName', () => {
  beforeEach(() => {
    // Сброс состояния
    useAppStore.setState({ ... });
  });

  it('должен ...', () => {
    // Arrange, Act, Assert
    render(<Component />);
    expect(screen.getByText('text')).toBeInTheDocument();
  });
});
```

### Мокирование

```typescript
// В setup.ts
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));
```

---

## Комментарии

- Комментарии в коде писать **на русском языке**
- Пояснять нетривиальную логику

---

## Важные паттерны

1. **Tauri IPC**: все вызовы через обёртки в `utils/tauri.ts`
2. **Store**: Zustand с селекторами, не деструктурировать весь store в компонентах
3. **Хуки**: кастомные хуки для инкапсуляции логики (useFile, useSettings)
4. **Типы**: централизованно в `types/index.ts`, синхронизировать с Rust структурами
5. **Горячие клавиши**: обрабатываются в `App.tsx` через `useEffect` + `addEventListener`

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Mivra** (330 symbols, 756 relationships, 22 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
