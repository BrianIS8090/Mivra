import { useCallback, useMemo } from 'react';
import { editorViewCtx } from '@milkdown/kit/core';
import { insert } from '@milkdown/kit/utils';

import { useAppStore } from '../stores/appStore';
import { useEditorHandle } from '../components/Editor/EditorContext';
import { pickAndFormatAsset } from '../utils/paths';

export type MarkdownAction =
  | {
      type: 'wrap';
      prefix: string;
      suffix: string;
      placeholder: string;
    }
  | {
      type: 'insert';
      text: string;
      cursorOffset?: number;
      selectionLength?: number;
      inline?: boolean;
    };

interface Placeholders {
  text: string;
  url: string;
  alt: string;
  code: string;
  task: string;
  tableHeader1: string;
  tableHeader2: string;
  tableCell: string;
}

const RU_PLACEHOLDERS: Placeholders = {
  text: 'текст',
  url: 'https://example.com',
  alt: 'описание',
  code: 'код',
  task: 'задача',
  tableHeader1: 'Колонка 1',
  tableHeader2: 'Колонка 2',
  tableCell: 'Ячейка',
};

const EN_PLACEHOLDERS: Placeholders = {
  text: 'text',
  url: 'https://example.com',
  alt: 'alt',
  code: 'code',
  task: 'task',
  tableHeader1: 'Column 1',
  tableHeader2: 'Column 2',
  tableCell: 'Cell',
};

// Объединяет применение markdown-действий (через source/visual) и
// вставку ассетов. Раньше эта логика жила в App.tsx, а Toolbar диспатчил
// синтетический Ctrl+Shift+A — теперь Toolbar вызывает insertAssetAction
// напрямую.
export function useMarkdownActions() {
  const handleRef = useEditorHandle();
  const editorMode = useAppStore((s) => s.editorMode);
  const setContent = useAppStore((s) => s.setContent);
  const language = useAppStore((s) => s.language);
  const baseDir = useAppStore((s) => s.baseDir);

  const placeholders = useMemo<Placeholders>(
    () => (language === 'ru' ? RU_PLACEHOLDERS : EN_PLACEHOLDERS),
    [language],
  );

  const applyMarkdownAction = useCallback((action: MarkdownAction) => {
    if (editorMode === 'source') {
      const textarea = handleRef.current.sourceTextarea;
      if (!textarea) return;

      const start = textarea.selectionStart ?? 0;
      const end = textarea.selectionEnd ?? 0;
      const hasSelection = start !== end;
      const value = textarea.value;

      let insertText = '';
      let selectionStart = start;
      let selectionEnd = start;

      if (action.type === 'wrap') {
        const selected = value.slice(start, end);
        const inner = hasSelection ? selected : action.placeholder;
        insertText = `${action.prefix}${inner}${action.suffix}`;
        selectionStart = start + action.prefix.length;
        selectionEnd = selectionStart + inner.length;
      } else {
        insertText = action.text;
        const cursorOffset = action.cursorOffset ?? insertText.length;
        const selectionLength = action.selectionLength ?? 0;
        selectionStart = start + cursorOffset;
        selectionEnd = selectionStart + selectionLength;
      }

      const nextValue = value.slice(0, start) + insertText + value.slice(end);
      setContent(nextValue);

      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(selectionStart, selectionEnd);
      });
      return;
    }

    const editor = handleRef.current.editor;
    if (!editor) return;

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { state } = view;
      const { from, to } = state.selection;
      const hasSelection = from !== to;
      const selected = state.doc.textBetween(from, to, '\n');

      let markdown = '';
      let inline = true;

      if (action.type === 'wrap') {
        const inner = hasSelection ? selected : action.placeholder;
        markdown = `${action.prefix}${inner}${action.suffix}`;
        inline = true;
      } else {
        markdown = action.text;
        inline = action.inline ?? false;
      }

      insert(markdown, inline)(ctx);
      view.focus();
    });
  }, [editorMode, setContent, handleRef]);

  // Открыть диалог выбора файла из assets/ и вставить markdown-ссылку
  const insertAssetAction = useCallback(async () => {
    try {
      const md = await pickAndFormatAsset(baseDir);
      if (md) {
        applyMarkdownAction({ type: 'insert', text: md, inline: false });
      }
    } catch (e) {
      console.warn('[useMarkdownActions] insertAsset cancelled or error:', e);
    }
  }, [applyMarkdownAction, baseDir]);

  return { applyMarkdownAction, insertAssetAction, placeholders };
}
