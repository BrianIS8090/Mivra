import { useEffect, useCallback } from 'react';
import { editorViewCtx } from '@milkdown/kit/core';
import { insert } from '@milkdown/kit/utils';

import { TitleBar } from './components/TitleBar/TitleBar';
import { Toolbar } from './components/Toolbar/Toolbar';
import { Editor } from './components/Editor/Editor';
import { StatusBar } from './components/StatusBar/StatusBar';
import { useFile } from './hooks/useFile';
import { useSettings } from './hooks/useSettings';
import { useTheme } from './hooks/useTheme';
import { useExit } from './hooks/useExit';
import { useAppStore } from './stores/appStore';
import { useEditorHandle } from './components/Editor/EditorContext';
import * as tauri from './utils/tauri';
import { findBaseDir } from './utils/paths';
import { confirmUnsavedChanges } from './utils/dialogs';
import './App.css';

type MarkdownAction =
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

function App() {
  const { open, save, saveAs, insertAsset } = useFile();
  const { changeFontSize, fontSize, language } = useSettings();
  const { toggleTheme } = useTheme();
  useExit();
  const handleRef = useEditorHandle();
  const editorMode = useAppStore((s) => s.editorMode);
  const setEditorMode = useAppStore((s) => s.setEditorMode);
  const setContent = useAppStore((s) => s.setContent);

  const placeholders = language === 'ru'
    ? {
        text: 'текст',
        url: 'https://example.com',
        alt: 'описание',
        code: 'код',
        task: 'задача',
        tableHeader1: 'Колонка 1',
        tableHeader2: 'Колонка 2',
        tableCell: 'Ячейка',
      }
    : {
        text: 'text',
        url: 'https://example.com',
        alt: 'alt',
        code: 'code',
        task: 'task',
        tableHeader1: 'Column 1',
        tableHeader2: 'Column 2',
        tableCell: 'Cell',
      };

  // Обработка открытия файла через ассоциацию (Windows)
  // Запрашиваем при монтировании приложения
  useEffect(() => {
    tauri.getPendingFile().then(async (filePath) => {
      if (!filePath) return;

      // Защита на случай уже несохранённых изменений (например, single-instance в будущем)
      const state = useAppStore.getState();
      if (state.isDirty) {
        const choice = await confirmUnsavedChanges(state.language);
        if (choice === 'cancel') return;
        if (choice === 'save') {
          try {
            if (state.filePath) {
              await tauri.saveFile(state.filePath, state.content);
            } else {
              const savedPath = await tauri.saveFileAs(state.content);
              if (!savedPath) return;
            }
          } catch (e) {
            console.error('Ошибка сохранения перед открытием pending-файла:', e);
            return;
          }
        }
      }

      try {
        const [content, base] = await Promise.all([
          tauri.readFile(filePath),
          findBaseDir(filePath),
        ]);
        useAppStore.getState().setFilePath(filePath);
        useAppStore.getState().setBaseDir(base);
        useAppStore.getState().setContent(content);
        useAppStore.getState().setDirty(false);
      } catch (e) {
        console.error('Ошибка открытия файла:', e);
      }
    });
  }, []);

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
        const content = hasSelection ? selected : action.placeholder;
        insertText = `${action.prefix}${content}${action.suffix}`;
        selectionStart = start + action.prefix.length;
        selectionEnd = selectionStart + content.length;
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
        const content = hasSelection ? selected : action.placeholder;
        markdown = `${action.prefix}${content}${action.suffix}`;
        inline = true;
      } else {
        markdown = action.text;
        inline = action.inline ?? false;
      }

      insert(markdown, inline)(ctx);
      view.focus();
    });
  }, [editorMode, setContent, handleRef]);

  // Горячие клавиши
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const { code } = e;
    const isCtrl = e.ctrlKey;
    const isShift = e.shiftKey;
    const isAlt = e.altKey;

    // Ctrl+O — Открыть файл
    if (isCtrl && !isShift && !isAlt && code === 'KeyO') {
      e.preventDefault();
      open();
    }
    // Ctrl+S — Сохранить
    if (isCtrl && !isShift && !isAlt && code === 'KeyS') {
      e.preventDefault();
      save();
    }
    // Ctrl+Shift+S — Сохранить как
    if (isCtrl && isShift && !isAlt && code === 'KeyS') {
      e.preventDefault();
      saveAs();
    }
    // Ctrl+P — Печать
    if (isCtrl && !isShift && !isAlt && code === 'KeyP') {
      e.preventDefault();
      window.print();
    }
    // Ctrl+Shift+T — Переключить тему
    if (isCtrl && isShift && !isAlt && code === 'KeyT') {
      e.preventDefault();
      toggleTheme();
    }
    // Ctrl+/ — Переключить режим редактора
    if (isCtrl && !isAlt && code === 'Slash') {
      e.preventDefault();
      setEditorMode(editorMode === 'visual' ? 'source' : 'visual');
    }
    // Ctrl+= или Ctrl++ — Увеличить шрифт
    if (isCtrl && !isAlt && (code === 'Equal' || code === 'NumpadAdd')) {
      e.preventDefault();
      changeFontSize(fontSize + 1);
    }
    // Ctrl+- — Уменьшить шрифт
    if (isCtrl && !isAlt && (code === 'Minus' || code === 'NumpadSubtract')) {
      e.preventDefault();
      changeFontSize(fontSize - 1);
    }

    // Markdown: Ctrl+B — Жирный
    if (isCtrl && !isShift && !isAlt && code === 'KeyB') {
      e.preventDefault();
      applyMarkdownAction({
        type: 'wrap',
        prefix: '**',
        suffix: '**',
        placeholder: placeholders.text,
      });
    }
    // Markdown: Ctrl+I — Курсив
    if (isCtrl && !isShift && !isAlt && code === 'KeyI') {
      e.preventDefault();
      applyMarkdownAction({
        type: 'wrap',
        prefix: '*',
        suffix: '*',
        placeholder: placeholders.text,
      });
    }
    // Markdown: Ctrl+Shift+X — Зачёркнутый
    if (isCtrl && isShift && !isAlt && code === 'KeyX') {
      e.preventDefault();
      applyMarkdownAction({
        type: 'wrap',
        prefix: '~~',
        suffix: '~~',
        placeholder: placeholders.text,
      });
    }
    // Markdown: Ctrl+Shift+C — Инлайн-код
    if (isCtrl && isShift && !isAlt && code === 'KeyC') {
      e.preventDefault();
      applyMarkdownAction({
        type: 'wrap',
        prefix: '`',
        suffix: '`',
        placeholder: placeholders.code,
      });
    }
    // Markdown: Ctrl+Alt+C — Блок кода
    if (isCtrl && isAlt && !isShift && code === 'KeyC') {
      e.preventDefault();
      const codeBlock = `\`\`\`\n${placeholders.code}\n\`\`\``;
      applyMarkdownAction({
        type: 'insert',
        text: codeBlock,
        cursorOffset: 4,
        selectionLength: placeholders.code.length,
        inline: false,
      });
    }
    // Markdown: Ctrl+K — Ссылка
    if (isCtrl && !isShift && !isAlt && code === 'KeyK') {
      e.preventDefault();
      applyMarkdownAction({
        type: 'wrap',
        prefix: '[',
        suffix: `](${placeholders.url})`,
        placeholder: placeholders.text,
      });
    }
    // Markdown: Ctrl+Shift+K — Изображение
    if (isCtrl && isShift && !isAlt && code === 'KeyK') {
      e.preventDefault();
      applyMarkdownAction({
        type: 'wrap',
        prefix: '![',
        suffix: `](${placeholders.url})`,
        placeholder: placeholders.alt,
      });
    }
    // Markdown: Ctrl+Alt+T — Таблица
    if (isCtrl && isAlt && !isShift && code === 'KeyT') {
      e.preventDefault();
      const table = `| ${placeholders.tableHeader1} | ${placeholders.tableHeader2} |\n| --- | --- |\n| ${placeholders.tableCell} | ${placeholders.tableCell} |`;
      applyMarkdownAction({
        type: 'insert',
        text: table,
        cursorOffset: 2,
        selectionLength: placeholders.tableHeader1.length,
        inline: false,
      });
    }
    // Markdown: Ctrl+Alt+X — Чекбокс
    if (isCtrl && isAlt && !isShift && code === 'KeyX') {
      e.preventDefault();
      const checkbox = `- [ ] ${placeholders.task}`;
      applyMarkdownAction({
        type: 'insert',
        text: checkbox,
        cursorOffset: 6,
        selectionLength: placeholders.task.length,
        inline: false,
      });
    }
    // Ctrl+Shift+A — Вставить ассет из assets/
    if (isCtrl && isShift && !isAlt && code === 'KeyA') {
      e.preventDefault();
      insertAsset().then((md) => {
        if (md) {
          applyMarkdownAction({ type: 'insert', text: md, inline: false });
        }
      });
    }
  }, [open, save, saveAs, toggleTheme, editorMode, setEditorMode, changeFontSize, fontSize, applyMarkdownAction, placeholders, insertAsset]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="app">
      <TitleBar />
      <Toolbar />
      <Editor />
      <StatusBar />
    </div>
  );
}

export default App;
