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

  it('не должен трогать пустые строки и #-комментарии внутри python fenced-блока', () => {
    const raw =
      'текст\n\n```python\ndef foo():\n    pass\n\n\n# комментарий после пустой строки\ndef bar():\n    pass\n```\n\nпосле';

    expect(normalizeMarkdownForSource(raw)).toBe(raw);
    expect(denormalizeMarkdownForEditor(raw)).toBe(raw);
  });

  it('не должен вырезать html br внутри fenced-блока при нормализации', () => {
    const raw = 'текст\n\n```html\n<p>a</p>\n\n<br />\n\n<p>b</p>\n```\n\nпосле';

    expect(normalizeMarkdownForSource(raw)).toBe(raw);
  });

  it('не должен вставлять html br внутрь tilde fenced-блока при денормализации', () => {
    const source = 'текст\n\n~~~\nпервая строка\n\n\nвторая строка\n~~~\n\nпосле';

    expect(denormalizeMarkdownForEditor(source)).toBe(source);
  });

  it('не должен трогать пустые строки внутри mermaid fenced-блока', () => {
    const raw = 'диаграмма:\n\n```mermaid\ngraph TD\n  A --> B\n\n  B --> C\n\n\n  C --> D\n```\n\nтекст после';

    expect(normalizeMarkdownForSource(raw)).toBe(raw);
    expect(denormalizeMarkdownForEditor(raw)).toBe(raw);
  });

  it('должен сохранять round-trip normalize(denormalize(x)) === x для текста с fenced-блоками', () => {
    const source = [
      '# заголовок',
      '',
      'текст',
      '',
      '',
      '```python',
      'def foo():',
      '    pass',
      '',
      '# комментарий',
      '```',
      '',
      '```html',
      '<p>a</p>',
      '',
      '<br />',
      '',
      '<p>b</p>',
      '```',
      '',
      'финал',
    ].join('\n');

    expect(normalizeMarkdownForSource(denormalizeMarkdownForEditor(source))).toBe(source);
  });

  it('не должен вырезать html br из fenced-блока с отступом 4 внутри вложенного списка', () => {
    const raw = '- пункт\n\n  - вложенный\n\n    ```html\n    <p>a</p>\n\n    <br />\n\n    <p>b</p>\n    ```';

    expect(normalizeMarkdownForSource(raw)).toBe(raw);
    expect(denormalizeMarkdownForEditor(raw)).toBe(raw);
  });

  it('не должен вставлять html br в fenced-блок с отступом 4 внутри вложенного списка при денормализации', () => {
    const raw = '- a\n\n  - b\n\n    ```py\n    x = 1\n\n\n    # comment\n    y = 2\n    ```';

    expect(denormalizeMarkdownForEditor(raw)).toBe(raw);
    expect(normalizeMarkdownForSource(raw)).toBe(raw);
  });

  it('должен сохранять round-trip для fenced-блока с отступом 4 внутри вложенного списка', () => {
    const source = '- пункт\n\n  - вложенный\n\n    ```html\n    <p>a</p>\n\n    <br />\n\n    <p>b</p>\n    ```\n\nфинал';

    expect(normalizeMarkdownForSource(denormalizeMarkdownForEditor(source))).toBe(source);
  });

  it('не должен портить fenced-блок с голым \\r между строками', () => {
    const raw = '```js\ra = 1\n\n<br />\n\nb = 2\r```';

    expect(normalizeMarkdownForSource(raw)).toBe(raw);
    expect(denormalizeMarkdownForEditor(raw)).toBe(raw);
  });

  it('должен нормализовывать текст после fenced-блока с голым \\r', () => {
    const raw = '```js\ra = 1\n\n<br />\n\nb = 2\r```\n\n<br />\n\n# тест';

    expect(normalizeMarkdownForSource(raw)).toBe('```js\ra = 1\n\n<br />\n\nb = 2\r```\n\n# тест');
  });
});
