import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MutableRefObject, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultValueCtx,
  Editor as MilkdownEditor,
  editorViewCtx,
  rootCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { $prose } from '@milkdown/kit/utils';
import { TextSelection } from 'prosemirror-state';
import {
  EditorProvider,
  useEditorHandle,
  type EditorHandle,
} from '../components/Editor/EditorContext';
import { createSearchHighlightPlugin, findMatchesInDoc } from '../components/Editor/editorSearch';
import { SearchPanel } from '../components/Editor/SearchPanel';
import { useAppStore } from '../stores/appStore';
import { shouldHandleGlobalShortcut } from '../utils/shortcuts';

interface PanelProps {
  showReplace?: boolean;
  focusSignal?: number;
  onClose?: () => void;
}

// Панель получает редактор только из EditorContext — проба вытаскивает хэндл,
// чтобы тест мог подставить textarea (source) или настоящий Milkdown (visual).
// rerenderPanel — ререндер с новыми пропсами БЕЗ перемонтирования (так App
// дёргает уже открытую панель повторными Ctrl+F/Ctrl+H).
function renderSearchPanel(props: PanelProps = {}) {
  const ref: { handle: MutableRefObject<EditorHandle> | null } = { handle: null };
  function Probe({ children }: { children: ReactNode }) {
    ref.handle = useEditorHandle();
    return <>{children}</>;
  }
  const tree = (p: PanelProps) => (
    <EditorProvider>
      <Probe>
        <SearchPanel
          showReplace={p.showReplace ?? false}
          focusSignal={p.focusSignal ?? 0}
          onClose={p.onClose ?? (() => {})}
        />
      </Probe>
    </EditorProvider>
  );
  const utils = render(tree(props));
  return {
    ...utils,
    handle: () => ref.handle!,
    rerenderPanel: (p: PanelProps) => utils.rerender(tree(p)),
  };
}

// Подстановка source-textarea: в приложении её создаёт Editor.tsx и публикует
// через хэндл, здесь имитируем то же самое вручную.
function attachSourceTextarea(handle: MutableRefObject<EditorHandle>, text: string) {
  const textarea = document.createElement('textarea');
  textarea.className = 'editor-source';
  textarea.value = text;
  document.body.appendChild(textarea);
  handle.current.sourceTextarea = textarea;
  // Обновление стора — React-состояние панели, поэтому в act()
  act(() => useAppStore.setState({ editorMode: 'source', content: text }));
  return textarea;
}

beforeEach(() => {
  useAppStore.setState({ editorMode: 'source', content: '', language: 'ru' });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('SearchPanel: source-режим', () => {
  it('ищет по тексту textarea и показывает счётчик «текущее/всего»', () => {
    const { handle } = renderSearchPanel();
    const textarea = attachSourceTextarea(handle(), 'foo bar foo');

    fireEvent.change(screen.getByPlaceholderText('Найти…'), { target: { value: 'foo' } });

    expect(screen.getByText('1/2')).toBeInTheDocument();
    // Первое совпадение выбрано сразу после ввода запроса
    expect(textarea.selectionStart).toBe(0);
    expect(textarea.selectionEnd).toBe(3);
  });

  it('Enter и Shift+Enter ходят по совпадениям с wrap-around', () => {
    const { handle } = renderSearchPanel();
    const textarea = attachSourceTextarea(handle(), 'foo bar foo');
    const input = screen.getByPlaceholderText('Найти…');

    fireEvent.change(input, { target: { value: 'foo' } });

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(textarea.selectionStart).toBe(8);
    expect(textarea.selectionEnd).toBe(11);

    // wrap-around: за последним идёт первое
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('1/2')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(screen.getByText('2/2')).toBeInTheDocument();
  });

  it('показывает «Нет совпадений» при пустом результате', () => {
    const { handle } = renderSearchPanel();
    attachSourceTextarea(handle(), 'foo bar foo');

    fireEvent.change(screen.getByPlaceholderText('Найти…'), { target: { value: 'zzz' } });

    expect(screen.getByText('Нет совпадений')).toBeInTheDocument();
  });

  it('тоггл регистра меняет набор совпадений', () => {
    const { handle } = renderSearchPanel();
    attachSourceTextarea(handle(), 'Foo foo');
    const input = screen.getByPlaceholderText('Найти…');

    fireEvent.change(input, { target: { value: 'foo' } });
    expect(screen.getByText('1/2')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Учитывать регистр'));
    expect(screen.getByText('1/1')).toBeInTheDocument();
  });

  it('«Заменить» меняет текущее совпадение и обновляет контент стора', async () => {
    const { handle } = renderSearchPanel({ showReplace: true });
    const textarea = attachSourceTextarea(handle(), 'foo foo');

    fireEvent.change(screen.getByPlaceholderText('Найти…'), { target: { value: 'foo' } });
    fireEvent.change(screen.getByPlaceholderText('Заменить на…'), { target: { value: 'baz' } });
    fireEvent.click(screen.getByTitle('Заменить текущее совпадение'));

    expect(useAppStore.getState().content).toBe('baz foo');
    // В приложении textarea синхронизирует эффект Editor.tsx — здесь имитируем.
    textarea.value = 'baz foo';
    await waitFor(() => expect(screen.getByText('1/1')).toBeInTheDocument());
  });

  it('«Заменить все» меняет все совпадения одним действием', async () => {
    const { handle } = renderSearchPanel({ showReplace: true });
    const textarea = attachSourceTextarea(handle(), 'foo foo');

    fireEvent.change(screen.getByPlaceholderText('Найти…'), { target: { value: 'foo' } });
    fireEvent.change(screen.getByPlaceholderText('Заменить на…'), { target: { value: 'baz' } });
    fireEvent.click(screen.getByTitle('Заменить все совпадения'));

    expect(useAppStore.getState().content).toBe('baz baz');
    textarea.value = 'baz baz';
    await waitFor(() => expect(screen.getByText('Нет совпадений')).toBeInTheDocument());
  });

  it('Esc закрывает панель и помечает событие обработанным', () => {
    const onClose = vi.fn();
    renderSearchPanel({ onClose });
    const input = screen.getByPlaceholderText('Найти…');

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    input.dispatchEvent(event);

    expect(onClose).toHaveBeenCalledTimes(1);
    // preventDefault — сигнал нижележащим слоям, что Esc уже поглощён
    expect(event.defaultPrevented).toBe(true);
  });

  it('Esc, уже обработанный верхним слоем (defaultPrevented), панель не закрывает', () => {
    const onClose = vi.fn();
    renderSearchPanel({ onClose });
    const input = screen.getByPlaceholderText('Найти…');

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    event.preventDefault(); // диалог выше по слою уже отреагировал на этот Esc
    input.dispatchEvent(event);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('повторный Ctrl+H разворачивает строку замены на уже открытой панели', () => {
    const { rerenderPanel } = renderSearchPanel({ showReplace: false, focusSignal: 0 });
    expect(screen.queryByPlaceholderText('Заменить на…')).not.toBeInTheDocument();

    // App при повторном шорткате меняет проп и инкрементирует focusSignal
    rerenderPanel({ showReplace: true, focusSignal: 1 });

    expect(screen.getByPlaceholderText('Заменить на…')).toBeInTheDocument();
  });

  it('повторный Ctrl+F (focusSignal) возвращает фокус в поле запроса', () => {
    const { rerenderPanel } = renderSearchPanel({ focusSignal: 0 });
    const input = screen.getByPlaceholderText('Найти…');

    input.blur(); // пользователь ушёл печатать в документ
    expect(input).not.toHaveFocus();

    rerenderPanel({ focusSignal: 1 });

    expect(input).toHaveFocus();
  });

  it('первый переход идёт от текущей каретки textarea, а не от начала документа', () => {
    const { handle } = renderSearchPanel();
    const textarea = attachSourceTextarea(handle(), 'foo bar foo');
    textarea.selectionStart = 8;
    textarea.selectionEnd = 8; // каретка стоит у второго «foo»

    fireEvent.change(screen.getByPlaceholderText('Найти…'), { target: { value: 'foo' } });

    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(textarea.selectionStart).toBe(8);
    expect(textarea.selectionEnd).toBe(11);
  });

  it('замена, содержащая запрос, не застревает на вставленном тексте', async () => {
    const { handle } = renderSearchPanel({ showReplace: true });
    const textarea = attachSourceTextarea(handle(), 'a a');

    fireEvent.change(screen.getByPlaceholderText('Найти…'), { target: { value: 'a' } });
    fireEvent.change(screen.getByPlaceholderText('Заменить на…'), { target: { value: 'aa' } });

    fireEvent.click(screen.getByTitle('Заменить текущее совпадение'));
    expect(useAppStore.getState().content).toBe('aa a');
    // В приложении textarea синхронизирует эффект Editor.tsx — здесь имитируем.
    textarea.value = 'aa a';
    // Текущим обязано стать совпадение ЗА пределами вставленной замены (3/3),
    // а не {0,1} внутри неё — иначе каждая замена раздувает текст.
    await waitFor(() => expect(screen.getByText('3/3')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Заменить текущее совпадение'));
    expect(useAppStore.getState().content).toBe('aa aa');
  });

  it('глобальные шорткаты документа не срабатывают при фокусе в поле поиска', () => {
    renderSearchPanel();
    const input = screen.getByPlaceholderText('Найти…');

    // Поле поиска живёт вне .editor-container — предикат глобальных шорткатов
    // обязан его отфильтровать, иначе Ctrl+B мутировал бы документ.
    const event = new KeyboardEvent('keydown', {
      code: 'KeyB',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);

    expect(shouldHandleGlobalShortcut(event)).toBe(false);
  });
});

describe('SearchPanel: visual-режим (настоящий Milkdown)', () => {
  const editors: MilkdownEditor[] = [];

  async function attachVisualEditor(handle: MutableRefObject<EditorHandle>, markdown: string) {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const editor = await MilkdownEditor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, markdown);
      })
      .use(commonmark)
      .use(gfm)
      .use($prose(() => createSearchHighlightPlugin()))
      .create();
    editors.push(editor);
    handle.current.editor = editor;
    act(() => useAppStore.setState({ editorMode: 'visual', content: markdown }));
    return { editor, root };
  }

  beforeEach(() => {
    useAppStore.setState({ editorMode: 'visual', content: '', language: 'ru' });
    // jsdom не реализует скролл — глушим, переход к совпадению вызывает scrollIntoView
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(async () => {
    while (editors.length > 0) {
      const editor = editors.pop();
      if (editor) await editor.destroy();
    }
    document.body.innerHTML = '';
  });

  it('подсвечивает все совпадения, текущее — отдельным классом', async () => {
    const { handle } = renderSearchPanel();
    const { root } = await attachVisualEditor(handle(), 'foo bar foo');

    fireEvent.change(screen.getByPlaceholderText('Найти…'), { target: { value: 'foo' } });

    await waitFor(() => {
      expect(root.querySelectorAll('.search-match')).toHaveLength(2);
    });
    const current = root.querySelectorAll('.search-match-current');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe('foo');
  });

  it('Enter переводит выделение редактора к следующему совпадению', async () => {
    const { handle } = renderSearchPanel();
    const { editor } = await attachVisualEditor(handle(), 'foo bar foo');
    const input = screen.getByPlaceholderText('Найти…');

    fireEvent.change(input, { target: { value: 'foo' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      // Документ «foo bar foo»: текст параграфа начинается с позиции 1,
      // второе вхождение — [9, 12).
      expect(view.state.selection.from).toBe(9);
      expect(view.state.selection.to).toBe(12);
    });
  });

  it('замена всех в visual-режиме меняет документ и помечает взаимодействие', async () => {
    const { handle } = renderSearchPanel({ showReplace: true });
    const { editor } = await attachVisualEditor(handle(), 'foo bar foo');
    const markUserInteracted = vi.fn();
    handle().current.markUserInteracted = markUserInteracted;

    fireEvent.change(screen.getByPlaceholderText('Найти…'), { target: { value: 'foo' } });
    fireEvent.change(screen.getByPlaceholderText('Заменить на…'), { target: { value: 'baz' } });
    fireEvent.click(screen.getByTitle('Заменить все совпадения'));

    expect(markUserInteracted).toHaveBeenCalledTimes(1);
    editor.action((ctx) => {
      expect(ctx.get(editorViewCtx).state.doc.textContent).toBe('baz bar baz');
    });
  });

  it('размонтирование панели снимает подсветку', async () => {
    const { handle, unmount } = renderSearchPanel();
    const { root } = await attachVisualEditor(handle(), 'foo bar foo');

    fireEvent.change(screen.getByPlaceholderText('Найти…'), { target: { value: 'foo' } });
    await waitFor(() => {
      expect(root.querySelectorAll('.search-match')).toHaveLength(2);
    });

    unmount();
    expect(root.querySelectorAll('.search-match')).toHaveLength(0);
  });

  it('замена сразу после hardbreak не удаляет сам break (маппинг границ сегментов)', async () => {
    const { handle } = renderSearchPanel({ showReplace: true });
    // Два пробела в конце строки — hard break по CommonMark
    const { editor } = await attachVisualEditor(handle(), 'foo  \nbar');

    editor.action((ctx) => {
      const doc = ctx.get(editorViewCtx).state.doc;
      const para = doc.firstChild!;
      expect(para.childCount).toBe(3);
      expect(para.child(1).type.name).toBe('hardbreak');
      // «bar» начинается ПОСЛЕ узла разрыва: позиция 5, а не 4
      expect(findMatchesInDoc(doc, 'bar', false)).toEqual([{ from: 5, to: 8 }]);
    });

    fireEvent.change(screen.getByPlaceholderText('Найти…'), { target: { value: 'bar' } });
    fireEvent.change(screen.getByPlaceholderText('Заменить на…'), { target: { value: 'baz' } });
    fireEvent.click(screen.getByTitle('Заменить текущее совпадение'));

    editor.action((ctx) => {
      const para = ctx.get(editorViewCtx).state.doc.firstChild!;
      expect(para.childCount).toBe(3);
      expect(para.child(0).text).toBe('foo');
      expect(para.child(1).type.name).toBe('hardbreak');
      expect(para.child(2).text).toBe('baz');
    });
  });

  it('замена сразу после inline-image не удаляет картинку', async () => {
    const { handle } = renderSearchPanel({ showReplace: true });
    const { editor } = await attachVisualEditor(handle(), 'foo![x](https://x.test/i.png)bar');

    editor.action((ctx) => {
      const doc = ctx.get(editorViewCtx).state.doc;
      const para = doc.firstChild!;
      expect(para.childCount).toBe(3);
      expect(para.child(1).type.name).toBe('image');
      expect(findMatchesInDoc(doc, 'bar', false)).toEqual([{ from: 5, to: 8 }]);
    });

    fireEvent.change(screen.getByPlaceholderText('Найти…'), { target: { value: 'bar' } });
    fireEvent.change(screen.getByPlaceholderText('Заменить на…'), { target: { value: 'baz' } });
    fireEvent.click(screen.getByTitle('Заменить текущее совпадение'));

    editor.action((ctx) => {
      const para = ctx.get(editorViewCtx).state.doc.firstChild!;
      expect(para.childCount).toBe(3);
      expect(para.child(0).text).toBe('foo');
      expect(para.child(1).type.name).toBe('image');
      expect(para.child(2).text).toBe('baz');
    });
  });

  it('замена в visual-режиме не застревает на вставленном тексте', async () => {
    const { handle } = renderSearchPanel({ showReplace: true });
    const { editor } = await attachVisualEditor(handle(), 'a a');

    fireEvent.change(screen.getByPlaceholderText('Найти…'), { target: { value: 'a' } });
    fireEvent.change(screen.getByPlaceholderText('Заменить на…'), { target: { value: 'aa' } });
    fireEvent.click(screen.getByTitle('Заменить текущее совпадение'));

    editor.action((ctx) => {
      expect(ctx.get(editorViewCtx).state.doc.textContent).toBe('aa a');
    });
    // В приложении markdownUpdated пишет в store — эффект панели пересчитает.
    act(() => useAppStore.setState({ content: 'aa a' }));
    // Текущее — совпадение за пределами вставленной замены
    await waitFor(() => expect(screen.getByText('3/3')).toBeInTheDocument());
  });

  it('первый переход идёт от текущего выделения редактора, а не от начала документа', async () => {
    const { handle } = renderSearchPanel();
    const { editor } = await attachVisualEditor(handle(), 'foo bar foo');

    // Каретка у второго «foo» (позиция 9)
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 9)));
    });

    fireEvent.change(screen.getByPlaceholderText('Найти…'), { target: { value: 'foo' } });

    expect(screen.getByText('2/2')).toBeInTheDocument();
  });
});
