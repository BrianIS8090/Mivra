import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../stores/appStore';
import * as tauri from '../utils/tauri';
import { useToast } from './useToast';

// Поддерживаемые расширения изображений (вставляются как ![](url))
const IMG_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp',
  'apng', 'avif', 'tiff', 'tif', 'heic',
]);
// Поддерживаемые расширения документов (вставляются как [name](url))
const DOC_EXTS = new Set(['pdf', 'zip', 'mp4', 'webm']);
// Порог предупреждения и жёсткий лимит размера
const SIZE_WARN = 10 * 1024 * 1024;
const SIZE_HARD = 100 * 1024 * 1024;

// Колбэк для вставки markdown-ссылки в редактор после успешной загрузки
export type InsertCallback = (name: string, url: string, isImage: boolean) => void;

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function isImage(name: string): boolean {
  return IMG_EXTS.has(extensionOf(name));
}

function isAccepted(name: string): boolean {
  const ext = extensionOf(name);
  return IMG_EXTS.has(ext) || DOC_EXTS.has(ext);
}

function nameWithoutExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(0, i) : name;
}

// Хук S3-загрузки. ready=true когда S3 настроен и Secret сохранён в keyring.
// uploadAndInsertBytes — загрузка из буфера обмена/drag-and-drop байтов.
// uploadAndInsertFile — загрузка по локальному пути (drag-and-drop файла).
export function useS3Upload(onInsert?: InsertCallback) {
  const s3 = useAppStore((s) => s.s3);
  const [secretExists, setSecretExists] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    if (!s3) {
      setSecretExists(false);
      return undefined;
    }
    tauri.s3SecretExists()
      .then((exists) => { if (!cancelled) setSecretExists(exists); })
      .catch(() => { if (!cancelled) setSecretExists(false); });
    return () => { cancelled = true; };
  }, [s3]);

  const ready = !!s3 && secretExists;

  const uploadAndInsertBytes = useCallback(
    async (bytes: Uint8Array, originalFilename: string) => {
      if (!s3 || !secretExists) {
        toast.show('S3 не настроен. Откройте настройки.', 'info');
        return;
      }
      if (!isAccepted(originalFilename)) {
        toast.show(`${originalFilename}: расширение не поддерживается`, 'error');
        return;
      }
      if (bytes.length > SIZE_HARD) {
        toast.show(`${originalFilename}: файл больше 100 MB`, 'error');
        return;
      }
      const id = toast.show(`Загрузка ${originalFilename}...`, 'loading');
      try {
        const url = await tauri.s3UploadBytes(bytes, originalFilename, s3);
        toast.update(id, 'Готово', 'success');
        onInsert?.(nameWithoutExt(originalFilename), url, isImage(originalFilename));
      } catch (e) {
        toast.update(id, `Ошибка: ${e}`, 'error');
      }
    },
    [s3, secretExists, toast, onInsert],
  );

  const uploadAndInsertFile = useCallback(
    async (localPath: string, originalFilename: string, sizeBytes?: number) => {
      if (!s3 || !secretExists) {
        toast.show('S3 не настроен. Откройте настройки.', 'info');
        return;
      }
      if (!isAccepted(originalFilename)) {
        toast.show(`${originalFilename}: расширение не поддерживается`, 'error');
        return;
      }
      if (sizeBytes !== undefined && sizeBytes > SIZE_HARD) {
        toast.show(`${originalFilename}: файл больше 100 MB`, 'error');
        return;
      }
      if (sizeBytes !== undefined && sizeBytes > SIZE_WARN) {
        const mb = (sizeBytes / 1024 / 1024).toFixed(1);
        if (!window.confirm(`Загрузить ${originalFilename} (${mb} MB)?`)) return;
      }
      const id = toast.show(`Загрузка ${originalFilename}...`, 'loading');
      try {
        const url = await tauri.s3UploadFile(localPath, originalFilename, s3);
        toast.update(id, 'Готово', 'success');
        onInsert?.(nameWithoutExt(originalFilename), url, isImage(originalFilename));
      } catch (e) {
        toast.update(id, `Ошибка: ${e}`, 'error');
      }
    },
    [s3, secretExists, toast, onInsert],
  );

  return { ready, uploadAndInsertBytes, uploadAndInsertFile };
}
