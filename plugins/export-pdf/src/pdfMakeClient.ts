import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { PDF_EMBEDDED_FONTS, type PdfMakeFontFiles } from './pdfFonts';

declare global {
  interface Window {
    __mivraReadPluginAssetBytes?: (assetUrl: string) => Promise<Uint8Array>;
  }
}

type PdfDocument = {
  getBlob: () => Promise<Blob>;
};

type PdfMakeRuntime = {
  addVirtualFileSystem?: (fonts: unknown) => void;
  addFonts?: (fonts: Record<string, PdfMakeFontFiles>) => void;
  createPdf: (definition: TDocumentDefinitions) => PdfDocument;
};

const fontVfsPromises = new Map<string, Promise<Record<string, string>>>();

function readDefaultExport<T>(module: T | { default: T }): T {
  if (typeof module === 'object' && module !== null && 'default' in module) {
    return module.default;
  }
  return module;
}

function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Не удалось прочитать PDF Blob'));
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error('Неожиданный формат PDF Blob'));
        return;
      }
      resolve(new Uint8Array(reader.result));
    };
    reader.readAsArrayBuffer(blob);
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

async function fontAssetToBase64(url: string): Promise<string> {
  if (window.__mivraReadPluginAssetBytes) {
    try {
      return bytesToBase64(await window.__mivraReadPluginAssetBytes(url));
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'plugin_asset_url_unknown') {
        throw new Error(`Не удалось загрузить шрифт для PDF-кода: ${String(error)}`);
      }
    }
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Не удалось загрузить шрифт для PDF-кода: ${response.status}`);
  }

  return bytesToBase64(new Uint8Array(await response.arrayBuffer()));
}

function loadFontVfs(fontName: string): Promise<Record<string, string>> {
  const font = PDF_EMBEDDED_FONTS[fontName];
  const cached = fontVfsPromises.get(fontName);

  if (cached) return cached;

  const promise = Promise.all(
    (Object.keys(font.urls) as Array<keyof PdfMakeFontFiles>).map(async (weight) => [
      font.files[weight],
      await fontAssetToBase64(font.urls[weight]),
    ] as const),
  ).then((entries) => Object.fromEntries(entries));

  fontVfsPromises.set(fontName, promise);
  return promise;
}

async function registerEmbeddedFontsIfNeeded(
  pdfMake: PdfMakeRuntime,
  definition: TDocumentDefinitions,
): Promise<void> {
  const serialized = JSON.stringify(definition);
  const usedFonts = Object.entries(PDF_EMBEDDED_FONTS)
    .filter(([fontName]) => serialized.includes(`"font":"${fontName}"`));

  if (usedFonts.length === 0) return;

  const vfs = await Promise.all(usedFonts.map(([fontName]) => loadFontVfs(fontName)));
  pdfMake.addVirtualFileSystem?.(Object.assign({}, ...vfs));
  pdfMake.addFonts?.(Object.fromEntries(
    usedFonts.map(([fontName, font]) => [fontName, font.files]),
  ));
}

export async function createPdfBytes(definition: TDocumentDefinitions): Promise<Uint8Array> {
  const [pdfMakeModule, pdfFontsModule] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);
  const pdfMake = readDefaultExport(pdfMakeModule) as PdfMakeRuntime;
  const pdfFonts = readDefaultExport(pdfFontsModule);

  pdfMake.addVirtualFileSystem?.(pdfFonts);
  await registerEmbeddedFontsIfNeeded(pdfMake, definition);
  const blob = await pdfMake.createPdf(definition).getBlob();
  return blobToBytes(blob);
}
