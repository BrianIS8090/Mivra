import { describe, expect, it } from 'vitest';
import {
  denormalizeMarkdownForEditor,
  normalizeMarkdownForSource,
} from '../components/Editor/sourceMarkdown';

describe('sourceMarkdown', () => {
  it('должен убирать html br из source-представления', () => {
    const raw = 'тест\n\n<br />\n\n# тест';

    expect(normalizeMarkdownForSource(raw)).toBe('тест\n\n\n# тест');
  });

  it('должен восстанавливать html br для visual-редактора', () => {
    const source = 'тест\n\n\n# тест';

    expect(denormalizeMarkdownForEditor(source)).toBe('тест\n\n<br />\n\n# тест');
  });

  it('должен сохранять несколько дополнительных пустых строк', () => {
    const source = 'тест\n\n\n\n# тест';

    expect(denormalizeMarkdownForEditor(source)).toBe('тест\n\n<br />\n\n<br />\n\n# тест');
    expect(normalizeMarkdownForSource('тест\n\n<br />\n\n<br />\n\n# тест')).toBe(source);
  });
});
