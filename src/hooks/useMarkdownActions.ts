import { useCallback, useMemo } from 'react';
import { editorViewCtx } from '@milkdown/kit/core';
import { insert } from '@milkdown/kit/utils';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { stat } from '@tauri-apps/plugin-fs';

import { useAppStore } from '../stores/appStore';
import { useEditorHandle } from '../components/Editor/EditorContext';
import { pickAndFormatAsset } from '../utils/paths';
import { useS3Upload } from './useS3Upload';

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

  // Колбэк для useS3Upload — собирает markdown и вставляет через applyMarkdownAction
  const insertImageOrLink = useCallback(
    (name: string, url: string, isImage: boolean) => {
      const text = isImage ? `![${name}](${url})\n` : `[${name}](${url})\n`;
      applyMarkdownAction({ type: 'insert', text, inline: false });
    },
    [applyMarkdownAction],
  );

  const s3 = useS3Upload(insertImageOrLink);

  // Открыть диалог выбора файла и вставить markdown-ссылку.
  // Если S3 настроен — загружаем туда. Иначе — старая логика assets/.
  const insertAssetAction = useCallback(async () => {
    if (s3.ready) {
      const selected = await openDialog({
        multiple: false,
        directory: false,
        filters: [{
          name: 'Assets',
          extensions: [
            'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp',
            'apng', 'avif', 'tiff', 'tif', 'heic',
            'pdf', 'zip', 'mp4', 'webm',
          ],
        }],
      });
      if (!selected || typeof selected !== 'string') return;
      const filename = selected.split(/[\\/]/).pop() ?? selected;
      let size: number | undefined;
      try {
        const meta = await stat(selected);
        size = meta.size;
      } catch {
        size = undefined;
      }
      await s3.uploadAndInsertFile(selected, filename, size);
      return;
    }

    // S3 не настроен — старый локальный pickAndFormatAsset
    try {
      const md = await pickAndFormatAsset(baseDir);
      if (md) {
        applyMarkdownAction({ type: 'insert', text: md, inline: false });
      }
    } catch (e) {
      console.warn('[useMarkdownActions] insertAsset cancelled or error:', e);
    }
  }, [s3, applyMarkdownAction, baseDir]);

  return { applyMarkdownAction, insertAssetAction, placeholders };
}
