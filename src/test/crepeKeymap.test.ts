import { afterEach, describe, expect, it } from 'vitest';
import { Editor, editorViewCtx, keymapCtx, rootCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { removeConflictingStrikethroughKeymap } from '../components/Editor/crepeKeymap';

// Реальный Milkdown-редактор (commonmark + gfm — то же ядро, что собирает Crepe)
// в jsdom: проверяем собранный keymap и реальное поведение handleKeyDown.
const createdEditors: Editor[] = [];

async function createEditor(withFix: boolean) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  let editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
    })
    .use(commonmark)
    .use(gfm);
  if (withFix) removeConflictingStrikethroughKeymap(editor);
  editor = await editor.create();
  createdEditors.push(editor);
  return editor;
}

// Биндинги, которые Milkdown передаёт в prosemirror-keymap (сырые имена клавиш).
function buildKeymap(editor: Editor): Record<string, unknown> {
  return editor.action((ctx) => ctx.get(keymapCtx).build());
}

// Пробрасывает событие через handleKeyDown-props ProseMirror view:
// true — какой-то keymap-плагин перехватил клавишу (и поставит preventDefault).
function isHandledByEditorKeymap(editor: Editor, init: KeyboardEventInit): boolean {
  return editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const event = new KeyboardEvent('keydown', { cancelable: true, ...init });
    return Boolean(view.someProp('handleKeyDown', (fn) => fn(view, event)));
  });
}

afterEach(async () => {
  while (createdEditors.length > 0) {
    const editor = createdEditors.pop();
    if (editor) await editor.destroy();
  }
  document.body.innerHTML = '';
});

describe('removeConflictingStrikethroughKeymap', () => {
  it('без фикса GFM биндит Mod-Alt-x на strikethrough (конфликт с Ctrl+Alt+X приложения)', async () => {
    const editor = await createEditor(false);

    expect(Object.keys(buildKeymap(editor))).toContain('Mod-Alt-x');
    expect(isHandledByEditorKeymap(editor, { key: 'x', code: 'KeyX', ctrlKey: true, altKey: true })).toBe(true);
  });

  it('с фиксом биндинг Mod-Alt-x снят — событие доходит до глобального хендлера App', async () => {
    const editor = await createEditor(true);

    expect(Object.keys(buildKeymap(editor))).not.toContain('Mod-Alt-x');
    expect(isHandledByEditorKeymap(editor, { key: 'x', code: 'KeyX', ctrlKey: true, altKey: true })).toBe(false);
  });

  it('остальной keymap не тронут: Mod-b (жирный) по-прежнему перехватывается редактором', async () => {
    const editor = await createEditor(true);

    expect(Object.keys(buildKeymap(editor))).toContain('Mod-b');
    expect(isHandledByEditorKeymap(editor, { key: 'b', code: 'KeyB', ctrlKey: true })).toBe(true);
  });

  it('Mod-Shift-x (strikethrough через ветку App) не биндится редактором ни с фиксом, ни без', async () => {
    const withFix = await createEditor(true);
    const withoutFix = await createEditor(false);

    expect(Object.keys(buildKeymap(withFix))).not.toContain('Mod-Shift-x');
    expect(Object.keys(buildKeymap(withoutFix))).not.toContain('Mod-Shift-x');
  });
});
