import { afterEach, describe, expect, it } from 'vitest';
import { shouldHandleGlobalShortcut } from '../utils/shortcuts';

// Разметка повторяет Editor.tsx: .editor-container > .editor-root (visual Crepe)
// + textarea.editor-source (source-режим).
function createEditorDom() {
  const container = document.createElement('div');
  container.className = 'editor-container';

  const visualRoot = document.createElement('div');
  visualRoot.className = 'editor-root';
  const visualEditable = document.createElement('div');
  visualEditable.setAttribute('contenteditable', 'true');
  visualRoot.appendChild(visualEditable);

  const source = document.createElement('textarea');
  source.className = 'editor-source';

  container.append(visualRoot, source);
  document.body.appendChild(container);
  return { container, visualEditable, source };
}

// Диспатч реального события, чтобы e.target был выставлен браузерным механизмом.
function dispatchKeydown(target: EventTarget, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    code: 'KeyB',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('shouldHandleGlobalShortcut', () => {
  it('возвращает false, если событие уже обработано (defaultPrevented), даже с target = body', () => {
    const event = dispatchKeydown(document.body);
    event.preventDefault();

    expect(event.defaultPrevented).toBe(true);
    expect(shouldHandleGlobalShortcut(event)).toBe(false);
  });

  it('возвращает false для Ctrl+B в visual-редакторе, когда keymap Milkdown уже поставил preventDefault', () => {
    const { visualEditable } = createEditorDom();
    // Имитация keymap ProseMirror: preventDefault без stopPropagation —
    // событие всё равно всплывёт до window.
    visualEditable.addEventListener('keydown', (e) => e.preventDefault());

    const event = dispatchKeydown(visualEditable);

    expect(event.defaultPrevented).toBe(true);
    expect(shouldHandleGlobalShortcut(event)).toBe(false);
  });

  it('игнорирует input вне редактора (диалоги, тулбар)', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);

    expect(shouldHandleGlobalShortcut(dispatchKeydown(input))).toBe(false);
  });

  it('игнорирует textarea вне редактора', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    expect(shouldHandleGlobalShortcut(dispatchKeydown(textarea))).toBe(false);
  });

  it('игнорирует select вне редактора', () => {
    const select = document.createElement('select');
    document.body.appendChild(select);

    expect(shouldHandleGlobalShortcut(dispatchKeydown(select))).toBe(false);
  });

  it('игнорирует contenteditable-элемент вне редактора', () => {
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.appendChild(editable);

    expect(shouldHandleGlobalShortcut(dispatchKeydown(editable))).toBe(false);
  });

  it('игнорирует вложенный элемент внутри contenteditable вне редактора', () => {
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const inner = document.createElement('strong');
    editable.appendChild(inner);
    document.body.appendChild(editable);

    expect(shouldHandleGlobalShortcut(dispatchKeydown(inner))).toBe(false);
  });

  it('разрешает source-textarea редактора (textarea.editor-source)', () => {
    const { source } = createEditorDom();

    expect(shouldHandleGlobalShortcut(dispatchKeydown(source))).toBe(true);
  });

  it('разрешает contenteditable visual-редактора, если событие не было перехвачено', () => {
    const { visualEditable } = createEditorDom();
    const event = dispatchKeydown(visualEditable, { code: 'KeyO' });

    expect(event.defaultPrevented).toBe(false);
    expect(shouldHandleGlobalShortcut(event)).toBe(true);
  });

  it('разрешает обычные не-редактируемые элементы вне редактора', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    expect(shouldHandleGlobalShortcut(dispatchKeydown(div))).toBe(true);
  });

  it('разрешает события без HTMLElement-target (window)', () => {
    const event = dispatchKeydown(window);

    expect(shouldHandleGlobalShortcut(event)).toBe(true);
  });

  it('не фильтрует по коду клавиши: Ctrl+/ с target = body проходит', () => {
    const event = dispatchKeydown(document.body, { code: 'Slash' });

    expect(shouldHandleGlobalShortcut(event)).toBe(true);
  });

  it('не считает редактируемым элемент внутри contenteditable="false"', () => {
    const host = document.createElement('div');
    host.setAttribute('contenteditable', 'false');
    const inner = document.createElement('span');
    host.appendChild(inner);
    document.body.appendChild(host);

    expect(shouldHandleGlobalShortcut(dispatchKeydown(inner))).toBe(true);
  });
});
