import { readLocalFileBytes } from './tauri';

const MIME_BY_EXT: Record<string, string> = {
  apng: 'image/apng',
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  heic: 'image/heic',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  webp: 'image/webp',
};

export function imageMimeTypeFromPath(path: string): string {
  const cleanPath = path.split(/[?#]/, 1)[0] ?? '';
  const ext = cleanPath.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export async function localImagePathToDataUrl(path: string): Promise<string> {
  const bytes = await readLocalFileBytes(path);
  return `data:${imageMimeTypeFromPath(path)};base64,${bytesToBase64(bytes)}`;
}
