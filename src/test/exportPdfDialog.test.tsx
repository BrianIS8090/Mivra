import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportPdfDialog } from '../../plugins/export-pdf/src/ExportPdfDialog';
import { createPdfBytes } from '../../plugins/export-pdf/src/pdfMakeClient';
import { useAppStore } from '../stores/appStore';
import type { MivraPluginApi } from '../plugins/types';

const pdfPreviewMocks = vi.hoisted(() => {
  const clearRect = vi.fn();
  const drawImage = vi.fn();

  return {
    clearRect,
    drawImage,
    getContext: vi.fn(() => ({ clearRect, drawImage })),
    renderPage: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
  };
});

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 2,
      getPage: vi.fn(async () => ({
        getViewport: vi.fn(() => ({ width: 420, height: 594 })),
        render: pdfPreviewMocks.renderPage,
      })),
      destroy: vi.fn(),
    }),
    destroy: vi.fn(),
  })),
}));

vi.mock('pdfjs-dist/build/pdf.worker.mjs?url', () => ({
  default: '/pdf.worker.mjs',
}));

vi.mock('../../plugins/export-pdf/src/pdfMakeClient', () => ({
  createPdfBytes: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
}));

const mockedCreatePdfBytes = vi.mocked(createPdfBytes);

const api = {
  dialogs: {
    close: vi.fn(),
  },
  document: {
    getContent: () => useAppStore.getState().content,
    getFilePath: () => useAppStore.getState().filePath,
    subscribeContent: (callback: (content: string) => void) => {
      let previous = useAppStore.getState().content;
      return useAppStore.subscribe((state) => {
        if (state.content === previous) return;
        previous = state.content;
        callback(state.content);
      });
    },
  },
  exports: {
    savePdfBytes: vi.fn(),
  },
} as unknown as MivraPluginApi;

function createDeferredBytes() {
  let resolve!: (value: Uint8Array) => void;
  const promise = new Promise<Uint8Array>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('ExportPdfDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: pdfPreviewMocks.getContext,
    });
    pdfPreviewMocks.renderPage.mockImplementation(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
    let urlIndex = 0;
    mockedCreatePdfBytes.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    URL.createObjectURL = vi.fn(() => {
      urlIndex += 1;
      return `blob:pdf-preview-${urlIndex}`;
    });
    URL.revokeObjectURL = vi.fn();
    useAppStore.setState({
      content: '# PDF\n\nТекст',
      filePath: 'C:/docs/pdf.md',
    });
  });

  it('показывает PDF-preview управляемыми страницами вместо iframe', async () => {
    render(<ExportPdfDialog api={api} />);

    expect(screen.queryByText(/Листов:/)).not.toBeInTheDocument();

    const preview = await screen.findByTestId('export-pdf-preview-scroll');
    await waitFor(() => expect(screen.getAllByTestId('export-pdf-page')).toHaveLength(2));

    expect(preview).toBeInTheDocument();
    expect(screen.queryByTitle('Предпросмотр PDF')).not.toBeInTheDocument();
  });

  it('позволяет вручную менять размер окна Export PDF', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1100 });

    render(<ExportPdfDialog api={api} />);

    const dialog = screen.getByRole('dialog', { name: 'Export PDF' });
    const resizeHandle = screen.getByLabelText('Изменить размер окна Export PDF');

    expect(dialog).toHaveStyle({ width: '1440px', height: '1000px' });

    fireEvent.pointerDown(resizeHandle, { clientX: 1000, clientY: 700, pointerId: 1 });
    fireEvent(window, new MouseEvent('pointermove', { clientX: 900, clientY: 650 }));

    expect(dialog).toHaveStyle({ width: '1340px', height: '950px' });

    fireEvent(window, new MouseEvent('pointerup'));
    expect(window.localStorage.getItem('mivra.exportPdf.dialogSize')).toBe('{"width":1340,"height":950}');
  });

  it('рисует страницы PDF-preview сразу на белом фоне', async () => {
    render(<ExportPdfDialog api={api} />);

    await waitFor(() => expect(pdfPreviewMocks.renderPage).toHaveBeenCalled());

    expect(pdfPreviewMocks.renderPage.mock.calls.every(([params]) => (
      (params as { background?: string }).background === '#ffffff'
    ))).toBe(true);
  });

  it('готовит новый лист во временном canvas перед заменой видимого preview', async () => {
    render(<ExportPdfDialog api={api} />);

    await waitFor(() => expect(screen.getAllByTestId('export-pdf-page')).toHaveLength(2));
    await waitFor(() => expect(pdfPreviewMocks.renderPage).toHaveBeenCalledTimes(2));

    const visibleCanvases = screen
      .getAllByTestId('export-pdf-page')
      .map((page) => page.querySelector('canvas'));
    const renderCanvases = pdfPreviewMocks.renderPage.mock.calls.map(([params]) => (
      (params as { canvas?: HTMLCanvasElement }).canvas
    ));

    expect(renderCanvases).toHaveLength(2);
    expect(renderCanvases.every((canvas) => canvas instanceof HTMLCanvasElement)).toBe(true);
    expect(renderCanvases.some((canvas) => visibleCanvases.includes(canvas ?? null))).toBe(false);
    expect(pdfPreviewMocks.drawImage).toHaveBeenCalledTimes(2);
  });

  it('показывает числовое значение для каждого ползунка', async () => {
    render(<ExportPdfDialog api={api} />);
    await screen.findByTestId('export-pdf-preview-scroll');

    const sliders = screen.getAllByRole('slider');
    const values = screen.queryAllByTestId('export-pdf-range-value');

    expect(sliders).toHaveLength(7);
    expect(values).toHaveLength(sliders.length);
    expect(values.map((value) => value.textContent)).toEqual([
      '20 мм',
      '18 мм',
      '22 мм',
      '18 мм',
      '12 px',
      '86 %',
      '100 %',
    ]);

    fireEvent.change(sliders[4], { target: { value: '14.5' } });

    expect(screen.getByText('14.5 px')).toBeInTheDocument();
    await waitFor(() => expect(mockedCreatePdfBytes).toHaveBeenCalledTimes(2));
  });

  it('показывает несколько PDF-шрифтов и применяет выбранный шрифт', async () => {
    render(<ExportPdfDialog api={api} />);
    await screen.findByTestId('export-pdf-preview-scroll');

    const fontSelect = screen.getByRole('combobox', { name: 'PDF-шрифт' });
    const options = within(fontSelect).getAllByRole('option').map((option) => option.textContent);

    expect(options).toEqual([
      'Roboto',
      'DejaVu Sans',
      'DejaVu Serif',
      'DejaVu Sans Mono',
    ]);

    fireEvent.change(fontSelect, { target: { value: 'DejaVu Serif' } });

    expect(fontSelect).toHaveValue('DejaVu Serif');
    await waitFor(() => expect(mockedCreatePdfBytes).toHaveBeenCalledTimes(2));
  });

  it('не сбрасывает текущий PDF-preview, пока новый preview генерируется', async () => {
    const firstPreview = createDeferredBytes();
    const secondPreview = createDeferredBytes();
    mockedCreatePdfBytes
      .mockImplementationOnce(() => firstPreview.promise)
      .mockImplementationOnce(() => secondPreview.promise);

    render(<ExportPdfDialog api={api} />);

    firstPreview.resolve(new Uint8Array([37, 80, 68, 70]));

    const preview = await screen.findByTestId('export-pdf-preview-scroll');
    await waitFor(() => expect(screen.getAllByTestId('export-pdf-page')).toHaveLength(2));

    const fontSizeSlider = screen.getAllByRole('slider')[4];
    fireEvent.change(fontSizeSlider, { target: { value: '14.5' } });

    await waitFor(() => expect(mockedCreatePdfBytes).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('export-pdf-preview-scroll')).toBe(preview);
    expect(screen.getByText('Обновление...')).toBeInTheDocument();

    secondPreview.resolve(new Uint8Array([37, 80, 68, 70]));

    await waitFor(() => {
      expect(screen.queryByText('Обновление...')).not.toBeInTheDocument();
    });
  });

  it('сохраняет позицию прокрутки preview при обновлении страниц', async () => {
    render(<ExportPdfDialog api={api} />);

    const preview = await screen.findByTestId('export-pdf-preview-scroll');
    await waitFor(() => expect(mockedCreatePdfBytes).toHaveBeenCalledTimes(1));

    preview.scrollTop = 620;
    const fontSizeSlider = screen.getAllByRole('slider')[4];
    fireEvent.change(fontSizeSlider, { target: { value: '14.5' } });

    await waitFor(() => expect(mockedCreatePdfBytes).toHaveBeenCalledTimes(2));

    expect(screen.queryByTitle('Предпросмотр PDF')).not.toBeInTheDocument();
    expect(screen.getByTestId('export-pdf-preview-scroll')).toBe(preview);
    expect(preview.scrollTop).toBe(620);
  });
});
