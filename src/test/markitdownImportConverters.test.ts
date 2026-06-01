import { describe, expect, it } from 'vitest';
import { csvTextToMarkdown } from '../../plugins/markitdown-import/src/converters/csv';
import { normalizeTextMarkdown } from '../../plugins/markitdown-import/src/converters/text';

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
});
