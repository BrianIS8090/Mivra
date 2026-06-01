import { describe, expect, it, vi } from 'vitest';
import { csvTextToMarkdown } from '../../plugins/markitdown-import/src/converters/csv';
import { docxImageToMarkdown } from '../../plugins/markitdown-import/src/converters/docx';
import { pdfPagesToMarkdown } from '../../plugins/markitdown-import/src/converters/pdf';
import { normalizeTextMarkdown } from '../../plugins/markitdown-import/src/converters/text';
import { sheetRowsToMarkdown } from '../../plugins/markitdown-import/src/converters/xlsx';

describe('markitdown import converters', () => {
  it('normalizeTextMarkdown приводит переносы строк к LF и убирает BOM', () => {
    expect(normalizeTextMarkdown('\uFEFFA\r\nB\rC')).toBe('A\nB\nC');
  });

  it('csvTextToMarkdown формирует markdown table', () => {
    expect(csvTextToMarkdown('Name,Age\nAlice,30')).toBe('| Name | Age |\n| --- | --- |\n| Alice | 30 |');
  });

  it('csvTextToMarkdown экранирует pipe в ячейках', () => {
    expect(csvTextToMarkdown('Name,Note\nAlice,\"A | B\"')).toBe('| Name | Note |\n| --- | --- |\n| Alice | A \\| B |');
  });

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

  it('sheetRowsToMarkdown формирует раздел листа с таблицей', () => {
    expect(sheetRowsToMarkdown('Лист1', [['A', 'B'], ['1', '2']]))
      .toBe('## Лист1\n\n| A | B |\n| --- | --- |\n| 1 | 2 |');
  });

  it('pdfPagesToMarkdown добавляет page markers', () => {
    expect(pdfPagesToMarkdown(['First page', 'Second page']))
      .toBe('<!-- page 1 -->\n\nFirst page\n\n<!-- page 2 -->\n\nSecond page');
  });
});
