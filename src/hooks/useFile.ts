import { useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import * as tauri from '../utils/tauri';
import { findBaseDir, pickAndFormatAsset } from '../utils/paths';
import { confirmUnsavedChanges } from '../utils/dialogs';

export function useFile() {
  const {
    filePath,
    baseDir,
    content,
    isDirty,
    setContent,
    setFilePath,
    setBaseDir,
    setDirty,
  } = useAppStore();

  const saveAs = useCallback(async (): Promise<boolean> => {
    try {
      const path = await tauri.saveFileAs(content);
      if (path) {
        setFilePath(path);
        setDirty(false);
        return true;
      }
      // Пользователь отменил диалог "Сохранить как"
      return false;
    } catch (e) {
      console.error('[useFile] saveAs error:', e);
      return false;
    }
  }, [content, setDirty, setFilePath]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!filePath) {
      return saveAs();
    }
    try {
      await tauri.saveFile(filePath, content);
      setDirty(false);
      return true;
    } catch (e) {
      console.error('[useFile] save error:', e);
      return false;
    }
  }, [filePath, content, setDirty, saveAs]);

  // Если документ грязный, спрашивает пользователя.
  // Возвращает true, если можно продолжить (сохранили или discard); false — отменено.
  const confirmDiscardIfDirty = useCallback(async (): Promise<boolean> => {
    const state = useAppStore.getState();
    if (!state.isDirty) return true;

    const choice = await confirmUnsavedChanges(state.language);
    if (choice === 'cancel') return false;
    if (choice === 'save') {
      return save();
    }
    return true; // discard
  }, [save]);

  const open = useCallback(async () => {
    if (!(await confirmDiscardIfDirty())) return;
    try {
      const file = await tauri.openFile();
      // Вычислить baseDir ДО установки контента,
      // чтобы редактор пересоздался с корректным baseDir
      const base = await findBaseDir(file.path);
      setFilePath(file.path);
      setBaseDir(base);
      setContent(file.content);
      setDirty(false);
    } catch (e) {
      // Пользователь отменил диалог открытия или произошла ошибка
      console.warn('[useFile] open cancelled or error:', e);
    }
  }, [confirmDiscardIfDirty, setContent, setDirty, setFilePath, setBaseDir]);

  const reload = useCallback(async () => {
    if (!filePath) return;
    if (!(await confirmDiscardIfDirty())) return;
    try {
      const text = await tauri.readFile(filePath);
      setContent(text);
      setDirty(false);
    } catch (e) {
      console.error('[useFile] reload error:', e);
    }
  }, [filePath, setContent, setDirty, confirmDiscardIfDirty]);

  // Выбрать файл из assets/ и вернуть готовый markdown
  const insertAsset = useCallback(async (): Promise<string | null> => {
    try {
      return await pickAndFormatAsset(baseDir);
    } catch (e) {
      console.warn('[useFile] insertAsset cancelled or error:', e);
      return null;
    }
  }, [baseDir]);

  return { filePath, content, isDirty, open, save, saveAs, reload, insertAsset, setContent };
}
