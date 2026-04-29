import { useDeferredValue, useMemo } from 'react';
import { useAppStore } from '../../stores/appStore';
import { getTranslations, pluralize } from '../../i18n';
import './statusbar.css';

export function StatusBar() {
  const filePath = useAppStore((s) => s.filePath);
  const content = useAppStore((s) => s.content);
  const editorMode = useAppStore((s) => s.editorMode);
  const language = useAppStore((s) => s.language);
  const t = getTranslations(language);

  // Подсчёт слов и символов на отложенном значении content —
  // на быстром вводе React пропустит лишние ререндеры StatusBar,
  // т.к. результат счёта не критичен для текущего кадра.
  const deferredContent = useDeferredValue(content);
  const { wordCount, charCount } = useMemo(() => {
    const trimmed = deferredContent.trim();
    return {
      wordCount: trimmed ? trimmed.split(/\s+/).length : 0,
      charCount: deferredContent.length,
    };
  }, [deferredContent]);

  const wordLabelStr = pluralize(wordCount, t.words);
  const charLabelStr = pluralize(charCount, t.chars);
  const modeLabel = editorMode === 'visual' ? t.visualMode : t.sourceMode;

  return (
    <div className="statusbar">
      <div className="statusbar-left">
        <span className="statusbar-path" title={filePath ?? ''}>
          {filePath ?? t.newFile}
        </span>
      </div>
      <div className="statusbar-right">
        <span className="statusbar-item">
          {modeLabel}
        </span>
        <span className="statusbar-item">
          {wordCount} {wordLabelStr} · {charCount} {charLabelStr}
        </span>
      </div>
    </div>
  );
}
