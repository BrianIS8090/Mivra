import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor as MilkdownEditor, rootCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { EditorProvider } from '../components/Editor/EditorContext';
import { Editor, applySpellcheckAttributes } from '../components/Editor/Editor';
import { useAppStore } from '../stores/appStore';

// Editor.tsx подписывается на drag-drop события окна — в общем setup.ts этот
// метод не замокан, поэтому переопределяем мок окна для этого файла.
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    onDragDropEvent: vi.fn(async () => vi.fn()),
  })),
}));

// Настоящий Crepe тянет CodeMirror и тяжёлые фичи — в jsdom это хрупко и
// излишне: здесь тестируются атрибуты, а не сам Crepe. Стаб имитирует
// единственное важное для теста свойство — после create() в root появляется
// .ProseMirror. Реальный ProseMirror-DOM проверяется отдельными тестами
// на настоящем Milkdown (ниже, по образцу crepeKeymap.test.ts).
vi.mock('@milkdown/crepe', () => {
  class CrepeStub {
    editor = { use: vi.fn(), config: vi.fn(), action: vi.fn(() => false) };
    private root: HTMLElement;
    private pm: HTMLElement | null = null;
    constructor(options: { root: HTMLElement }) {
      this.root = options.root;
    }
    on() {}
    async create() {
      const pm = document.createElement('div');
      pm.className = 'ProseMirror';
      pm.setAttribute('contenteditable', 'true');
      this.root.appendChild(pm);
      this.pm = pm;
    }
    async destroy() {
      this.pm?.remove();
      this.pm = null;
    }
  }
  return {
    Crepe: CrepeStub,
    CrepeFeature: {
      CodeMirror: 'code-mirror',
      ListItem: 'list-item',
      LinkTooltip: 'link-tooltip',
      ImageBlock: 'image-block',
      BlockEdit: 'block-edit',
      Placeholder: 'placeholder',
      Toolbar: 'toolbar',
      Table: 'table',
    },
  };
});

function renderEditor() {
  return render(
    <EditorProvider>
      <Editor />
    </EditorProvider>,
  );
}

function proseMirrorElement(): HTMLElement | null {
  return document.querySelector('.ProseMirror');
}

beforeEach(() => {
  useAppStore.setState({
    content: '',
    filePath: null,
    baseDir: null,
    language: 'ru',
    editorMode: 'source',
  });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('проверка орфографии: source-режим (textarea)', () => {
  it('textarea имеет spellcheck="true" и lang из настроек', () => {
    renderEditor();

    const textarea = document.querySelector('textarea.editor-source');
    expect(textarea).not.toBeNull();
    expect(textarea).toHaveAttribute('spellcheck', 'true');
    expect(textarea).toHaveAttribute('lang', 'ru');
  });

  it('смена language обновляет lang на textarea', () => {
    renderEditor();

    act(() => useAppStore.setState({ language: 'en' }));

    const textarea = document.querySelector('textarea.editor-source');
    expect(textarea).toHaveAttribute('lang', 'en');
    expect(textarea).toHaveAttribute('spellcheck', 'true');
  });
});

describe('проверка орфографии: visual-режим (ProseMirror)', () => {
  it('после создания редактора .ProseMirror получает spellcheck="true" и lang', async () => {
    useAppStore.setState({ editorMode: 'visual' });
    renderEditor();

    await waitFor(() => expect(proseMirrorElement()).not.toBeNull());
    expect(proseMirrorElement()).toHaveAttribute('spellcheck', 'true');
    expect(proseMirrorElement()).toHaveAttribute('lang', 'ru');
  });

  it('смена language перевыставляет lang на .ProseMirror без пересоздания', async () => {
    useAppStore.setState({ editorMode: 'visual' });
    renderEditor();
    await waitFor(() => expect(proseMirrorElement()).not.toBeNull());

    act(() => useAppStore.setState({ language: 'en' }));

    expect(proseMirrorElement()).toHaveAttribute('lang', 'en');
    expect(proseMirrorElement()).toHaveAttribute('spellcheck', 'true');
  });

  it('атрибуты перевыставляются после пересоздания редактора (source → visual)', async () => {
    // Crepe создаётся при монтировании независимо от режима (editor-root
    // смонтирован всегда), поэтому ждём исходный .ProseMirror и запоминаем его.
    renderEditor();
    await waitFor(() => expect(proseMirrorElement()).not.toBeNull());
    const oldPm = proseMirrorElement();

    act(() => useAppStore.setState({ editorMode: 'visual' }));

    // Режим source → visual пересоздаёт Crepe — новый .ProseMirror обязан
    // снова получить атрибуты, иначе орфография замолчит после смены режима.
    await waitFor(() => {
      expect(proseMirrorElement()).not.toBeNull();
      expect(proseMirrorElement()).not.toBe(oldPm);
    });
    expect(proseMirrorElement()).toHaveAttribute('spellcheck', 'true');
    expect(proseMirrorElement()).toHaveAttribute('lang', 'ru');
  });

  it('атрибуты перевыставляются после пересоздания редактора (смена контента)', async () => {
    useAppStore.setState({ editorMode: 'visual' });
    renderEditor();
    await waitFor(() => expect(proseMirrorElement()).not.toBeNull());

    act(() => useAppStore.setState({ content: '# Новый документ' }));

    await waitFor(() => expect(proseMirrorElement()).not.toBeNull());
    expect(proseMirrorElement()).toHaveAttribute('spellcheck', 'true');
    expect(proseMirrorElement()).toHaveAttribute('lang', 'ru');
  });
});

// Реальный Milkdown-редактор (commonmark + gfm — то же ядро, что собирает
// Crepe) в jsdom: helper обязан работать с настоящим ProseMirror-DOM.
const createdEditors: MilkdownEditor[] = [];

async function createRealEditor() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const editor = await MilkdownEditor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
    })
    .use(commonmark)
    .use(gfm)
    .create();
  createdEditors.push(editor);
  return root;
}

afterEach(async () => {
  while (createdEditors.length > 0) {
    const editor = createdEditors.pop();
    if (editor) await editor.destroy();
  }
});

describe('applySpellcheckAttributes на настоящем Milkdown', () => {
  it('после инициализации редактора выставляет spellcheck="true" и lang на .ProseMirror', async () => {
    const root = await createRealEditor();
    const pm = root.querySelector('.ProseMirror');
    expect(pm).not.toBeNull();
    // До применения helper'а lang не выставлен — атрибуты ставим именно мы
    expect(pm!.getAttribute('lang')).toBeNull();

    applySpellcheckAttributes(root, 'ru');

    expect(pm).toHaveAttribute('spellcheck', 'true');
    expect(pm).toHaveAttribute('lang', 'ru');
  });

  it('повторный вызов с другим language обновляет lang', async () => {
    const root = await createRealEditor();
    const pm = root.querySelector('.ProseMirror');

    applySpellcheckAttributes(root, 'ru');
    applySpellcheckAttributes(root, 'en');

    expect(pm).toHaveAttribute('lang', 'en');
    expect(pm).toHaveAttribute('spellcheck', 'true');
  });
});
