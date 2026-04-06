import { describe, expect, it } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { createHeadingBackspaceTransaction } from '../components/Editor/headingBackspace';

const schema = new Schema({
  nodes: {
    doc: {
      content: 'block+',
    },
    paragraph: {
      content: '(text | hardbreak)*',
      group: 'block',
      toDOM: () => ['p', 0],
    },
    heading: {
      attrs: {
        level: { default: 1 },
      },
      content: 'text*',
      group: 'block',
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
    text: {},
    hardbreak: {
      inline: true,
      group: 'inline',
      selectable: false,
      toDOM: () => ['br'],
    },
  },
});

function createState(doc: Parameters<typeof schema.node>[1], selectionPos: number) {
  const docNode = schema.node('doc', null, doc);

  return EditorState.create({
    schema,
    doc: docNode,
    selection: TextSelection.create(docNode, selectionPos),
  });
}

describe('createHeadingBackspaceTransaction', () => {
  it('должен удалять пустой абзац перед заголовком и сохранять тип heading', () => {
    const doc = [
      schema.node('paragraph'),
      schema.node('heading', { level: 2 }, [schema.text('Заголовок')]),
    ];
    const state = createState(doc, 3);

    const tr = createHeadingBackspaceTransaction(state);

    expect(tr).not.toBeNull();
    expect(tr?.doc.childCount).toBe(1);
    expect(tr?.doc.firstChild?.type.name).toBe('heading');
    expect(tr?.doc.firstChild?.attrs.level).toBe(2);
    expect(tr?.selection.from).toBe(1);
  });

  it('не должен срабатывать, если предыдущий абзац не пустой', () => {
    const doc = [
      schema.node('paragraph', null, [schema.text('Текст')]),
      schema.node('heading', { level: 2 }, [schema.text('Заголовок')]),
    ];
    const state = createState(doc, 8);

    const tr = createHeadingBackspaceTransaction(state);

    expect(tr).toBeNull();
  });

  it('должен удалять визуально пустую строку между текстом и заголовком', () => {
    const doc = [
      schema.node('paragraph', null, [schema.text('Текст')]),
      schema.node('paragraph', null, [schema.node('hardbreak')]),
      schema.node('heading', { level: 3 }, [schema.text('Заголовок')]),
    ];
    const state = createState(doc, 11);

    const tr = createHeadingBackspaceTransaction(state);

    expect(tr).not.toBeNull();
    expect(tr?.doc.childCount).toBe(2);
    expect(tr?.doc.firstChild?.type.name).toBe('paragraph');
    expect(tr?.doc.firstChild?.textContent).toBe('Текст');
    expect(tr?.doc.lastChild?.type.name).toBe('heading');
    expect(tr?.doc.lastChild?.attrs.level).toBe(3);
  });
});
