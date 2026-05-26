import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

const PREVIEW_PAGE_SCALE = 1.15;

type PdfJsModule = typeof import('pdfjs-dist');

let pdfJsModulePromise: Promise<PdfJsModule> | null = null;

function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }

  return pdfJsModulePromise;
}

type PdfPreviewPagesProps = {
  bytes: Uint8Array;
};

type PdfPreviewPageProps = {
  document: PDFDocumentProxy;
  pageNumber: number;
  pageCount: number;
};

type PageSize = {
  width: number;
  height: number;
};

function buildPageNumbers(pageCount: number): number[] {
  return Array.from({ length: pageCount }, (_, index) => index + 1);
}

function isRenderCancel(error: unknown): boolean {
  return error instanceof Error && error.name === 'RenderingCancelledException';
}

function PdfPreviewPage({ document, pageNumber, pageCount }: PdfPreviewPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pageSize, setPageSize] = useState<PageSize | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let renderTask: RenderTask | null = null;

    setError(null);

    document.getPage(pageNumber)
      .then((page) => {
        if (!active) return;
        const visibleCanvas = canvasRef.current;
        if (!visibleCanvas) return;

        const viewport = page.getViewport({ scale: PREVIEW_PAGE_SCALE });
        const pixelRatio = window.devicePixelRatio || 1;
        const width = Math.floor(viewport.width);
        const height = Math.floor(viewport.height);
        const renderCanvas = window.document.createElement('canvas');

        renderCanvas.width = Math.floor(viewport.width * pixelRatio);
        renderCanvas.height = Math.floor(viewport.height * pixelRatio);
        renderCanvas.style.width = `${width}px`;
        renderCanvas.style.height = `${height}px`;

        renderTask = page.render({
          canvas: renderCanvas,
          viewport,
          background: '#ffffff',
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });

        return renderTask.promise.then(() => {
          if (!active) return;
          const canvas = canvasRef.current;
          if (!canvas) return;

          const context = canvas.getContext('2d');
          if (!context) {
            throw new Error('Не удалось подготовить canvas предпросмотра PDF');
          }

          canvas.width = renderCanvas.width;
          canvas.height = renderCanvas.height;
          canvas.style.width = `${width}px`;
          canvas.style.height = `${height}px`;
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(renderCanvas, 0, 0);
          setPageSize({ width, height });
        });
      })
      .catch((e: unknown) => {
        if (active && !isRenderCancel(e)) {
          setError(e instanceof Error ? e.message : 'Не удалось отрисовать лист PDF');
        }
      });

    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [document, pageNumber]);

  return (
    <article
      className="export-pdf-preview-page"
      data-testid="export-pdf-page"
      style={pageSize ? { width: pageSize.width, minHeight: pageSize.height } : undefined}
    >
      <span className="export-pdf-preview-page-label">Лист {pageNumber} из {pageCount}</span>
      <canvas ref={canvasRef} className="export-pdf-preview-canvas" />
      {error && <div className="export-pdf-preview-page-error">{error}</div>}
    </article>
  );
}

export function PdfPreviewPages({ bytes }: PdfPreviewPagesProps) {
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumbers, setPageNumbers] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    setError(null);

    loadPdfJs()
      .then((pdfjs) => {
        if (!active) return null;
        loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes) });
        return loadingTask.promise;
      })
      .then((nextDocument) => {
        if (!nextDocument) return;
        if (!active) {
          void nextDocument.destroy();
          return;
        }

        const previousDocument = documentRef.current;
        documentRef.current = nextDocument;
        setDocument(nextDocument);
        setPageNumbers(buildPageNumbers(nextDocument.numPages));
        if (previousDocument) void previousDocument.destroy();
      })
      .catch((e: unknown) => {
        if (active) {
          setError(e instanceof Error ? e.message : 'Не удалось открыть PDF для предпросмотра');
        }
      });

    return () => {
      active = false;
      if (loadingTask) void loadingTask.destroy();
    };
  }, [bytes]);

  useEffect(() => () => {
    if (documentRef.current) {
      void documentRef.current.destroy();
      documentRef.current = null;
    }
  }, []);

  if (error) {
    return <div className="export-pdf-preview-state export-pdf-error">{error}</div>;
  }

  if (!document) {
    return <div className="export-pdf-preview-state">Подготовка страниц PDF...</div>;
  }

  return (
    <div className="export-pdf-preview-pages">
      {pageNumbers.map((pageNumber) => (
        <PdfPreviewPage
          key={pageNumber}
          document={document}
          pageNumber={pageNumber}
          pageCount={pageNumbers.length}
        />
      ))}
    </div>
  );
}
