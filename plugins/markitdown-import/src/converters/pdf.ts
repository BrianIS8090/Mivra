import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

const pluginId = 'markitdown-import';

type PdfJsWithWorkerOptions = {
  GlobalWorkerOptions: {
    workerSrc: string;
  };
};

type PdfTextItem = {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
};

type PdfTextLine = {
  text: string;
  x: number;
  y: number;
  height: number;
};

type AssetApi = {
  saveBytes(input: {
    bytes: Uint8Array;
    filename: string;
    alt?: string;
    kind?: 'image' | 'file';
  }): Promise<{ markdown: string }>;
};

type PdfRenderablePage = {
  getViewport(input: { scale: number }): { width: number; height: number };
  render(input: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }): { promise: Promise<unknown> };
};

declare global {
  interface Window {
    __mivraResolvePluginAsset?: (pluginId: string, relativePath: string) => string;
  }
}

function workerAssetPath(workerUrl: string): string | null {
  const normalized = workerUrl.replace(/\\/g, '/');
  const assetsIndex = normalized.lastIndexOf('/assets/');
  if (assetsIndex >= 0) {
    return normalized.slice(assetsIndex + 1);
  }
  if (normalized.startsWith('assets/')) {
    return normalized;
  }
  if (normalized.startsWith('./assets/')) {
    return normalized.slice(2);
  }
  return null;
}

export function pdfPagesToMarkdown(pages: string[]): string {
  return pages
    .map((page, index) => `<!-- page ${index + 1} -->\n\n${page.trim()}`)
    .filter((page) => page.trim().length > 0)
    .join('\n\n');
}

function normalizePdfText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([«(])\s+/g, '$1')
    .replace(/\s+([»)])/g, '$1')
    .replace(/"\s+/g, '"')
    .replace(/\s+"/g, ' "')
    .replace(/\s+—\s+/g, ' — ')
    .replace(/\s+-\s+/g, '-')
    .trim();
}

function lineText(items: PdfTextItem[]): string {
  const sorted = [...items].sort((left, right) => left.transform[4] - right.transform[4]);
  let text = '';
  let previousEnd = Number.NaN;

  for (const item of sorted) {
    const value = item.str;
    if (!value) continue;

    const x = item.transform[4];
    const gap = x - previousEnd;
    if (text && !/^\s/.test(value) && gap > Math.max(1.5, (item.height ?? 9) * 0.15)) {
      text += ' ';
    }
    text += value;
    previousEnd = x + (item.width ?? 0);
  }

  return normalizePdfText(text);
}

function pdfTextItemsToLines(items: PdfTextItem[]): PdfTextLine[] {
  const sorted = items
    .filter((item) => item.str.trim().length > 0)
    .sort((left, right) => {
      const yDiff = right.transform[5] - left.transform[5];
      return Math.abs(yDiff) > 1 ? yDiff : left.transform[4] - right.transform[4];
    });
  const rows: PdfTextItem[][] = [];

  for (const item of sorted) {
    const y = item.transform[5];
    const height = item.height || Math.abs(item.transform[3]) || 9;
    const row = rows.find((candidate) => (
      Math.abs(candidate[0].transform[5] - y) <= Math.max(2, height * 0.45)
    ));

    if (row) {
      row.push(item);
    } else {
      rows.push([item]);
    }
  }

  return rows.map((row) => ({
    text: lineText(row),
    x: Math.min(...row.map((item) => item.transform[4])),
    y: Math.max(...row.map((item) => item.transform[5])),
    height: Math.max(...row.map((item) => item.height || Math.abs(item.transform[3]) || 9)),
  })).filter((line) => line.text.length > 0);
}

function markdownForLine(line: PdfTextLine): string {
  const bullet = line.text.match(/^[-–—]\s*(.+)$/);
  if (bullet) {
    return `- ${normalizePdfText(bullet[1])}`;
  }
  if (line.height >= 18) {
    return `# ${line.text}`;
  }
  if (line.height >= 10.5 && line.x < 90) {
    return `## ${line.text}`;
  }
  return line.text;
}

export function pdfTextItemsToMarkdown(items: PdfTextItem[]): string {
  const lines = pdfTextItemsToLines(items);
  const output: string[] = [];
  let previous: PdfTextLine | null = null;

  for (const line of lines) {
    const markdown = markdownForLine(line);
    const gap = previous ? previous.y - line.y : 0;
    if (
      output.length > 0
      && (
        markdown.startsWith('#')
        || output[output.length - 1].startsWith('#')
        || gap > Math.max(previous?.height ?? 9, line.height) * 1.6
      )
    ) {
      output.push('');
    }
    output.push(markdown);
    previous = line;
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function configurePdfWorker(
  pdfjs: PdfJsWithWorkerOptions,
  workerUrl: string = pdfWorkerUrl,
  moduleUrl: string = import.meta.url,
): void {
  const relativeWorkerPath = workerAssetPath(workerUrl);
  if (relativeWorkerPath && window.__mivraResolvePluginAsset) {
    pdfjs.GlobalWorkerOptions.workerSrc = window.__mivraResolvePluginAsset(pluginId, relativeWorkerPath);
    return;
  }

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(workerUrl, moduleUrl).toString();
}

function safePdfBaseName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    || 'pdf';
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('pdf_page_render_failed'));
      }
    }, 'image/png');
  });
}

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('pdf_page_blob_read_failed'));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('pdf_page_blob_read_failed'));
      }
    };
    reader.readAsArrayBuffer(blob);
  });
}

export async function pdfPageSnapshotToMarkdown(input: {
  page: PdfRenderablePage;
  pageNumber: number;
  fileName: string;
  assets: AssetApi;
}): Promise<string> {
  const viewport = input.page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('pdf_canvas_context_missing');
  }

  await input.page.render({ canvasContext: context, viewport }).promise;
  const blob = await canvasToBlob(canvas);
  const bytes = new Uint8Array(await blobToArrayBuffer(blob));
  const filename = `${safePdfBaseName(input.fileName)}-page-${input.pageNumber}.png`;

  return (await input.assets.saveBytes({
    bytes,
    filename,
    alt: `${input.fileName}, page ${input.pageNumber}`,
    kind: 'image',
  })).markdown;
}

export async function pdfFileToMarkdown(file: File, assets?: AssetApi): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  configurePdfWorker(pdfjs);
  const task = pdfjs.getDocument({ data: await file.arrayBuffer(), useWorkerFetch: false });
  const pdf = await task.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageParts: string[] = [];

    if (assets && typeof document !== 'undefined') {
      pageParts.push(await pdfPageSnapshotToMarkdown({ page, pageNumber, fileName: file.name, assets }));
    }

    pageParts.push(pdfTextItemsToMarkdown(textContent.items.filter((item) => 'str' in item) as PdfTextItem[]));
    pages.push(pageParts.filter((part) => part.trim().length > 0).join('\n\n'));
  }

  const markdown = pdfPagesToMarkdown(pages);
  if (!markdown) {
    throw new Error('pdf_text_layer_missing');
  }
  return markdown;
}
