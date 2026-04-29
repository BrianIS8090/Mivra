import { useState, useEffect } from 'react';
import { useFile } from '../../hooks/useFile';
import { useSettings } from '../../hooks/useSettings';
import { useTheme } from '../../hooks/useTheme';
import { useMarkdownActions } from '../../hooks/useMarkdownActions';
import { useAppStore } from '../../stores/appStore';
import { getTranslations } from '../../i18n';
import { HelpDialog } from '../Help/HelpDialog';
import { S3SettingsDialog } from '../S3Settings/S3SettingsDialog';
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

export function Toolbar() {
  const [showHelp, setShowHelp] = useState(false);
  const [showS3, setShowS3] = useState(false);
  const { open, save, saveAs, reload, filePath } = useFile();
  const { fontFamily, fontSize, language, pageWidth, changeFontFamily, changeFontSize, changeLanguage, changePageWidth } = useSettings();
  const { insertAssetAction } = useMarkdownActions();
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
  const { theme, toggleTheme } = useTheme();
  const editorMode = useAppStore((s) => s.editorMode);
  const setEditorMode = useAppStore((s) => s.setEditorMode);
  
  const t = getTranslations(language);

  const themeLabel = theme === 'light' ? t.themeLight : theme === 'dark' ? t.themeDark : t.themeSystem;
  const modeLabel = editorMode === 'visual' ? t.visualMode : t.sourceMode;
  const langLabel = language === 'ru' ? 'RU' : 'EN';

  const toggleLanguage = () => {
    changeLanguage(language === 'ru' ? 'en' : 'ru');
  };

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-group">
          <button className="toolbar-btn" onClick={open} title={t.openTooltip}>
            {t.open}
          </button>
          <button className="toolbar-btn" onClick={save} title={t.saveTooltip}>
            {t.save}
          </button>
          <button className="toolbar-btn" onClick={saveAs} title={t.saveAsTooltip}>
            {t.saveAs}
          </button>
          <button className="toolbar-btn" onClick={() => window.print()} title={t.printTooltip}>
            {t.print}
          </button>
          <button
            className="toolbar-btn toolbar-btn-icon"
            onClick={reload}
            disabled={!filePath}
            title={t.reloadTooltip}
          >
            ↻
          </button>
          <button
            className="toolbar-btn"
            onClick={() => insertAssetAction()}
            disabled={!filePath}
            title={t.insertAssetTooltip}
          >
            {t.insertAsset}
          </button>
        </div>

        <div className="toolbar-separator" />

        <div className="toolbar-group">
          <select
            className="toolbar-select"
            value={fontFamily}
            onChange={(e) => changeFontFamily(e.target.value)}
            title={t.fontTooltip}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>

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
            onClick={toggleTheme}
            title={t.themeTooltip}
          >
            {themeLabel}
          </button>

          <button
            className="toolbar-btn"
            onClick={() => setEditorMode(editorMode === 'visual' ? 'source' : 'visual')}
            title={t.modeTooltip}
          >
            {modeLabel}
          </button>
        </div>

        <div className="toolbar-spacer" />

        <div className="toolbar-group">
          <button
            className="toolbar-btn"
            onClick={() => setShowS3(true)}
          >
            {t.s3Button}
          </button>
          <button
            className="toolbar-btn"
            onClick={() => setShowHelp(true)}
          >
            {t.help}
          </button>
          <button
            className="toolbar-btn toolbar-lang-btn"
            onClick={toggleLanguage}
            title={language === 'ru' ? 'Switch to English' : 'Переключить на русский'}
          >
            {langLabel}
          </button>
        </div>
      </div>

      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
      {showS3 && <S3SettingsDialog onClose={() => setShowS3(false)} />}
    </>
  );
}
