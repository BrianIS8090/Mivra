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

type PdfImageObject = {
  width: number;
  height: number;
  kind: number;
  data: Uint8Array | Uint8ClampedArray;
};

type PdfImageRef =
  | { id: string }
  | { image: PdfImageObject };

type PdfOperatorList = {
  fnArray: number[];
  argsArray: unknown[][];
};

type PdfObjectStore = {
  get(id: string, callback?: (value: unknown) => void): unknown;
};

type PdfImagePage = {
  objs: PdfObjectStore;
  getOperatorList(): Promise<PdfOperatorList>;
};

type AssetApi = {
  saveBytes(input: {
    bytes: Uint8Array;
    filename: string;
    alt?: string;
    kind?: 'image' | 'file';
  }): Promise<{ markdown: string }>;
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

function isPdfImageObject(value: unknown): value is PdfImageObject {
  if (typeof value !== 'object' || value === null) return false;
  const image = value as Partial<PdfImageObject>;
  return (
    typeof image.width === 'number'
    && typeof image.height === 'number'
    && typeof image.kind === 'number'
    && ArrayBuffer.isView(image.data)
  );
}

export function pdfImageRefsFromOperatorList(
  operatorList: PdfOperatorList,
  xObjectImageOps: Set<number>,
  inlineImageOps: Set<number>,
): PdfImageRef[] {
  const refs: PdfImageRef[] = [];
  const seenIds = new Set<string>();

  operatorList.fnArray.forEach((operator, index) => {
    const args = operatorList.argsArray[index] ?? [];
    const firstArg = args[0];

    if (xObjectImageOps.has(operator) && typeof firstArg === 'string' && !seenIds.has(firstArg)) {
      seenIds.add(firstArg);
      refs.push({ id: firstArg });
      return;
    }

    if (inlineImageOps.has(operator) && isPdfImageObject(firstArg)) {
      refs.push({ image: firstArg });
    }
  });

  return refs;
}

function waitForPdfObject(store: PdfObjectStore, id: string): Promise<PdfImageObject | null> {
  return new Promise((resolve) => {
    const finish = (value: unknown) => {
      resolve(isPdfImageObject(value) ? value : null);
    };

    try {
      const value = store.get(id, finish);
      if (value !== undefined) {
        finish(value);
      }
    } catch {
      resolve(null);
    }
  });
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
      } else reject(new Error('pdf_image_render_failed'));
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
      } else reject(new Error('pdf_image_blob_read_failed'));
    };
    reader.readAsArrayBuffer(blob);
  });
}

function imageToRgba(image: PdfImageObject, context: CanvasRenderingContext2D): ImageData {
  const pixelCount = image.width * image.height;
  const imageData = context.createImageData(image.width, image.height);
  const rgba = imageData.data;

  if (image.kind === 3) {
    rgba.set(image.data.slice(0, rgba.length));
  } else if (image.kind === 2) {
    for (let sourceIndex = 0, targetIndex = 0; targetIndex < rgba.length; sourceIndex += 3, targetIndex += 4) {
      rgba[targetIndex] = image.data[sourceIndex] ?? 0;
      rgba[targetIndex + 1] = image.data[sourceIndex + 1] ?? 0;
      rgba[targetIndex + 2] = image.data[sourceIndex + 2] ?? 0;
      rgba[targetIndex + 3] = 255;
    }
  } else if (image.kind === 1) {
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const byte = image.data[pixel >> 3] ?? 0;
      const bit = 7 - (pixel & 7);
      const value = byte & (1 << bit) ? 255 : 0;
      const targetIndex = pixel * 4;
      rgba[targetIndex] = value;
      rgba[targetIndex + 1] = value;
      rgba[targetIndex + 2] = value;
      rgba[targetIndex + 3] = 255;
    }
  } else {
    throw new Error(`pdf_image_kind_unsupported:${image.kind}`);
  }

  return imageData;
}

export async function pdfImageObjectToMarkdown(input: {
  image: PdfImageObject;
  pageNumber: number;
  imageIndex: number;
  fileName: string;
  assets: AssetApi;
}): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = input.image.width;
  canvas.height = input.image.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('pdf_image_canvas_context_missing');
  }

  context.putImageData(imageToRgba(input.image, context), 0, 0);
  const blob = await canvasToBlob(canvas);
  const bytes = new Uint8Array(await blobToArrayBuffer(blob));
  const filename = `${safePdfBaseName(input.fileName)}-page-${input.pageNumber}-image-${input.imageIndex}.png`;

  return (await input.assets.saveBytes({
    bytes,
    filename,
    alt: `${input.fileName}, page ${input.pageNumber}, image ${input.imageIndex}`,
    kind: 'image',
  })).markdown;
}

export async function pdfPageImagesToMarkdown(input: {
  page: PdfImagePage;
  pageNumber: number;
  fileName: string;
  assets: AssetApi;
  xObjectImageOps: Set<number>;
  inlineImageOps: Set<number>;
}): Promise<string[]> {
  const operatorList = await input.page.getOperatorList();
  const refs = pdfImageRefsFromOperatorList(operatorList, input.xObjectImageOps, input.inlineImageOps);
  const markdown: string[] = [];

  for (const ref of refs) {
    const image = 'id' in ref ? await waitForPdfObject(input.page.objs, ref.id) : ref.image;
    if (!image) continue;
    markdown.push(await pdfImageObjectToMarkdown({
      image,
      pageNumber: input.pageNumber,
      imageIndex: markdown.length + 1,
      fileName: input.fileName,
      assets: input.assets,
    }));
  }

  return markdown;
}

export async function pdfFileToMarkdown(file: File, assets?: AssetApi): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  configurePdfWorker(pdfjs);
  const task = pdfjs.getDocument({ data: await file.arrayBuffer(), useWorkerFetch: false });
  const pdf = await task.promise;
  const pages: string[] = [];
  const xObjectImageOps = new Set([
    pdfjs.OPS.paintImageXObject,
    pdfjs.OPS.paintJpegXObject,
    pdfjs.OPS.paintImageXObjectRepeat,
  ].filter((value): value is number => typeof value === 'number'));
  const inlineImageOps = new Set([
    pdfjs.OPS.paintInlineImageXObject,
    pdfjs.OPS.paintInlineImageXObjectGroup,
  ].filter((value): value is number => typeof value === 'number'));

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageParts: string[] = [];

    if (assets && typeof document !== 'undefined') {
      pageParts.push(...await pdfPageImagesToMarkdown({
        page,
        pageNumber,
        fileName: file.name,
        assets,
        xObjectImageOps,
        inlineImageOps,
      }));
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
