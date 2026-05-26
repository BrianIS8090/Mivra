import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildPdfDocumentDefinition } from '../../plugins/export-pdf/src/pdfDefinition';
import { createPdfBytes } from '../../plugins/export-pdf/src/pdfMakeClient';
import { modernPreset } from '../../plugins/export-pdf/src/presets';

describe('createPdfBytes', () => {
  it('создаёт PDF-байты через pdfmake', async () => {
    const definition = buildPdfDocumentDefinition('# 🧠 PDF\n\n## 🎯 Цель\n\nТекст', {
      ...modernPreset,
      titlePage: {
        ...modernPreset.titlePage,
        enabled: false,
      },
    }, { filePath: 'C:/docs/pdf.md' });

    const bytes = await createPdfBytes(definition);
    const header = new TextDecoder().decode(bytes.slice(0, 4));

    expect(header).toBe('%PDF');
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it('создаёт PDF с SVG-иконками в элементах списка', async () => {
    const definition = buildPdfDocumentDefinition(
      '# 🚀 What Is This?\n\n- 🎯 **Specialized:** Deep expertise\n- 🧠 **Personality-Driven:** Unique voice\n- 📋 **Deliverable-Focused:** Real code\n- ✅ **Production-Ready:** Battle-tested',
      {
        ...modernPreset,
        titlePage: {
          ...modernPreset.titlePage,
          enabled: false,
        },
      },
      { filePath: 'C:/docs/icons.md' },
    );

    const bytes = await createPdfBytes(definition);
    const header = new TextDecoder().decode(bytes.slice(0, 4));

    expect(header).toBe('%PDF');
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it('читает встроенные шрифты через plugin asset reader, если asset fetch возвращает 404', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));
    const readPluginAssetBytes = vi.fn(async (url: string) => {
      const fontName = url.split('/').pop()?.split('?')[0] ?? '';
      const fontBytes = await readFile(
        join(process.cwd(), 'node_modules', 'dejavu-fonts-ttf', 'ttf', fontName),
      );

      return new Uint8Array(fontBytes);
    });

    window.__mivraReadPluginAssetBytes = readPluginAssetBytes;

    try {
      const definition = buildPdfDocumentDefinition(
        '# PDF\n\nТекст с кириллицей',
        {
          ...modernPreset,
          titlePage: {
            ...modernPreset.titlePage,
            enabled: false,
          },
          typography: {
            ...modernPreset.typography,
            bodyFont: 'DejaVu Sans',
            headingFont: 'DejaVu Sans',
          },
        },
        { filePath: 'C:/docs/font.md' },
      );

      const bytes = await createPdfBytes(definition);
      const header = new TextDecoder().decode(bytes.slice(0, 4));

      expect(header).toBe('%PDF');
      expect(bytes.length).toBeGreaterThan(1000);
      expect(readPluginAssetBytes).toHaveBeenCalledTimes(4);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      delete window.__mivraReadPluginAssetBytes;
      fetchMock.mockRestore();
    }
  });

  it('создаёт PDF с моноширинным кодом и псевдографикой', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const fontName = String(url).split('/').pop()?.split('?')[0] ?? '';
      const fontBytes = await readFile(
        join(process.cwd(), 'node_modules', 'dejavu-fonts-ttf', 'ttf', fontName),
      );
      const body = fontBytes.buffer.slice(
        fontBytes.byteOffset,
        fontBytes.byteOffset + fontBytes.byteLength,
      ) as ArrayBuffer;

      return new Response(body, { status: 200 });
    });

    try {
      const definition = buildPdfDocumentDefinition(
        '```text\nsales-trainer.skill/\n  ├── SKILL.md        # Основное руководство\n  └── references/     # Материалы\n```',
        {
          ...modernPreset,
          titlePage: {
            ...modernPreset.titlePage,
            enabled: false,
          },
        },
        { filePath: 'C:/docs/code.md' },
      );

      const bytes = await createPdfBytes(definition);
      const header = new TextDecoder().decode(bytes.slice(0, 4));

      expect(header).toBe('%PDF');
      expect(bytes.length).toBeGreaterThan(1000);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('создаёт PDF с выбранным встроенным шрифтом', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const fontName = String(url).split('/').pop()?.split('?')[0] ?? '';
      const fontBytes = await readFile(
        join(process.cwd(), 'node_modules', 'dejavu-fonts-ttf', 'ttf', fontName),
      );
      const body = fontBytes.buffer.slice(
        fontBytes.byteOffset,
        fontBytes.byteOffset + fontBytes.byteLength,
      ) as ArrayBuffer;

      return new Response(body, { status: 200 });
    });

    try {
      const definition = buildPdfDocumentDefinition(
        '# PDF\n\nТекст с кириллицей',
        {
          ...modernPreset,
          titlePage: {
            ...modernPreset.titlePage,
            enabled: false,
          },
          typography: {
            ...modernPreset.typography,
            bodyFont: 'DejaVu Serif',
            headingFont: 'DejaVu Serif',
          },
        },
        { filePath: 'C:/docs/font.md' },
      );

      const bytes = await createPdfBytes(definition);
      const header = new TextDecoder().decode(bytes.slice(0, 4));
      const fetchedFonts = fetchMock.mock.calls.map(([url]) => String(url));

      expect(header).toBe('%PDF');
      expect(bytes.length).toBeGreaterThan(1000);
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(fetchedFonts.some((font) => font.includes('DejaVuSerif.ttf'))).toBe(true);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('создаёт PDF для Markdown-таблицы с неполными строками', async () => {
    const definition = buildPdfDocumentDefinition(
      '| A | B | C |\n| --- | --- | --- |\n| 1 | 2 |\n| 3 | 4 | 5 |',
      {
        ...modernPreset,
        titlePage: {
          ...modernPreset.titlePage,
          enabled: false,
        },
      },
      { filePath: 'C:/docs/table.md' },
    );

    const bytes = await createPdfBytes(definition);
    const header = new TextDecoder().decode(bytes.slice(0, 4));

    expect(header).toBe('%PDF');
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
