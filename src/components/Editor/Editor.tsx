import { useEffect, useRef, useCallback } from 'react';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import { useAppStore } from '../../stores/appStore';
import { setActiveEditor } from '../../utils/editorBridge';
import { renderMermaidPreview } from '../../utils/mermaid';
import './editor.css';

function createCrepeConfig(defaultValue: string) {
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
    },
  };
}

export function Editor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const crepeRef = useRef<Crepe | null>(null);

  const content = useAppStore((s) => s.content);
  const setContent = useAppStore((s) => s.setContent);
  const fontFamily = useAppStore((s) => s.fontFamily);
  const fontSize = useAppStore((s) => s.fontSize);
  const pageWidth = useAppStore((s) => s.pageWidth);
  const editorMode = useAppStore((s) => s.editorMode);

  // Refs для стабильных колбэков
  const setContentRef = useRef(setContent);
  setContentRef.current = setContent;
  const contentRef = useRef(content);

  // Создание экземпляра Crepe
  const buildCrepe = useCallback((root: HTMLElement, value: string) => {
    const crepe = new Crepe({
      root,
      ...createCrepeConfig(value),
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        contentRef.current = markdown;
        setContentRef.current(markdown);
      });
    });

    return crepe;
  }, []);

  // Инициализация Milkdown Crepe
  useEffect(() => {
    if (!editorRef.current) return;

    const crepe = buildCrepe(editorRef.current, content);
    crepe.create().then(() => {
      crepeRef.current = crepe;
      setActiveEditor(crepe.editor);
    });

    return () => {
      setActiveEditor(null);
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

      setActiveEditor(null);
      crepeRef.current.destroy().then(() => {
        const crepe = buildCrepe(root, content);
        crepe.create().then(() => {
          crepeRef.current = crepe;
          setActiveEditor(crepe.editor);
        });
      });
    }
  }, [content, buildCrepe]);

  // Синхронизация source → store при переключении обратно в visual
  const prevMode = useRef(editorMode);
  useEffect(() => {
    if (prevMode.current === 'source' && editorMode === 'visual') {
      // Пересоздать Crepe с актуальным контентом
      const root = editorRef.current;
      if (!root || !crepeRef.current) return;
      const currentContent = contentRef.current;
      setActiveEditor(null);
      crepeRef.current.destroy().then(() => {
        const crepe = buildCrepe(root, currentContent);
        crepe.create().then(() => {
          crepeRef.current = crepe;
          setActiveEditor(crepe.editor);
        });
      });
    }
    prevMode.current = editorMode;
  }, [editorMode, buildCrepe]);

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
    contentRef.current = value;
    setContentRef.current(value);
  }, []);

  return (
    <div ref={containerRef} className="editor-container">
      <div
        ref={editorRef}
        className="editor-root"
        style={{ display: editorMode === 'visual' ? 'block' : 'none' }}
      />
      {editorMode === 'source' && (
        <textarea
          ref={sourceRef}
          className="editor-source"
          value={content}
          onChange={handleSourceChange}
          spellCheck={false}
        />
      )}
    </div>
  );
}
