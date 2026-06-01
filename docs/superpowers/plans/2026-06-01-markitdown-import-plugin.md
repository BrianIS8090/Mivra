# MarkItDown Import Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Mivra import plugin that converts DOCX, XLSX, text PDFs, TXT, MD, and CSV into Markdown, including DOCX image extraction through Mivra's S3/local assets pipeline.

**Architecture:** Extend the base `MivraPluginApi` with `assets.saveBytes(...)` and permission `assets:write`. Keep document conversion in the external plugin under `plugins/markitdown-import/`, with focused converter modules and tests. Reuse existing Tauri commands `s3UploadBytes` and `saveLocalAssetBytes` instead of adding new backend upload commands.

**Tech Stack:** Tauri 2, React 19, Zustand, Vitest, TypeScript, external Mivra plugin API v1, Mammoth.js for DOCX, SheetJS-compatible XLSX parser for spreadsheets, `pdfjs-dist` for text PDF extraction.

---

## File Map

- Modify `src/plugins/types.ts`: add `assets:write`, asset result types, and `api.assets.saveBytes`.
- Modify `src/plugins/pluginManifest.ts`: accept `assets:write` in frontend manifest normalization.
- Modify `src/plugins/mivraApi.ts`: implement `assets.saveBytes`.
- Modify `src-tauri/src/commands.rs`: accept `assets:write` in backend manifest validation.
- Modify `docs/PLUGINS.md`: document the new permission and API.
- Modify `src/test/pluginPermissions.test.ts`: add asset permission tests.
- Modify `src/test/pluginRegistry.test.ts`: add backend manifest acceptance test for `assets:write`.
- Create `src/test/pluginAssetsApi.test.ts`: cover S3/local/missing-base-dir behavior.
- Create `plugins/markitdown-import/plugin.json`: plugin manifest.
- Create `plugins/markitdown-import/src/converters/text.ts`: TXT/MD conversion.
- Create `plugins/markitdown-import/src/converters/csv.ts`: CSV to Markdown tables.
- Create `plugins/markitdown-import/src/converters/docx.ts`: DOCX to Markdown with image asset saving.
- Create `plugins/markitdown-import/src/converters/xlsx.ts`: workbook to Markdown.
- Create `plugins/markitdown-import/src/converters/pdf.ts`: text PDF to Markdown.
- Create `plugins/markitdown-import/src/index.ts`: plugin UI and conversion flow.
- Create `plugins/markitdown-import/src/style.css`: scoped dialog styles.
- Create `plugins/markitdown-import/vite.config.ts`: standalone plugin build.
- Create `plugins/markitdown-import/package.json`: plugin-local dependencies and scripts.
- Create `src/test/markitdownImportPlugin.test.ts`: plugin activation and UI behavior tests.
- Create `src/test/markitdownImportConverters.test.ts`: converter unit tests.

---

## Task 1: Add `assets:write` Permission

**Files:**
- Modify: `src/plugins/types.ts`
- Modify: `src/plugins/pluginManifest.ts`
- Modify: `src-tauri/src/commands.rs`
- Test: `src/test/pluginPermissions.test.ts`
- Test: `src/test/pluginRegistry.test.ts`

- [ ] **Step 1: Write failing frontend permission tests**

Add tests to `src/test/pluginPermissions.test.ts`:

```ts
it('запрещает сохранение asset без assets:write', async () => {
  const api = createMivraPluginApi('test-plugin', baseManifest);

  await expect(api.assets.saveBytes({
    bytes: new Uint8Array([1, 2, 3]),
    filename: 'image.png',
    kind: 'image',
  })).rejects.toThrow('permission_denied');
});

it('разрешает сохранение asset с assets:write', async () => {
  const api = createMivraPluginApi('test-plugin', {
    ...baseManifest,
    permissions: ['assets:write'],
  });

  expect(api.assets).toBeDefined();
  expect(typeof api.assets.saveBytes).toBe('function');
});
```

- [ ] **Step 2: Run permission tests and verify RED**

Run: `npm run test -- src/test/pluginPermissions.test.ts`

Expected: FAIL because `api.assets` and `assets:write` do not exist yet.

- [ ] **Step 3: Write failing manifest normalization test**

Add to `src/test/pluginRegistry.test.ts`:

```ts
it('принимает assets:write permission из backend manifest', async () => {
  const manifest = normalizePluginManifest({
    id: 'asset-plugin',
    name: 'Asset Plugin',
    version: '1.0.0',
    description: 'Stores assets',
    author: 'Mivra Team',
    entry: 'index.js',
    permissions: ['document:read', 'assets:write'],
    apiVersion: 1,
    enabled: true,
  });

  expect(manifest.permissions).toEqual(['document:read', 'assets:write']);
});
```

- [ ] **Step 4: Run registry test and verify RED**

Run: `npm run test -- src/test/pluginRegistry.test.ts`

Expected: FAIL because `assets:write` is filtered out or rejected.

- [ ] **Step 5: Implement minimal permission type changes**

In `src/plugins/types.ts`, change `PluginPermission`:

```ts
export type PluginPermission =
  | 'document:read'
  | 'document:write'
  | 'dialog'
  | 'export:html'
  | 'export:pdf'
  | 'assets:write';
```

In `src/plugins/pluginManifest.ts`, add `'assets:write'` to the supported permission list.

In `src-tauri/src/commands.rs`, update `is_supported_plugin_permission`:

```rust
matches!(
  permission,
  "document:read"
    | "document:write"
    | "dialog"
    | "export:html"
    | "export:pdf"
    | "assets:write"
)
```

- [ ] **Step 6: Run focused tests and verify GREEN for permission parsing**

Run: `npm run test -- src/test/pluginPermissions.test.ts src/test/pluginRegistry.test.ts`

Expected: permission parsing tests pass except `api.assets.saveBytes` behavior may still fail until Task 2.

- [ ] **Step 7: Commit**

```powershell
git add -- src/plugins/types.ts src/plugins/pluginManifest.ts src-tauri/src/commands.rs src/test/pluginPermissions.test.ts src/test/pluginRegistry.test.ts
git commit -m "feat: add assets write plugin permission"
```

---

## Task 2: Implement `api.assets.saveBytes`

**Files:**
- Modify: `src/plugins/types.ts`
- Modify: `src/plugins/mivraApi.ts`
- Test: `src/test/pluginAssetsApi.test.ts`

- [ ] **Step 1: Write failing S3 asset test**

Create `src/test/pluginAssetsApi.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMivraPluginApi } from '../plugins/mivraApi';
import { useAppStore } from '../stores/appStore';
import * as tauri from '../utils/tauri';
import type { PluginManifest } from '../plugins/types';

vi.mock('../utils/tauri', () => ({
  s3SecretExists: vi.fn(),
  s3UploadBytes: vi.fn(),
  saveLocalAssetBytes: vi.fn(),
}));

const manifest: PluginManifest = {
  id: 'asset-plugin',
  name: 'Asset Plugin',
  version: '1.0.0',
  description: 'Stores assets',
  author: 'Mivra Team',
  entry: 'index.js',
  permissions: ['assets:write'],
  apiVersion: 1,
};

describe('plugin assets api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      baseDir: 'C:/docs',
      s3: {
        endpoint: 'https://s3.example.com',
        region: 'auto',
        bucket: 'bucket',
        access_key_id: 'key',
        public_base_url: 'https://cdn.example.com',
        prefix: 'mivra',
      },
      s3Verified: true,
    });
  });

  it('при готовом S3 загружает bytes и возвращает markdown изображения', async () => {
    vi.mocked(tauri.s3SecretExists).mockResolvedValue(true);
    vi.mocked(tauri.s3UploadBytes).mockResolvedValue('https://cdn.example.com/mivra/image.png');

    const api = createMivraPluginApi('asset-plugin', manifest);
    const result = await api.assets.saveBytes({
      bytes: new Uint8Array([1, 2, 3]),
      filename: 'image.png',
      alt: 'Diagram',
      kind: 'image',
    });

    expect(tauri.s3UploadBytes).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), 'image.png', expect.any(Object));
    expect(result).toEqual({
      url: 'https://cdn.example.com/mivra/image.png',
      markdown: '![Diagram](https://cdn.example.com/mivra/image.png)',
      storage: 's3',
    });
  });
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `npm run test -- src/test/pluginAssetsApi.test.ts`

Expected: FAIL because `api.assets.saveBytes` is missing.

- [ ] **Step 3: Add asset API types**

In `src/plugins/types.ts`, add:

```ts
export type PluginAssetSaveInput = {
  bytes: Uint8Array;
  filename: string;
  alt?: string;
  kind?: 'image' | 'file';
};

export type PluginAssetSaveResult = {
  url: string;
  markdown: string;
  storage: 's3' | 'local';
};
```

Extend `MivraPluginApi`:

```ts
assets: {
  saveBytes: (input: PluginAssetSaveInput) => Promise<PluginAssetSaveResult>;
};
```

- [ ] **Step 4: Implement minimal S3 branch**

In `src/plugins/mivraApi.ts`, import existing store and tauri utilities are already available. Add helper functions near `createMivraPluginApi`:

```ts
function nameWithoutExt(name: string): string {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(0, index) : name;
}

function escapeMarkdownLabel(label: string): string {
  return label.replace(/[[\]\\]/g, '\\$&');
}

function assetMarkdown(filename: string, url: string, kind: 'image' | 'file' | undefined, alt?: string): string {
  const label = escapeMarkdownLabel(alt?.trim() || nameWithoutExt(filename));
  return kind === 'file' ? `[${label}](${url})` : `![${label}](${url})`;
}
```

Add `assets` to the returned API:

```ts
assets: {
  saveBytes: async (input) => {
    requirePluginPermission(manifest, 'assets:write');
    const state = useAppStore.getState();

    if (state.s3 && state.s3Verified && await tauri.s3SecretExists()) {
      const url = await tauri.s3UploadBytes(input.bytes, input.filename, state.s3);
      return {
        url,
        markdown: assetMarkdown(input.filename, url, input.kind, input.alt),
        storage: 's3',
      };
    }

    if (!state.baseDir) {
      throw new Error('asset_base_dir_missing');
    }

    const url = await tauri.saveLocalAssetBytes(input.bytes, state.baseDir, input.filename);
    return {
      url,
      markdown: assetMarkdown(input.filename, url, input.kind, input.alt),
      storage: 'local',
    };
  },
},
```

- [ ] **Step 5: Run S3 test and verify GREEN**

Run: `npm run test -- src/test/pluginAssetsApi.test.ts`

Expected: PASS for S3 branch.

- [ ] **Step 6: Add local fallback and missing baseDir tests**

Append to `src/test/pluginAssetsApi.test.ts`:

```ts
it('при неготовом S3 сохраняет bytes в локальные assets', async () => {
  useAppStore.setState({ s3: null, s3Verified: false, baseDir: 'C:/docs' });
  vi.mocked(tauri.s3SecretExists).mockResolvedValue(false);
  vi.mocked(tauri.saveLocalAssetBytes).mockResolvedValue('assets/image.png');

  const api = createMivraPluginApi('asset-plugin', manifest);
  const result = await api.assets.saveBytes({
    bytes: new Uint8Array([4, 5, 6]),
    filename: 'image.png',
    alt: 'Local',
    kind: 'image',
  });

  expect(tauri.saveLocalAssetBytes).toHaveBeenCalledWith(new Uint8Array([4, 5, 6]), 'C:/docs', 'image.png');
  expect(result).toEqual({
    url: 'assets/image.png',
    markdown: '![Local](assets/image.png)',
    storage: 'local',
  });
});

it('без S3 и baseDir возвращает asset_base_dir_missing', async () => {
  useAppStore.setState({ s3: null, s3Verified: false, baseDir: null });

  const api = createMivraPluginApi('asset-plugin', manifest);
  await expect(api.assets.saveBytes({
    bytes: new Uint8Array([1]),
    filename: 'image.png',
    kind: 'image',
  })).rejects.toThrow('asset_base_dir_missing');
});
```

- [ ] **Step 7: Run asset API tests**

Run: `npm run test -- src/test/pluginAssetsApi.test.ts src/test/pluginPermissions.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add -- src/plugins/types.ts src/plugins/mivraApi.ts src/test/pluginAssetsApi.test.ts src/test/pluginPermissions.test.ts
git commit -m "feat: expose asset saving to plugins"
```

---

## Task 3: Scaffold Import Plugin and Pure Text/CSV Converters

**Files:**
- Create: `plugins/markitdown-import/plugin.json`
- Create: `plugins/markitdown-import/src/converters/text.ts`
- Create: `plugins/markitdown-import/src/converters/csv.ts`
- Create: `plugins/markitdown-import/src/index.ts`
- Create: `plugins/markitdown-import/src/style.css`
- Create: `plugins/markitdown-import/vite.config.ts`
- Create: `plugins/markitdown-import/package.json`
- Test: `src/test/markitdownImportConverters.test.ts`
- Test: `src/test/markitdownImportPlugin.test.ts`

- [ ] **Step 1: Write failing converter tests**

Create `src/test/markitdownImportConverters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeTextMarkdown } from '../../plugins/markitdown-import/src/converters/text';
import { csvTextToMarkdown } from '../../plugins/markitdown-import/src/converters/csv';

describe('markitdown import converters', () => {
  it('normalizeTextMarkdown приводит переносы строк к LF и убирает BOM', () => {
    expect(normalizeTextMarkdown('\uFEFFA\r\nB\rC')).toBe('A\nB\nC');
  });

  it('csvTextToMarkdown формирует markdown table', () => {
    expect(csvTextToMarkdown('Name,Age\nAlice,30')).toBe('| Name | Age |\n| --- | --- |\n| Alice | 30 |');
  });
});
```

- [ ] **Step 2: Run converter tests and verify RED**

Run: `npm run test -- src/test/markitdownImportConverters.test.ts`

Expected: FAIL because plugin converter files do not exist.

- [ ] **Step 3: Implement text and CSV converters**

Create `plugins/markitdown-import/src/converters/text.ts`:

```ts
export function normalizeTextMarkdown(value: string): string {
  return value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trimEnd();
}

export async function textFileToMarkdown(file: File): Promise<string> {
  return normalizeTextMarkdown(await file.text());
}
```

Create `plugins/markitdown-import/src/converters/csv.ts`:

```ts
import { normalizeTextMarkdown } from './text';

function escapeCell(value: string): string {
  return value.trim().replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function parseSimpleCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}

export function csvTextToMarkdown(csv: string): string {
  const rows = normalizeTextMarkdown(csv)
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map(parseSimpleCsvLine);

  if (rows.length === 0) return '';

  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => Array.from({ length: width }, (_, index) => escapeCell(row[index] ?? '')));
  const [header, ...body] = normalized;
  return [
    `| ${header.join(' | ')} |`,
    `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

export async function csvFileToMarkdown(file: File): Promise<string> {
  return csvTextToMarkdown(await file.text());
}
```

- [ ] **Step 4: Run converter tests and verify GREEN**

Run: `npm run test -- src/test/markitdownImportConverters.test.ts`

Expected: PASS.

- [ ] **Step 5: Create manifest and minimal plugin entry**

Create `plugins/markitdown-import/plugin.json`:

```json
{
  "id": "markitdown-import",
  "name": "Import to Markdown",
  "version": "1.0.0",
  "description": "Конвертирует DOCX, XLSX, PDF, TXT, Markdown и CSV в Markdown и вставляет результат в документ.",
  "author": "Mivra Team",
  "entry": "index.js",
  "styles": "style.css",
  "permissions": ["document:read", "document:write", "dialog", "assets:write"],
  "apiVersion": 1
}
```

Create minimal `plugins/markitdown-import/src/index.ts` that registers a dialog and toolbar item. Follow the existing external plugin global registration shape:

```ts
window.MivraExternalPlugin.register({
  id: 'markitdown-import',
  activate(api) {
    const dialogId = 'markitdown-import-dialog';
    const disposeDialog = api.dialogs.registerRenderer(dialogId, {
      render({ container }) {
        container.innerHTML = '<section class="markitdown-import"><h2>Import to Markdown</h2><input type="file" data-file></section>';
      },
    });
    const disposeButton = api.toolbar.registerButton({
      id: 'markitdown-import-open',
      label: 'Import to Markdown',
      title: 'Импортировать файл в Markdown',
      order: 300,
      onClick: () => api.dialogs.open(dialogId),
    });

    return () => {
      disposeButton();
      disposeDialog();
    };
  },
});
```

- [ ] **Step 6: Write activation test**

Create `src/test/markitdownImportPlugin.test.ts` by following the OpenRouter plugin tests. Assert manifest permissions include `assets:write`, activation registers a dialog, and toolbar button id is `markitdown-import-open`.

- [ ] **Step 7: Run plugin tests**

Run: `npm run test -- src/test/markitdownImportPlugin.test.ts src/test/markitdownImportConverters.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add -- plugins/markitdown-import src/test/markitdownImportConverters.test.ts src/test/markitdownImportPlugin.test.ts
git commit -m "feat: scaffold markdown import plugin"
```

---

## Task 4: Add DOCX Conversion with Images

**Files:**
- Modify: `plugins/markitdown-import/package.json`
- Create: `plugins/markitdown-import/src/converters/docx.ts`
- Modify: `plugins/markitdown-import/src/index.ts`
- Test: `src/test/markitdownImportConverters.test.ts`

- [ ] **Step 1: Add plugin dependency**

In `plugins/markitdown-import/package.json`, add `mammoth` as a dependency and Vite/TypeScript as dev dependencies consistent with `plugins/export-pdf/package.json`.

- [ ] **Step 2: Write failing DOCX image handler unit test**

Add a test that calls a pure helper:

```ts
it('docxImageToMarkdown сохраняет изображение через assets api', async () => {
  const saveBytes = vi.fn().mockResolvedValue({
    url: 'assets/docx-image-1.png',
    markdown: '![Picture](assets/docx-image-1.png)',
    storage: 'local',
  });

  const markdown = await docxImageToMarkdown({
    contentType: 'image/png',
    altText: 'Picture',
    arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
    index: 1,
    assets: { saveBytes },
  });

  expect(saveBytes).toHaveBeenCalledWith({
    bytes: new Uint8Array([1, 2, 3]),
    filename: 'docx-image-1.png',
    alt: 'Picture',
    kind: 'image',
  });
  expect(markdown).toBe('![Picture](assets/docx-image-1.png)');
});
```

- [ ] **Step 3: Run test and verify RED**

Run: `npm run test -- src/test/markitdownImportConverters.test.ts`

Expected: FAIL because `docxImageToMarkdown` does not exist.

- [ ] **Step 4: Implement DOCX helper and converter**

Create `plugins/markitdown-import/src/converters/docx.ts`:

```ts
import mammoth from 'mammoth/mammoth.browser';

type AssetApi = {
  saveBytes(input: { bytes: Uint8Array; filename: string; alt?: string; kind?: 'image' | 'file' }): Promise<{ markdown: string }>;
};

function extFromContentType(contentType: string): string {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/svg+xml') return 'svg';
  return contentType.split('/')[1] || 'png';
}

export async function docxImageToMarkdown(input: {
  contentType: string;
  altText?: string;
  arrayBuffer: ArrayBuffer;
  index: number;
  assets: AssetApi;
}): Promise<string> {
  const ext = extFromContentType(input.contentType);
  const filename = `docx-image-${input.index}.${ext}`;
  const result = await input.assets.saveBytes({
    bytes: new Uint8Array(input.arrayBuffer),
    filename,
    alt: input.altText || `image ${input.index}`,
    kind: 'image',
  });
  return result.markdown;
}

export async function docxFileToMarkdown(file: File, assets: AssetApi): Promise<string> {
  let imageIndex = 0;
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer }, {
    convertImage: mammoth.images.imgElement(async (image) => {
      imageIndex += 1;
      const markdown = await docxImageToMarkdown({
        contentType: image.contentType,
        altText: image.altText,
        arrayBuffer: await image.readAsArrayBuffer(),
        index: imageIndex,
        assets,
      });
      return { src: markdown };
    }),
  });

  return htmlToMarkdown(result.value);
}
```

Also add a small `htmlToMarkdown` helper in this module or a shared converter file. It must transform `<h1>`, `<h2>`, `<p>`, `<strong>`, `<em>`, `<a>`, `<ul>/<ol>/<li>`, `<table>`, and `<img src="![alt](url)">` into Markdown.

- [ ] **Step 5: Run DOCX tests**

Run: `npm run test -- src/test/markitdownImportConverters.test.ts`

Expected: PASS for DOCX helper.

- [ ] **Step 6: Wire DOCX into plugin UI**

In `plugins/markitdown-import/src/index.ts`, choose converter by extension. For `.docx`, call `docxFileToMarkdown(file, api.assets)`.

- [ ] **Step 7: Commit**

```powershell
git add -- plugins/markitdown-import src/test/markitdownImportConverters.test.ts
git commit -m "feat: convert docx with extracted images"
```

---

## Task 5: Add XLSX and PDF Text Conversion

**Files:**
- Modify: `plugins/markitdown-import/package.json`
- Create: `plugins/markitdown-import/src/converters/xlsx.ts`
- Create: `plugins/markitdown-import/src/converters/pdf.ts`
- Modify: `plugins/markitdown-import/src/index.ts`
- Test: `src/test/markitdownImportConverters.test.ts`

- [ ] **Step 1: Add dependencies**

Add workbook parser dependency and reuse root `pdfjs-dist` version or add it to plugin package if the standalone build requires plugin-local dependency resolution.

- [ ] **Step 2: Write failing XLSX helper tests**

Add pure helper tests for converting a 2D array to Markdown:

```ts
it('sheetRowsToMarkdown формирует раздел листа с таблицей', () => {
  expect(sheetRowsToMarkdown('Лист1', [['A', 'B'], ['1', '2']]))
    .toBe('## Лист1\n\n| A | B |\n| --- | --- |\n| 1 | 2 |');
});
```

- [ ] **Step 3: Implement XLSX helper**

Create `plugins/markitdown-import/src/converters/xlsx.ts` with `sheetRowsToMarkdown(sheetName, rows)` and `xlsxFileToMarkdown(file)`.

- [ ] **Step 4: Write failing PDF text helper test**

Add a pure helper test:

```ts
it('pdfPagesToMarkdown добавляет page markers', () => {
  expect(pdfPagesToMarkdown(['First page', 'Second page']))
    .toBe('<!-- page 1 -->\n\nFirst page\n\n<!-- page 2 -->\n\nSecond page');
});
```

- [ ] **Step 5: Implement PDF helper**

Create `plugins/markitdown-import/src/converters/pdf.ts` with `pdfPagesToMarkdown(pages)` and `pdfFileToMarkdown(file)`. Use `pdfjs-dist` to load `file.arrayBuffer()`, iterate pages, call `page.getTextContent()`, join text items with spaces, and return `pdfPagesToMarkdown(pages)`.

- [ ] **Step 6: Run converter tests**

Run: `npm run test -- src/test/markitdownImportConverters.test.ts`

Expected: PASS.

- [ ] **Step 7: Wire XLSX/PDF into plugin UI**

In `plugins/markitdown-import/src/index.ts`, route `.xlsx` to `xlsxFileToMarkdown(file)` and `.pdf` to `pdfFileToMarkdown(file, api.assets)`.

- [ ] **Step 8: Commit**

```powershell
git add -- plugins/markitdown-import src/test/markitdownImportConverters.test.ts
git commit -m "feat: convert spreadsheets and text pdfs"
```

---

## Task 6: Finish Dialog UX, Docs, Build, and Verification

**Files:**
- Modify: `plugins/markitdown-import/src/index.ts`
- Modify: `plugins/markitdown-import/src/style.css`
- Modify: `docs/PLUGINS.md`
- Test: `src/test/markitdownImportPlugin.test.ts`

- [ ] **Step 1: Write failing UI behavior tests**

In `src/test/markitdownImportPlugin.test.ts`, add tests for:

- file input exists;
- unsupported extension shows error;
- successful conversion shows preview;
- apply replace calls `api.document.setContent(markdown)`;
- append mode keeps existing document content;
- heading mode adds `---` and `## Импортировано из filename`.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `npm run test -- src/test/markitdownImportPlugin.test.ts`

Expected: FAIL until dialog behavior is implemented.

- [ ] **Step 3: Implement dialog state machine**

In `plugins/markitdown-import/src/index.ts`, implement state:

```ts
type ApplyMode = 'append' | 'replace' | 'section' | 'copy';

type ImportState = {
  fileName: string;
  markdown: string;
  loading: boolean;
  error: string;
  mode: ApplyMode;
};
```

Use DOM event listeners like existing external plugins. Cleanup every listener in renderer cleanup.

- [ ] **Step 4: Implement apply modes**

Add pure helper:

```ts
export function buildAppliedMarkdown(current: string, imported: string, fileName: string, mode: ApplyMode): string {
  if (mode === 'replace') return imported;
  const trimmedCurrent = current.trimEnd();
  if (mode === 'section') {
    const block = `---\n\n## Импортировано из ${fileName}\n\n${imported}`;
    return trimmedCurrent ? `${trimmedCurrent}\n\n${block}` : block;
  }
  return trimmedCurrent ? `${trimmedCurrent}\n\n${imported}` : imported;
}
```

- [ ] **Step 5: Run UI tests and verify GREEN**

Run: `npm run test -- src/test/markitdownImportPlugin.test.ts`

Expected: PASS.

- [ ] **Step 6: Document assets API**

In `docs/PLUGINS.md`, add:

- `assets:write` to the permission list;
- `api.assets.saveBytes(...)` to `MivraPluginApi`;
- example showing `await api.assets.saveBytes({ bytes, filename: 'image.png', kind: 'image' })`.

- [ ] **Step 7: Build plugin package**

Run from repository root:

```powershell
Set-Location plugins\markitdown-import; npm install; npm run build; Compress-Archive -Path dist\* -DestinationPath ..\markitdown-import-1.0.0.mivraplugin -Force; Set-Location ..\..
```

Expected: `plugins/markitdown-import-1.0.0.mivraplugin` exists and contains `plugin.json`, `index.js`, and `style.css`.

- [ ] **Step 8: Run full verification**

Run:

```powershell
npm run test
npx tsc --noEmit
cargo test --manifest-path src-tauri\Cargo.toml
graphify update .
```

Expected: all tests pass; graphify updates AST output only.

- [ ] **Step 9: Commit**

```powershell
git add -- plugins/markitdown-import plugins/markitdown-import-1.0.0.mivraplugin docs/PLUGINS.md src/test/markitdownImportPlugin.test.ts src/test/markitdownImportConverters.test.ts
git commit -m "feat: add markdown import plugin"
```
