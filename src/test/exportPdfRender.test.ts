import { describe, expect, it } from 'vitest';
import { modernPreset } from '../../plugins/export-pdf/src/presets';
import { renderPreviewHtml } from '../../plugins/export-pdf/src/pdfDefinition';

describe('renderPreviewHtml', () => {
  it('экранирует HTML из markdown-контента', () => {
    const html = renderPreviewHtml('# Title\n\n<script>alert(1)</script>', modernPreset, {
      filePath: 'C:/docs/test.md',
    });

    expect(html).toContain('<h1>Title</h1>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('добавляет титульный лист при включённой настройке', () => {
    const settings = {
      ...modernPreset,
      titlePage: {
        ...modernPreset.titlePage,
        enabled: true,
        title: 'Документ',
        author: 'Автор',
        date: '20.05.2026',
      },
    };

    const html = renderPreviewHtml('Text', settings, { filePath: null });

    expect(html).toContain('export-pdf-title-page');
    expect(html).toContain('Документ');
    expect(html).toContain('Автор');
    expect(html).toContain('20.05.2026');
  });

  it('показывает листы предпросмотра и общее количество листов', () => {
    const settings = {
      ...modernPreset,
      titlePage: {
        ...modernPreset.titlePage,
        enabled: false,
      },
    };

    const html = renderPreviewHtml('# Первый\n\nТекст\n\n# Второй\n\nТекст', settings, {
      filePath: null,
    });

    expect(html).toContain('Лист 1 из');
    expect(html).toContain('document-preview-page-label');
    expect(html).toContain('document-preview-page-break');
  });
});
