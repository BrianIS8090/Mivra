import { describe, expect, it } from 'vitest';
import { modernPreset } from '../../plugins/export-pdf/src/presets';
import { buildPdfDocumentDefinition, estimatePreviewPages } from '../../plugins/export-pdf/src/pdfDefinition';

describe('Export PDF document definition', () => {
  it('создаёт pdfmake-описание с размером страницы, полями и markdown-элементами', () => {
    const definition = buildPdfDocumentDefinition(
      '# Раздел\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```ts\nconst a = 1;\n```\n\n![Alt](data:image/png;base64,AAA=)',
      modernPreset,
      { filePath: 'C:/docs/report.md' },
    );

    expect(definition.pageSize).toBe('A4');
    expect(definition.pageOrientation).toBe('portrait');
    expect(definition.pageMargins).toEqual(expect.arrayContaining([
      expect.any(Number),
    ]));
    expect(JSON.stringify(definition.content)).toContain('table');
    expect(JSON.stringify(definition.content)).toContain('const a = 1');
    expect(JSON.stringify(definition.content)).toContain('Рисунок 1: Alt');
  });

  it('оценивает несколько листов при разрыве перед H1', () => {
    const pages = estimatePreviewPages('# Первый\n\nТекст\n\n# Второй\n\nТекст', {
      ...modernPreset,
      titlePage: {
        ...modernPreset.titlePage,
        enabled: false,
      },
    });

    expect(pages).toBeGreaterThan(1);
  });

  it('рендерит ведущие emoji-иконки заголовков как SVG, а не как текстовые glyph', () => {
    const definition = buildPdfDocumentDefinition(
      '# 🧠 Your Identity & Memory\n\n## 🎯 Your Core Mission',
      {
        ...modernPreset,
        titlePage: {
          ...modernPreset.titlePage,
          enabled: false,
        },
      },
      { filePath: null },
    );

    const content = definition.content as unknown[];
    const firstHeading = content[0] as { columns?: unknown[] };
    const secondHeading = content[1] as { columns?: unknown[] };
    const serialized = JSON.stringify(definition.content);

    expect(firstHeading.columns).toBeDefined();
    expect(secondHeading.columns).toBeDefined();
    expect(serialized).toContain('"svg"');
    expect(serialized).toContain('Your Identity & Memory');
    expect(serialized).toContain('Your Core Mission');
    expect(serialized).not.toContain('🧠');
    expect(serialized).not.toContain('🎯');
  });

  it('рендерит ведущие emoji-иконки элементов списка как SVG, а не как текстовые glyph', () => {
    const definition = buildPdfDocumentDefinition(
      '- 🎯 **Specialized:** Deep expertise\n- 🧠 **Personality-Driven:** Unique voice\n- 📋 **Deliverable-Focused:** Real code\n- ✅ **Production-Ready:** Battle-tested',
      {
        ...modernPreset,
        titlePage: {
          ...modernPreset.titlePage,
          enabled: false,
        },
      },
      { filePath: null },
    );

    const serialized = JSON.stringify(definition.content);

    expect(serialized).toContain('"svg"');
    expect(serialized).toContain('Specialized');
    expect(serialized).toContain('Personality-Driven');
    expect(serialized).toContain('Deliverable-Focused');
    expect(serialized).toContain('Production-Ready');
    expect(serialized).not.toContain('🎯');
    expect(serialized).not.toContain('🧠');
    expect(serialized).not.toContain('📋');
    expect(serialized).not.toContain('✅');
  });

  it('рендерит блоки кода моноширинно с номерами строк и сохранением псевдографики', () => {
    const definition = buildPdfDocumentDefinition(
      '```text\nsales-trainer.skill/\n  ├── SKILL.md        # Основное руководство\n  └── references/     # Материалы\n```',
      {
        ...modernPreset,
        titlePage: {
          ...modernPreset.titlePage,
          enabled: false,
        },
      },
      { filePath: null },
    );

    const serialized = JSON.stringify(definition.content);

    expect(serialized).toContain('"font":"MivraCode"');
    expect(serialized).toContain('"preserveLeadingSpaces":true');
    expect(serialized).toContain('"text":"1"');
    expect(serialized).toContain('├── SKILL.md');
    expect(serialized).toContain('└── references/');
  });

  it('применяет масштаб таблиц к ширине, шрифту и внутренним отступам', () => {
    const definition = buildPdfDocumentDefinition(
      '| Группа | Роль в проекте | Боли | Потребности |\n| --- | --- | --- | --- |\n| Архитекторы | Создают концепцию освещения | Сложные технические решения | Техническая экспертиза |',
      {
        ...modernPreset,
        titlePage: {
          ...modernPreset.titlePage,
          enabled: false,
        },
        markdown: {
          ...modernPreset.markdown,
          tables: {
            ...modernPreset.markdown.tables,
            scalePercent: 70,
          },
        },
      },
      { filePath: null },
    );

    const serialized = JSON.stringify(definition.content);

    expect(serialized).toContain('"widths":[86.32,86.32,86.32,86.32]');
    expect(serialized).toContain('"fontSize":8.4');
    expect(serialized).toContain('"margin":[4.2,2.1,4.2,2.1]');
  });

  it('применяет выбранный PDF-шрифт к основному тексту и заголовкам', () => {
    const definition = buildPdfDocumentDefinition(
      '# Заголовок\n\nОсновной текст',
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
      { filePath: null },
    );

    const content = definition.content as Array<{ font?: string }>;

    expect(definition.defaultStyle?.font).toBe('DejaVu Serif');
    expect(content[0].font).toBe('DejaVu Serif');
    expect(content[1].font).toBe('DejaVu Serif');
    expect(definition.styles?.title).toMatchObject({ font: 'DejaVu Serif' });
  });

  it('сохраняет жирность и inline-форматирование Markdown в PDF-тексте', () => {
    const definition = buildPdfDocumentDefinition(
      'Это **важно** и *курсив*, а это `код`.',
      {
        ...modernPreset,
        titlePage: {
          ...modernPreset.titlePage,
          enabled: false,
        },
      },
      { filePath: null },
    );

    const content = definition.content as Array<{ text?: unknown }>;

    expect(content[0].text).toEqual([
      { text: 'Это ' },
      { text: 'важно', bold: true },
      { text: ' и ' },
      { text: 'курсив', italics: true },
      { text: ', а это ' },
      { text: 'код', font: 'MivraCode' },
      { text: '.' },
    ]);
  });
});
