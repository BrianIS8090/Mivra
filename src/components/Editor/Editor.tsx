import { useEffect, useRef, useCallback, useState } from 'react';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import { editorViewCtx } from '@milkdown/kit/core';
import { useAppStore } from '../../stores/appStore';
import { useEditorHandle } from './EditorContext';
import { renderMermaidPreview } from '../../utils/mermaid';
import { resolveImageSrc } from '../../utils/paths';
import { createHeadingBackspaceTransaction } from './headingBackspace';
import { denormalizeMarkdownForEditor, normalizeMarkdownForSource } from './sourceMarkdown';
import './editor.css';

// Извлечь YAML frontmatter из markdown-контента.
// Возвращает [frontmatter с разделителями, тело без frontmatter].
function splitFrontmatter(content: string): [string, string] {
  const match = content.match(/^(---[\t ]*\r?\n[\s\S]*?\r?\n---[\t ]*\r?\n?)/);
  if (match) return [match[1], content.slice(match[1].length)];
  return ['', content];
}

function createCrepeConfig(defaultValue: string, baseDir: string | null) {
  return {
    defaultValue,
    features: {
      [CrepeFeature.CodeMirror]: true,
      [CrepeFeature.ListItem]: true,
      [CrepeFeature.LinkTooltip]: true,
      [CrepeFeature.ImageBlock]: true,
      [CrepeFeature.BlockEdit]: true,
      [CrepeFeature.Placeholder]: true,
      [CrepeFeature.Toolbar]: true,
      [CrepeFeature.Table]: true,
    },
    featureConfigs: {
      [CrepeFeature.Placeholder]: {
        text: 'Начните писать...',
        mode: 'block' as const,
      },
      [CrepeFeature.CodeMirror]: {
        renderPreview: (
          language: string,
          content: string,
          applyPreview: (el: HTMLElement) => void,
        ) => {
          if (language.toLowerCase() === 'mermaid') {
            return renderMermaidPreview(content, applyPreview);
          }
          return null;
        },
        previewOnlyByDefault: true,
      },
      [CrepeFeature.ImageBlock]: {
        proxyDomURL: (url: string): string | Promise<string> => {
          if (!url || /^(https?:|data:|blob:)/.test(url)) return url;
          if (!baseDir) return url;
          return resolveImageSrc(url, baseDir);
        },
      },
    },
  };
}

export function Editor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const handleRef = useEditorHandle();

  const content = useAppStore((s) => s.content);
  const baseDir = useAppStore((s) => s.baseDir);
  const setContent = useAppStore((s) => s.setContent);
  const fontFamily = useAppStore((s) => s.fontFamily);
  const fontSize = useAppStore((s) => s.fontSize);
  const pageWidth = useAppStore((s) => s.pageWidth);
  const editorMode = useAppStore((s) => s.editorMode);
  const [sourceContent, setSourceContent] = useState(() => normalizeMarkdownForSource(content));

  // Refs для стабильных колбэков
  const setContentRef = useRef(setContent);
  setContentRef.current = setContent;
  const contentRef = useRef(content);

  // Текущий режим редактора (для доступа из listener без пересоздания)
  const editorModeRef = useRef(editorMode);
  editorModeRef.current = editorMode;

  // Флаг: пользователь взаимодействовал с visual-редактором после его создания.
  // Пока false — markdownUpdated игнорируется (защита от нормализации при парсинге).
  const userInteractedRef = useRef(false);
  const interactionCleanupRef = useRef<(() => void) | null>(null);

  // Хранение YAML frontmatter отдельно от тела — Milkdown его не трогает
  const frontmatterRef = useRef('');

  // Generation-counter — защищает от race condition при быстрой смене content/mode/baseDir.
  // Каждый старт async-цепочки инкрементит счётчик; результат игнорируется,
  // если за время destroy/create счётчик ушёл вперёд.
  const genRef = useRef(0);

  // Создание экземпляра Crepe
  const buildCrepe = useCallback((root: HTMLElement, value: string, currentBaseDir: string | null) => {
    // Очистить предыдущие обработчики взаимодействия
    interactionCleanupRef.current?.();

    // Сбросить флаг — пока пользователь не начнёт редактировать,
    // markdownUpdated не будет обновлять store
    userInteractedRef.current = false;

    // Отслеживать первое взаимодействие пользователя с редактором
    const onInteraction = () => { userInteractedRef.current = true; };
    const onBackspaceCapture = (event: KeyboardEvent) => {
      if (event.key !== 'Backspace') return;

      const handled = crepe.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const tr = createHeadingBackspaceTransaction(view.state);
        if (!tr) return false;

        userInteractedRef.current = true;
        view.dispatch(tr);
        return true;
      });

      if (!handled) return;
      event.preventDefault();
      event.stopPropagation();
    };

    root.addEventListener('keydown', onBackspaceCapture, true);
    root.addEventListener('keydown', onInteraction);
    root.addEventListener('pointerdown', onInteraction);
    interactionCleanupRef.current = () => {
      root.removeEventListener('keydown', onBackspaceCapture, true);
      root.removeEventListener('keydown', onInteraction);
      root.removeEventListener('pointerdown', onInteraction);
    };

    // Извлечь frontmatter — Milkdown получает только тело документа
    const [fm, body] = splitFrontmatter(value);
    frontmatterRef.current = fm;
    const visualBody = denormalizeMarkdownForEditor(body);

    const crepe = new Crepe({
      root,
      ...createCrepeConfig(visualBody, currentBaseDir),
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        // Обновлять store только если пользователь реально редактировал в visual-режиме
        if (!userInteractedRef.current || editorModeRef.current === 'source') return;
        // Восстановить frontmatter перед записью в store
        const fullContent = frontmatterRef.current + normalizeMarkdownForSource(markdown);
        if (fullContent === contentRef.current) return;
        contentRef.current = fullContent;
        setContentRef.current(fullContent);
      });
    });

    return crepe;
  }, []);

  // Инициализация Milkdown Crepe
  useEffect(() => {
    if (!editorRef.current) return;

    const gen = ++genRef.current;
    const crepe = buildCrepe(editorRef.current, content, baseDir);
    crepe.create().then(() => {
      if (gen !== genRef.current) {
        // Эффект уже размонтирован или вытеснен — уничтожаем осиротевший экземпляр
        crepe.destroy();
        return;
      }
      crepeRef.current = crepe;
      handleRef.current.editor = crepe.editor;
    });

    return () => {
      genRef.current++;
      handleRef.current.editor = null;
      interactionCleanupRef.current?.();
      crepe.destroy();
      crepeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildCrepe]);

  // Обновление содержимого при загрузке нового файла
  useEffect(() => {
    if (crepeRef.current && content !== contentRef.current) {
      contentRef.current = content;
      const root = editorRef.current;
      if (!root) return;

      const gen = ++genRef.current;
      handleRef.current.editor = null;
      const oldCrepe = crepeRef.current;
      oldCrepe.destroy().then(() => {
        if (gen !== genRef.current) return;
        const newCrepe = buildCrepe(root, content, baseDir);
        newCrepe.create().then(() => {
          if (gen !== genRef.current) {
            newCrepe.destroy();
            return;
          }
          crepeRef.current = newCrepe;
          handleRef.current.editor = newCrepe.editor;
        });
      });
    }
  }, [content, baseDir, buildCrepe, handleRef]);

  // Синхронизация source → store при переключении обратно в visual
  const prevMode = useRef(editorMode);
  useEffect(() => {
    if (prevMode.current === 'source' && editorMode === 'visual') {
      const root = editorRef.current;
      if (!root || !crepeRef.current) {
        prevMode.current = editorMode;
        return;
      }
      const currentContent = contentRef.current;
      const gen = ++genRef.current;
      handleRef.current.editor = null;
      const oldCrepe = crepeRef.current;
      oldCrepe.destroy().then(() => {
        if (gen !== genRef.current) return;
        const newCrepe = buildCrepe(root, currentContent, baseDir);
        newCrepe.create().then(() => {
          if (gen !== genRef.current) {
            newCrepe.destroy();
            return;
          }
          crepeRef.current = newCrepe;
          handleRef.current.editor = newCrepe.editor;
        });
      });
    }
    prevMode.current = editorMode;
  }, [editorMode, baseDir, buildCrepe, handleRef]);

  useEffect(() => {
    if (editorMode !== 'source') return;
    setSourceContent(normalizeMarkdownForSource(content));
  }, [content, editorMode]);

  // Динамическое обновление шрифта и размера через CSS-переменные
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.style.setProperty('--editor-font-size', `${fontSize}px`);
      editorRef.current.style.setProperty('--editor-font-family', `'${fontFamily}'`);
    }
  }, [fontFamily, fontSize]);

  // Динамическое обновление ширины страницы
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.setProperty('--page-max-width', `${pageWidth}px`);
    }
  }, [pageWidth]);

  // Обработка ввода в source-режиме
  const handleSourceChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setSourceContent(value);
    contentRef.current = value;
    setContentRef.current(value);
  }, []);

  // Callback ref для textarea — публикует ссылку в EditorContext
  const setSourceRef = useCallback((el: HTMLTextAreaElement | null) => {
    sourceRef.current = el;
    handleRef.current.sourceTextarea = el;
  }, [handleRef]);

  return (
    <div ref={containerRef} className="editor-container">
      <div
        ref={editorRef}
        className="editor-root"
        style={{ display: editorMode === 'visual' ? 'block' : 'none' }}
      />
      {editorMode === 'source' && (
        <textarea
          ref={setSourceRef}
          className="editor-source"
          value={sourceContent}
          onChange={handleSourceChange}
          spellCheck={false}
        />
      )}
    </div>
  );
}
