import { describe, expect, it } from 'vitest';
import { defaultValueCtx, Editor, editorViewCtx, rootCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { htmlTableView } from '../components/Editor/htmlTableView';

describe('htmlTableView', () => {
  it('показывает html table как настоящую таблицу, сохраняя исходный markdown', async () => {
    const root = document.createElement('div');
    document.body.append(root);

    const markdown = '<table><tr><td colspan="2">Банк</td><td>БИК</td></tr></table>';
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, markdown);
      })
      .use(commonmark)
      .use(htmlTableView);

    await editor.create();

    const view = editor.ctx.get(editorViewCtx);
    expect(view.dom.querySelector('.mivra-html-table-view table')).toBeInTheDocument();
    expect(view.dom.querySelector('td')?.getAttribute('colspan')).toBe('2');
    expect(view.dom.textContent).not.toContain('<table>');
    expect(editor.action((ctx) => ctx.get(defaultValueCtx))).toBe(markdown);

    await editor.destroy();
    root.remove();
  });
});
