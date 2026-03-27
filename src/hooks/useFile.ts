import { useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import * as tauri from '../utils/tauri';

export function useFile() {
  const {
    filePath,
    content,
    isDirty,
    setContent,
    setFilePath,
    setDirty,
  } = useAppStore();

  const open = useCallback(async () => {
    try {
      const file = await tauri.openFile();
      setFilePath(file.path);
      setContent(file.content);
      setDirty(false);
    } catch {
      // Пользователь отменил диалог или произошла ошибка
    }
  }, [setContent, setDirty, setFilePath]);

  const save = useCallback(async () => {
    if (!filePath) {
      return saveAs();
    }
    try {
      await tauri.saveFile(filePath, content);
      setDirty(false);
    } catch (e) {
      console.error('Ошибка сохранения:', e);
    }
  }, [filePath, content, setDirty]);

  const saveAs = useCallback(async () => {
    try {
      const path = await tauri.saveFileAs(content);
      if (path) {
        setFilePath(path);
        setDirty(false);
      }
    } catch (e) {
      console.error('Ошибка сохранения:', e);
    }
  }, [content, setDirty, setFilePath]);

  const reload = useCallback(async () => {
    if (!filePath) return;
    try {
      const text = await tauri.readFile(filePath);
      setContent(text);
      setDirty(false);
    } catch (e) {
      console.error('Ошибка перезагрузки:', e);
    }
  }, [filePath, setContent, setDirty]);

  return { filePath, content, isDirty, open, save, saveAs, reload, setContent };
}
