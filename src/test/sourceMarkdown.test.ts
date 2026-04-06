import { describe, expect, it } from 'vitest';
import {
  denormalizeMarkdownForEditor,
  normalizeMarkdownForSource,
} from '../components/Editor/sourceMarkdown';

describe('sourceMarkdown', () => {
  it('должен убирать html br из source-представления перед heading без лишней пустой строки', () => {
    const raw = 'тест\n\n<br />\n\n# тест';

    expect(normalizeMarkdownForSource(raw)).toBe('тест\n\n# тест');
  });

  it('должен восстанавливать html br перед heading для visual-редактора', () => {
    const source = 'тест\n\n# тест';

    expect(denormalizeMarkdownForEditor(source)).toBe('тест\n\n<br />\n\n# тест');
  });

  it('должен сохранять несколько дополнительных пустых строк перед heading без лишней строки в source', () => {
    const source = 'тест\n\n\n# тест';

    expect(denormalizeMarkdownForEditor(source)).toBe('тест\n\n<br />\n\n<br />\n\n# тест');
    expect(normalizeMarkdownForSource('тест\n\n<br />\n\n<br />\n\n# тест')).toBe(source);
  });

  it('не должен менять старую нормализацию для не-heading блоков', () => {
    const raw = 'тест\n\n<br />\n\nцитата';

    expect(normalizeMarkdownForSource(raw)).toBe('тест\n\n\nцитата');
    expect(denormalizeMarkdownForEditor('тест\n\n\nцитата')).toBe('тест\n\n<br />\n\nцитата');
  });

  it('должен убирать ведущий html br в source-представлении', () => {
    const raw = '<br />\n\nапвп\n\nапвап\n\nвапвап';

    expect(normalizeMarkdownForSource(raw)).toBe('\nапвп\n\nапвап\n\nвапвап');
  });

  it('должен восстанавливать ведущую пустую строку для visual-редактора', () => {
    const source = '\nапвп\n\nапвап\n\nвапвап';

    expect(denormalizeMarkdownForEditor(source)).toBe('<br />\n\nапвп\n\nапвап\n\nвапвап');
  });
});
