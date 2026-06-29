import { convertFileSrc } from '@tauri-apps/api/core';
import { dirname, join } from '@tauri-apps/api/path';
import { exists } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';

// Максимальная глубина поиска папки assets/ вверх по дереву директорий
const MAX_DEPTH = 5;

// Найти базовую директорию, содержащую папку assets/.
// Идёт вверх от директории файла, проверяя наличие assets/ на каждом уровне.
// Возвращает найденную директорию или родительскую директорию файла как fallback.
export async function findBaseDir(filePath: string): Promise<string> {
  const fileDir = await dirname(filePath);

  try {
    let dir = fileDir;
    for (let i = 0; i < MAX_DEPTH; i++) {
      const assetsPath = await join(dir, 'assets');
      if (await exists(assetsPath)) {
        return dir;
      }
      const parent = await dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch (e) {
    console.warn('[paths] findBaseDir: ошибка, fallback на директорию файла', e);
  }

  return fileDir;
}

export function dirnameFromFilePath(filePath: string | null): string | null {
  if (!filePath) return null;

  const slashIndex = filePath.lastIndexOf('/');
  const backslashIndex = filePath.lastIndexOf('\\');
  const index = Math.max(slashIndex, backslashIndex);

  if (index < 0) return null;
  if (index === 0) return filePath.slice(0, 1);
  if (index === 2 && /^[a-z]:/i.test(filePath)) return filePath.slice(0, index + 1);
  return filePath.slice(0, index);
}

// Для уже существующих markdown-ссылок база — директория самого .md-файла.
// baseDir остаётся fallback для новых/несохранённых документов и assets/.
export function resolveMarkdownImageBaseDir(
  filePath: string | null,
  baseDir: string | null,
): string | null {
  return dirnameFromFilePath(filePath) ?? baseDir;
}

const DISPLAYABLE_URL_RE = /^(https?:|data:|blob:|asset:)/i;

// Преобразовать относительный путь изображения в абсолютный локальный путь.
// Абсолютные URL (http/https/data/blob/asset) возвращаются без изменений.
export async function resolveLocalImagePath(src: string, baseDir: string | null): Promise<string> {
  if (!src || DISPLAYABLE_URL_RE.test(src)) return src;
  if (!baseDir) return src;

  return join(baseDir, src);
}

// Преобразовать относительный путь изображения в URL для отображения в webview.
// Абсолютные URL (http/https/data/blob/asset) возвращаются без изменений.
export async function resolveImageSrc(src: string, baseDir: string | null): Promise<string> {
  if (!src || DISPLAYABLE_URL_RE.test(src)) return src;
  if (!baseDir) return src;

  const absolutePath = await resolveLocalImagePath(src, baseDir);
  return convertFileSrc(absolutePath);
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'apng', 'avif', 'tiff', 'tif', 'heic'];

// Открыть диалог выбора файла в папке assets/ и вернуть готовый markdown.
// Для картинок: ![имя](assets/папка/файл.png)
// Для остальных: [имя](assets/папка/файл.ext)
export async function pickAndFormatAsset(baseDir: string | null): Promise<string | null> {
  const defaultPath = baseDir ? await join(baseDir, 'assets') : undefined;

  const selected = await open({
    defaultPath,
    multiple: false,
    directory: false,
    filters: [{
      name: 'Assets',
      extensions: [
        ...IMAGE_EXTS,
        'pdf', 'zip', 'mp4', 'webm',
      ],
    }],
  });

  if (!selected || typeof selected !== 'string') return null;

  // Нормализовать слэши и найти assets/ в пути
  const normalized = selected.replace(/\\/g, '/');
  const idx = normalized.indexOf('/assets/');
  if (idx === -1) return null;

  const relativePath = normalized.substring(idx + 1); // "assets/папка/файл.png"
  const fileName = relativePath.split('/').pop() || '';
  const ext = (fileName.split('.').pop() || '').toLowerCase();

  if (IMAGE_EXTS.includes(ext)) {
    return `![${fileName}](${relativePath})`;
  }
  return `[${fileName}](${relativePath})`;
}
