import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { MivraPluginApi } from '../../../src/plugins/types';
import { PdfPreviewPages } from './PdfPreviewPages';
import { buildExportPdfFileName, buildPdfDocumentDefinition } from './pdfDefinition';
import { PDF_FONT_OPTIONS } from './pdfFonts';
import { createPdfBytes } from './pdfMakeClient';
import { exportPdfPresets, modernPreset } from './presets';
import type { ExportPdfPresetId, ExportPdfSettings } from './types';
import '../../../src/components/Dialog/dialog.css';
import './export-pdf.css';

const DIALOG_ID = 'export-pdf-dialog';
const PREVIEW_REBUILD_DELAY_MS = 250;
const DIALOG_SIZE_STORAGE_KEY = 'mivra.exportPdf.dialogSize';
const DIALOG_VIEWPORT_GAP = 24;
const DEFAULT_DIALOG_WIDTH = 1440;
const DEFAULT_DIALOG_HEIGHT = 1000;
const MIN_DIALOG_WIDTH = 760;
const MIN_DIALOG_HEIGHT = 560;
const marginLabels = {
  top: 'верхнее',
  right: 'правое',
  bottom: 'нижнее',
  left: 'левое',
} as const;

type Props = {
  api: MivraPluginApi;
};

type DialogSize = {
  width: number;
  height: number;
};

type RangeControlProps = {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
};

function todayRu(): string {
  return new Intl.DateTimeFormat('ru-RU').format(new Date());
}

function clampDialogSize(size: DialogSize): DialogSize {
  const maxWidth = Math.max(320, window.innerWidth - DIALOG_VIEWPORT_GAP);
  const maxHeight = Math.max(360, window.innerHeight - DIALOG_VIEWPORT_GAP);
  const minWidth = Math.min(MIN_DIALOG_WIDTH, maxWidth);
  const minHeight = Math.min(MIN_DIALOG_HEIGHT, maxHeight);

  return {
    width: Math.round(Math.min(Math.max(size.width, minWidth), maxWidth)),
    height: Math.round(Math.min(Math.max(size.height, minHeight), maxHeight)),
  };
}

function readDialogSize(): DialogSize {
  try {
    const rawSize = window.localStorage.getItem(DIALOG_SIZE_STORAGE_KEY);
    if (!rawSize) {
      return clampDialogSize({ width: DEFAULT_DIALOG_WIDTH, height: DEFAULT_DIALOG_HEIGHT });
    }

    const parsedSize = JSON.parse(rawSize) as Partial<DialogSize>;
    if (typeof parsedSize.width !== 'number' || typeof parsedSize.height !== 'number') {
      return clampDialogSize({ width: DEFAULT_DIALOG_WIDTH, height: DEFAULT_DIALOG_HEIGHT });
    }

    return clampDialogSize({ width: parsedSize.width, height: parsedSize.height });
  } catch {
    return clampDialogSize({ width: DEFAULT_DIALOG_WIDTH, height: DEFAULT_DIALOG_HEIGHT });
  }
}

function saveDialogSize(size: DialogSize): void {
  try {
    window.localStorage.setItem(DIALOG_SIZE_STORAGE_KEY, JSON.stringify(size));
  } catch {
    // Размер окна не критичен, если localStorage недоступен.
  }
}

function RangeControl({ label, value, unit, min, max, step, onChange }: RangeControlProps) {
  return (
    <label className="export-pdf-range-control">
      <span className="export-pdf-range-header">
        <span>{label}</span>
        <output className="export-pdf-range-value" data-testid="export-pdf-range-value">
          {value} {unit}
        </output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function ExportPdfDialog({ api }: Props) {
  const [content, setContent] = useState(() => api.document.getContent());
  const [filePath, setFilePath] = useState(() => api.document.getFilePath());
  const [dialogSize, setDialogSize] = useState<DialogSize>(() => readDialogSize());
  const [isExporting, setIsExporting] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const hasPreviewRef = useRef(false);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ExportPdfSettings>({
    ...modernPreset,
    titlePage: {
      ...modernPreset.titlePage,
      date: todayRu(),
    },
  });

  const pdfDefinition = useMemo(
    () => buildPdfDocumentDefinition(content, settings, { filePath }),
    [content, filePath, settings],
  );

  useEffect(() => {
    setContent(api.document.getContent());
    setFilePath(api.document.getFilePath());
    return api.document.subscribeContent((nextContent) => {
      setContent(nextContent);
      setFilePath(api.document.getFilePath());
    });
  }, [api]);

  useEffect(() => {
    let active = true;

    setIsPreviewLoading(true);
    setPreviewError(null);

    const timeoutId = window.setTimeout(() => {
      createPdfBytes(pdfDefinition)
        .then((bytes) => {
          if (!active) return;
          hasPreviewRef.current = true;
          setPreviewBytes(bytes);
        })
        .catch((e) => {
          if (!active) return;
          setPreviewError(e instanceof Error ? e.message : 'Не удалось создать предпросмотр PDF');
        })
        .finally(() => {
          if (active) setIsPreviewLoading(false);
        });
    }, hasPreviewRef.current ? PREVIEW_REBUILD_DELAY_MS : 0);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [pdfDefinition]);

  useEffect(() => {
    const fitDialogToViewport = () => {
      setDialogSize((current) => {
        const nextSize = clampDialogSize(current);
        saveDialogSize(nextSize);
        return nextSize;
      });
    };

    window.addEventListener('resize', fitDialogToViewport);
    return () => window.removeEventListener('resize', fitDialogToViewport);
  }, []);

  useEffect(() => () => {
    resizeCleanupRef.current?.();
  }, []);

  const setPreset = (preset: ExportPdfPresetId) => {
    setSettings({
      ...exportPdfPresets[preset],
      titlePage: {
        ...exportPdfPresets[preset].titlePage,
        title: settings.titlePage.title,
        author: settings.titlePage.author,
        date: settings.titlePage.date,
      },
    });
  };

  const exportPdf = async () => {
    setIsExporting(true);
    setError(null);
    try {
      const bytes = await createPdfBytes(pdfDefinition);
      await api.exports.savePdfBytes(bytes, buildExportPdfFileName(settings, filePath));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать PDF');
    } finally {
      setIsExporting(false);
    }
  };

  const beginDialogResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = dialogSize;

    resizeCleanupRef.current?.();

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // В тестовой среде и некоторых WebView API может быть недоступен.
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextSize = clampDialogSize({
        width: startSize.width + moveEvent.clientX - startX,
        height: startSize.height + moveEvent.clientY - startY,
      });
      setDialogSize(nextSize);
      saveDialogSize(nextSize);
    };

    const stopResize = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      resizeCleanupRef.current = null;
    };

    resizeCleanupRef.current = stopResize;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
  };

  const resizeDialogWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 80 : 32;
    const changes: Record<string, DialogSize> = {
      ArrowRight: { width: step, height: 0 },
      ArrowLeft: { width: -step, height: 0 },
      ArrowDown: { width: 0, height: step },
      ArrowUp: { width: 0, height: -step },
    };
    const change = changes[event.key];
    if (!change) return;

    event.preventDefault();
    setDialogSize((current) => {
      const nextSize = clampDialogSize({
        width: current.width + change.width,
        height: current.height + change.height,
      });
      saveDialogSize(nextSize);
      return nextSize;
    });
  };

  return (
    <div className="dialog-overlay" onClick={() => api.dialogs.close(DIALOG_ID)}>
      <div
        className="export-pdf"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-pdf-title"
        style={{ width: `${dialogSize.width}px`, height: `${dialogSize.height}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        <aside className="export-pdf-panel">
          <div className="export-pdf-header">
            <div>
              <h2 id="export-pdf-title">Export PDF</h2>
              <span>Предпросмотр PDF</span>
            </div>
            <button className="dialog-btn dialog-btn-ghost" onClick={() => api.dialogs.close(DIALOG_ID)}>Закрыть</button>
          </div>

          <section>
            <h3>Пресет</h3>
            <select value={settings.preset} onChange={(e) => setPreset(e.target.value as ExportPdfPresetId)}>
              <option value="modern">Modern</option>
              <option value="academic">Academic</option>
              <option value="tech">Tech</option>
              <option value="elegant">Elegant</option>
            </select>
          </section>

          <section>
            <h3>Лист</h3>
            <label>Размер
              <select
                value={settings.page.size}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  page: { ...current.page, size: e.target.value as ExportPdfSettings['page']['size'] },
                }))}
              >
                <option value="a4">A4</option>
                <option value="letter">Letter</option>
                <option value="a5">A5</option>
              </select>
            </label>
            <label>Ориентация
              <select
                value={settings.page.orientation}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  page: { ...current.page, orientation: e.target.value as ExportPdfSettings['page']['orientation'] },
                }))}
              >
                <option value="portrait">Книжная</option>
                <option value="landscape">Альбомная</option>
              </select>
            </label>
            {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
              <RangeControl
                key={side}
                label={`Поле ${marginLabels[side]}`}
                value={settings.page.margins[side]}
                unit="мм"
                min={5}
                max={50}
                onChange={(value) => setSettings((current) => ({
                  ...current,
                  page: {
                    ...current.page,
                    margins: { ...current.page.margins, [side]: value },
                  },
                }))}
              />
            ))}
          </section>

          <section>
            <h3>Титульный лист</h3>
            <label className="export-pdf-checkline">
              <input
                type="checkbox"
                checked={settings.titlePage.enabled}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  titlePage: { ...current.titlePage, enabled: e.target.checked },
                }))}
              />
              Включить
            </label>
            <input
              placeholder="Название"
              value={settings.titlePage.title}
              onChange={(e) => setSettings((current) => ({
                ...current,
                titlePage: { ...current.titlePage, title: e.target.value },
              }))}
            />
            <input
              placeholder="Автор"
              value={settings.titlePage.author}
              onChange={(e) => setSettings((current) => ({
                ...current,
                titlePage: { ...current.titlePage, author: e.target.value },
              }))}
            />
            <input
              placeholder="Дата"
              value={settings.titlePage.date}
              onChange={(e) => setSettings((current) => ({
                ...current,
                titlePage: { ...current.titlePage, date: e.target.value },
              }))}
            />
          </section>

          <section>
            <h3>Колонтитулы</h3>
            <label className="export-pdf-checkline">
              <input
                type="checkbox"
                checked={settings.header.enabled}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  header: { ...current.header, enabled: e.target.checked },
                }))}
              />
              Верхний колонтитул
            </label>
            <input
              placeholder="Header слева"
              value={settings.header.leftText}
              onChange={(e) => setSettings((current) => ({
                ...current,
                header: { ...current.header, leftText: e.target.value },
              }))}
            />
            <input
              placeholder="Header справа"
              value={settings.header.rightText}
              onChange={(e) => setSettings((current) => ({
                ...current,
                header: { ...current.header, rightText: e.target.value },
              }))}
            />
            <label className="export-pdf-checkline">
              <input
                type="checkbox"
                checked={settings.footer.enabled}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  footer: { ...current.footer, enabled: e.target.checked },
                }))}
              />
              Нижний колонтитул
            </label>
            <input
              placeholder="Footer слева"
              value={settings.footer.leftText}
              onChange={(e) => setSettings((current) => ({
                ...current,
                footer: { ...current.footer, leftText: e.target.value },
              }))}
            />
            <input
              placeholder="Footer справа"
              value={settings.footer.rightText}
              onChange={(e) => setSettings((current) => ({
                ...current,
                footer: { ...current.footer, rightText: e.target.value },
              }))}
            />
            <label>Нумерация
              <select
                value={settings.pageNumbers.position}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  pageNumbers: {
                    ...current.pageNumbers,
                    position: e.target.value as ExportPdfSettings['pageNumbers']['position'],
                  },
                }))}
              >
                <option value="bottom-center">Внизу по центру</option>
                <option value="bottom-left">Внизу слева</option>
                <option value="bottom-right">Внизу справа</option>
                <option value="top-center">Вверху по центру</option>
                <option value="top-left">Вверху слева</option>
                <option value="top-right">Вверху справа</option>
              </select>
            </label>
          </section>

          <section>
            <h3>Типографика</h3>
            <label>PDF-шрифт
              <select
                value={settings.typography.bodyFont}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  typography: {
                    ...current.typography,
                    bodyFont: e.target.value,
                    headingFont: e.target.value,
                  },
                }))}
              >
                {PDF_FONT_OPTIONS.map((font) => (
                  <option key={font.value} value={font.value}>{font.label}</option>
                ))}
              </select>
            </label>
            <RangeControl
              label="Размер текста"
              value={settings.typography.fontSize}
              unit="px"
              min={10}
              max={24}
              step={0.5}
              onChange={(value) => setSettings((current) => ({
                ...current,
                typography: { ...current.typography, fontSize: value },
              }))}
            />
            <label>Межстрочный интервал
              <select
                value={settings.typography.lineHeight}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  typography: { ...current.typography, lineHeight: Number(e.target.value) },
                }))}
              >
                <option value={1}>1.0</option>
                <option value={1.15}>1.15</option>
                <option value={1.3}>1.3</option>
                <option value={1.5}>1.5</option>
                <option value={2}>2.0</option>
              </select>
            </label>
            <label>Выравнивание
              <select
                value={settings.typography.textAlign}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  typography: { ...current.typography, textAlign: e.target.value as ExportPdfSettings['typography']['textAlign'] },
                }))}
              >
                <option value="left">По левому краю</option>
                <option value="justify">По ширине</option>
              </select>
            </label>
          </section>

          <section>
            <h3>Изображения</h3>
            <label className="export-pdf-checkline">
              <input
                type="checkbox"
                checked={settings.markdown.images.enabled}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  markdown: {
                    ...current.markdown,
                    images: { ...current.markdown.images, enabled: e.target.checked },
                  },
                }))}
              />
              Отображать
            </label>
            <RangeControl
              label="Максимальная ширина"
              value={settings.markdown.images.maxWidthPercent}
              unit="%"
              min={20}
              max={100}
              onChange={(value) => setSettings((current) => ({
                ...current,
                markdown: {
                  ...current.markdown,
                  images: { ...current.markdown.images, maxWidthPercent: value },
                },
              }))}
            />
            <label>Выравнивание
              <select
                value={settings.markdown.images.align}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  markdown: {
                    ...current.markdown,
                    images: { ...current.markdown.images, align: e.target.value as ExportPdfSettings['markdown']['images']['align'] },
                  },
                }))}
              >
                <option value="left">Слева</option>
                <option value="center">По центру</option>
              </select>
            </label>
          </section>

          <section>
            <h3>Markdown</h3>
            <label>Таблицы
              <select
                value={settings.markdown.tables.borderStyle}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  markdown: {
                    ...current.markdown,
                    tables: { ...current.markdown.tables, borderStyle: e.target.value as ExportPdfSettings['markdown']['tables']['borderStyle'] },
                  },
                }))}
              >
                <option value="grid">Сетка</option>
                <option value="rows">Полосы</option>
                <option value="minimal">Минимализм</option>
              </select>
            </label>
            <label className="export-pdf-checkline">
              <input
                type="checkbox"
                checked={settings.markdown.tables.zebra}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  markdown: {
                    ...current.markdown,
                    tables: { ...current.markdown.tables, zebra: e.target.checked },
                  },
                }))}
              />
              Чередование строк
            </label>
            <RangeControl
              label="Масштаб таблиц"
              value={settings.markdown.tables.scalePercent}
              unit="%"
              min={50}
              max={100}
              step={5}
              onChange={(value) => setSettings((current) => ({
                ...current,
                markdown: {
                  ...current.markdown,
                  tables: { ...current.markdown.tables, scalePercent: value },
                },
              }))}
            />
            <label>Фон кода
              <input
                type="color"
                value={settings.markdown.codeBlocks.background}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  markdown: {
                    ...current.markdown,
                    codeBlocks: { ...current.markdown.codeBlocks, background: e.target.value },
                  },
                }))}
              />
            </label>
            <label>Цитаты
              <input
                type="color"
                value={settings.markdown.blockquotes.barColor}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  markdown: {
                    ...current.markdown,
                    blockquotes: { ...current.markdown.blockquotes, barColor: e.target.value },
                  },
                }))}
              />
            </label>
          </section>

          <section>
            <h3>Разрывы</h3>
            <label className="export-pdf-checkline">
              <input
                type="checkbox"
                checked={settings.pageBreaks.beforeH1}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  pageBreaks: { ...current.pageBreaks, beforeH1: e.target.checked },
                }))}
              />
              Разрыв перед H1
            </label>
            <label className="export-pdf-checkline">
              <input
                type="checkbox"
                checked={settings.pageBreaks.avoidInsideBlocks}
                onChange={(e) => setSettings((current) => ({
                  ...current,
                  pageBreaks: { ...current.pageBreaks, avoidInsideBlocks: e.target.checked },
                }))}
              />
              Не разрывать таблицы и код
            </label>
          </section>

          <div className="export-pdf-actions">
            {error && <p className="export-pdf-error">{error}</p>}
            <button className="dialog-btn dialog-btn-primary" onClick={exportPdf} disabled={isExporting}>
              {isExporting ? 'Создание PDF...' : 'Export PDF'}
            </button>
          </div>
        </aside>

        <main className="export-pdf-preview">
          <div className="export-pdf-preview-scroll" data-testid="export-pdf-preview-scroll">
            {isPreviewLoading && !previewBytes && <div className="export-pdf-preview-state">Создание предпросмотра PDF...</div>}
            {previewError && <div className="export-pdf-preview-state export-pdf-error">{previewError}</div>}
            {previewBytes && <PdfPreviewPages bytes={previewBytes} />}
          </div>
          {isPreviewLoading && previewBytes && <div className="export-pdf-preview-badge">Обновление...</div>}
        </main>
        <button
          type="button"
          className="export-pdf-resize-handle"
          aria-label="Изменить размер окна Export PDF"
          title="Изменить размер окна"
          onPointerDown={beginDialogResize}
          onKeyDown={resizeDialogWithKeyboard}
        />
      </div>
    </div>
  );
}
