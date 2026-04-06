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
      content: '(text | hardbreak | html)*',
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
    html: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: {
        value: { default: '' },
      },
      toDOM: (node) => ['span', node.attrs.value],
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

function getBlockStartPosition(doc: Parameters<typeof schema.node>[1], blockIndex: number): number {
  const docNode = schema.node('doc', null, doc);
  let position = 0;

  for (let index = 0; index < blockIndex; index += 1) {
    position += docNode.child(index).nodeSize;
  }

  return position + 1;
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

  it('должен удалять строку с html br между текстом и заголовком', () => {
    const doc = [
      schema.node('paragraph', null, [schema.text('тест')]),
      schema.node('paragraph', null, [schema.node('html', { value: '<br />' })]),
      schema.node('heading', { level: 1 }, [schema.text('тест')]),
    ];
    const state = createState(doc, 10);

    const tr = createHeadingBackspaceTransaction(state);

    expect(tr).not.toBeNull();
    expect(tr?.doc.childCount).toBe(2);
    expect(tr?.doc.firstChild?.type.name).toBe('paragraph');
    expect(tr?.doc.firstChild?.textContent).toBe('тест');
    expect(tr?.doc.lastChild?.type.name).toBe('heading');
    expect(tr?.doc.lastChild?.attrs.level).toBe(1);
  });

  it('должен последовательно удалять несколько пустых строк перед заголовком без downgrade', () => {
    const doc = [
      schema.node('paragraph', null, [schema.text('тест')]),
      schema.node('paragraph', null, [schema.node('html', { value: '<br />' })]),
      schema.node('paragraph', null, [schema.node('html', { value: '<br />' })]),
      schema.node('heading', { level: 2 }, [schema.text('заголовок')]),
    ];
    const initialState = createState(doc, getBlockStartPosition(doc, 3));

    const firstTr = createHeadingBackspaceTransaction(initialState);

    expect(firstTr).not.toBeNull();
    expect(firstTr?.doc.childCount).toBe(3);
    expect(firstTr?.doc.lastChild?.type.name).toBe('heading');
    expect(firstTr?.doc.lastChild?.attrs.level).toBe(2);

    const secondState = EditorState.create({
      schema,
      doc: firstTr!.doc,
      selection: firstTr!.selection,
    });
    const secondTr = createHeadingBackspaceTransaction(secondState);

    expect(secondTr).not.toBeNull();
    expect(secondTr?.doc.childCount).toBe(2);
    expect(secondTr?.doc.firstChild?.type.name).toBe('paragraph');
    expect(secondTr?.doc.firstChild?.textContent).toBe('тест');
    expect(secondTr?.doc.lastChild?.type.name).toBe('heading');
    expect(secondTr?.doc.lastChild?.attrs.level).toBe(2);
  });

  it('должен сохранять heading, если последняя пустая строка хранится в конце предыдущего абзаца', () => {
    const doc = [
      schema.node('paragraph', null, [
        schema.text('тест'),
        schema.node('hardbreak'),
        schema.node('hardbreak'),
      ]),
      schema.node('heading', { level: 2 }, [schema.text('заголовок')]),
    ];
    const state = createState(doc, getBlockStartPosition(doc, 1));

    const tr = createHeadingBackspaceTransaction(state);

    expect(tr).not.toBeNull();
    expect(tr?.doc.childCount).toBe(2);
    expect(tr?.doc.firstChild?.type.name).toBe('paragraph');
    expect(tr?.doc.firstChild?.textContent).toBe('тест');
    expect(tr?.doc.lastChild?.type.name).toBe('heading');
    expect(tr?.doc.lastChild?.attrs.level).toBe(2);
  });
});
