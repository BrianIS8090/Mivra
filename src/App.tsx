import { useEffect, useCallback, useRef } from 'react';

import { TitleBar } from './components/TitleBar/TitleBar';
import { Toolbar } from './components/Toolbar/Toolbar';
import { Editor } from './components/Editor/Editor';
import { StatusBar } from './components/StatusBar/StatusBar';
import { useFile } from './hooks/useFile';
import { useSettings } from './hooks/useSettings';
import { useTheme } from './hooks/useTheme';
import { useExit } from './hooks/useExit';
import { useMarkdownActions } from './hooks/useMarkdownActions';
import { useAppStore } from './stores/appStore';
import * as tauri from './utils/tauri';
import { findBaseDir } from './utils/paths';
import { confirmUnsavedChanges } from './utils/dialogs';
import './App.css';

function App() {
  const { open, save, saveAs } = useFile();
  const { changeFontSize, fontSize } = useSettings();
  const { toggleTheme } = useTheme();
  useExit();
  const { applyMarkdownAction, insertAssetAction, placeholders } = useMarkdownActions();
  const editorMode = useAppStore((s) => s.editorMode);
  const setEditorMode = useAppStore((s) => s.setEditorMode);

  // StrictMode-защита: эффект ниже выполняется дважды на mount.
  // Сейчас get_pending_file на Rust-стороне делает Mutex.take() — поэтому
  // второй вызов вернёт None. Этот ref — явный страховочный гард, который
  // не зависит от поведения backend'а.
  const pendingHandledRef = useRef(false);

  // Обработка открытия файла через ассоциацию (Windows)
  useEffect(() => {
    if (pendingHandledRef.current) return;
    pendingHandledRef.current = true;

    tauri.getPendingFile().then(async (filePath) => {
      if (!filePath) return;

      // Защита для будущей single-instance логики: при наличии несохранённых
      // изменений спрашиваем, что делать. На холодном старте isDirty=false,
      // поэтому в текущей реализации диалог не сработает.
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
        const store = useAppStore.getState();
        store.setFilePath(filePath);
        store.setBaseDir(base);
        store.loadContent(content);
      } catch (e) {
        console.error('Ошибка открытия файла:', e);
      }
    });
  }, []);

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
      insertAssetAction();
    }
  }, [open, save, saveAs, toggleTheme, editorMode, setEditorMode, changeFontSize, fontSize, applyMarkdownAction, insertAssetAction, placeholders]);

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
