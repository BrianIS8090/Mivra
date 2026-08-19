import { useState, useEffect } from 'react';
import { useSettings } from '../../hooks/useSettings';
import { useAppStore } from '../../stores/appStore';
import { getTranslations } from '../../i18n';
import './toolbar.css';

const FONT_OPTIONS = [
  'Segoe UI Variable',
  'Cascadia Code',
  'Consolas',
  'Arial',
  'Georgia',
  'Times New Roman',
  'Courier New',
];

// Тулбар после слимминга (спека M1): только редактура документа —
// шрифт, размер, ширина страницы, режим редактора, автосохранение.
// Файловые действия, тема, плагины, S3, справка и язык переехали в MenuBar,
// диалоги Help/S3/PluginManager принадлежат ему же.
export function Toolbar() {
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);
  const { fontFamily, fontSize, language, pageWidth, autosave, changeFontFamily, changeFontSize, changePageWidth, changeAutosave } = useSettings();
  const [pageWidthDraft, setPageWidthDraft] = useState(String(pageWidth));

  // Синхронизация при внешнем изменении (загрузка настроек)
  useEffect(() => {
    setPageWidthDraft(String(pageWidth));
  }, [pageWidth]);

  const commitPageWidth = () => {
    const num = parseInt(pageWidthDraft, 10);
    if (!isNaN(num)) {
      changePageWidth(num);
      setPageWidthDraft(String(Math.max(400, Math.min(1600, num))));
    } else {
      setPageWidthDraft(String(pageWidth));
    }
  };
  const editorMode = useAppStore((s) => s.editorMode);
  const setEditorMode = useAppStore((s) => s.setEditorMode);

  const t = getTranslations(language);

  const modeLabel = editorMode === 'visual' ? t.visualMode : t.sourceMode;

  const selectFontFamily = (family: string) => {
    changeFontFamily(family);
    setIsFontMenuOpen(false);
  };

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <div
          className="toolbar-font-select"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setIsFontMenuOpen(false);
            }
          }}
        >
          <button
            type="button"
            className="toolbar-font-select-trigger"
            title={t.fontTooltip}
            aria-haspopup="listbox"
            aria-expanded={isFontMenuOpen}
            onClick={() => setIsFontMenuOpen((open) => !open)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setIsFontMenuOpen(false);
            }}
          >
            {fontFamily}
          </button>
          {isFontMenuOpen && (
            <div className="toolbar-font-select-menu" role="listbox" aria-label={t.fontTooltip}>
              {FONT_OPTIONS.map((font) => (
                <button
                  key={font}
                  type="button"
                  className={`toolbar-font-select-option${font === fontFamily ? ' toolbar-font-select-option-active' : ''}`}
                  role="option"
                  aria-selected={font === fontFamily}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectFontFamily(font)}
                >
                  {font}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="toolbar-font-size">
          <button
            className="toolbar-btn-sm"
            onClick={() => changeFontSize(fontSize - 1)}
            title={t.decreaseFontTooltip}
          >
            −
          </button>
          <span className="toolbar-font-size-value">{fontSize}</span>
          <button
            className="toolbar-btn-sm"
            onClick={() => changeFontSize(fontSize + 1)}
            title={t.increaseFontTooltip}
          >
            +
          </button>
        </div>

        <div className="toolbar-page-width-group">
          <input
            className="toolbar-page-width"
            type="text"
            inputMode="numeric"
            value={pageWidthDraft}
            onChange={(e) => setPageWidthDraft(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={commitPageWidth}
            onKeyDown={(e) => { if (e.key === 'Enter') commitPageWidth(); }}
            title={t.pageWidthTooltip}
          />
          <span className="toolbar-page-width-unit">px</span>
        </div>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={() => setEditorMode(editorMode === 'visual' ? 'source' : 'visual')}
          title={t.modeTooltip}
        >
          {modeLabel}
        </button>

        <button
          // Зелёная подсветка при включённом автосохранении — переиспользуем
          // существующий класс «ok»-состояния
          className={`toolbar-btn${autosave ? ' toolbar-btn-s3-ok' : ''}`}
          onClick={() => changeAutosave(!autosave)}
          title={t.autosaveTooltip}
          aria-pressed={autosave}
        >
          {t.autosave}
        </button>
      </div>
    </div>
  );
}
