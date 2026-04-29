import { useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import * as tauri from '../utils/tauri';
import { findBaseDir, pickAndFormatAsset } from '../utils/paths';
import { confirmUnsavedChanges } from '../utils/dialogs';

export function useFile() {
  // Селекторы Zustand вместо деструктуризации всего стора —
  // чтобы хук не ререндерился при изменении не относящихся к файлу полей.
  const filePath = useAppStore((s) => s.filePath);
  const baseDir = useAppStore((s) => s.baseDir);
  const content = useAppStore((s) => s.content);
  const isDirty = useAppStore((s) => s.isDirty);
  const setContent = useAppStore((s) => s.setContent);
  const loadContent = useAppStore((s) => s.loadContent);
  const setFilePath = useAppStore((s) => s.setFilePath);
  const setBaseDir = useAppStore((s) => s.setBaseDir);
  const setDirty = useAppStore((s) => s.setDirty);

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
      // loadContent ставит content и isDirty:false атомарно — без transient true
      loadContent(file.content);
    } catch (e) {
      // Пользователь отменил диалог открытия или произошла ошибка
      console.warn('[useFile] open cancelled or error:', e);
    }
  }, [confirmDiscardIfDirty, loadContent, setFilePath, setBaseDir]);

  const reload = useCallback(async () => {
    if (!filePath) return;
    if (!(await confirmDiscardIfDirty())) return;
    try {
      const text = await tauri.readFile(filePath);
      loadContent(text);
    } catch (e) {
      console.error('[useFile] reload error:', e);
    }
  }, [filePath, loadContent, confirmDiscardIfDirty]);

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
