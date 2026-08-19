import { useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import * as tauri from '../utils/tauri';
import { findBaseDir, pickAndFormatAsset } from '../utils/paths';
import { confirmUnsavedChanges } from '../utils/dialogs';
import { getTranslations } from '../i18n';
import { useToast } from './useToast';

// Счётчик вызовов openPath для разрешения гонок: «последний вызов побеждает».
// Модульный, а не ref в хуке — хук может перемонтироваться между вызовами.
let latestOpenPathRequestId = 0;

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
  const setRecentFiles = useAppStore((s) => s.setRecentFiles);
  const toast = useToast();

  // Rust обновляет recent_files в settings.json при open/saveAs — подтягиваем
  // актуальный список в стор (сам стор его не изменяет).
  const refreshRecentFiles = useCallback(async () => {
    try {
      setRecentFiles(await tauri.getRecentFiles());
    } catch (e) {
      console.warn('[useFile] не удалось обновить recentFiles:', e);
    }
  }, [setRecentFiles]);

  const saveAs = useCallback(async (): Promise<boolean> => {
    try {
      const path = await tauri.saveFileAs(content);
      if (path) {
        // После сохранения нового файла обязательно вычислить baseDir —
        // иначе drag&drop / paste в локальный assets/ будут жаловаться, что
        // документ не сохранён, хотя он уже на диске.
        const base = await findBaseDir(path);
        setFilePath(path);
        setBaseDir(base);
        setDirty(false);
        await refreshRecentFiles();
        return true;
      }
      // Пользователь отменил диалог "Сохранить как"
      return false;
    } catch (e) {
      console.error('[useFile] saveAs error:', e);
      return false;
    }
  }, [content, setDirty, setFilePath, setBaseDir, refreshRecentFiles]);

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

  // Общий загрузчик открытого файла в стор — используется и open()
  // (файл из диалога), и openPath() (файл по известному пути).
  // shouldCommit — необязательный гвард «запись всё ещё легальна»;
  // проверяется непосредственно перед записью в стор (после await findBaseDir).
  const loadOpenedFile = useCallback(async (
    path: string,
    text: string,
    shouldCommit?: () => boolean,
  ): Promise<boolean> => {
    // Вычислить baseDir ДО установки контента,
    // чтобы редактор пересоздался с корректным baseDir
    const base = await findBaseDir(path);
    if (shouldCommit && !shouldCommit()) return false;
    setFilePath(path);
    setBaseDir(base);
    // loadContent ставит content и isDirty:false атомарно — без transient true
    loadContent(text);
    await refreshRecentFiles();
    return true;
  }, [loadContent, setFilePath, setBaseDir, refreshRecentFiles]);

  const open = useCallback(async () => {
    if (!(await confirmDiscardIfDirty())) return;
    try {
      const file = await tauri.openFile();
      await loadOpenedFile(file.path, file.content);
    } catch (e) {
      // Пользователь отменил диалог открытия или произошла ошибка
      console.warn('[useFile] open cancelled or error:', e);
    }
  }, [confirmDiscardIfDirty, loadOpenedFile]);

  // Открытие файла по известному пути (меню «Недавние»).
  // Ошибка чтения (файл удалён/перемещён) — toast, список recentFiles не трогаем.
  const openPath = useCallback(async (path: string): Promise<boolean> => {
    // «Последний вызов побеждает»: id инкрементим до любых await,
    // поздний резолв устаревшего вызова будет проигнорирован гвардом ниже.
    const requestId = ++latestOpenPathRequestId;
    if (!(await confirmDiscardIfDirty())) return false;
    // Маркер «не затирать пользовательский ввод»: между confirm и записью
    // в стор лежат await'ы (read_file/findBaseDir), UI жив — пользователь
    // может успеть напечатать. Повторная проверка isDirty не подходит:
    // при выборе «не сохранять» флаг остаётся true до loadContent и ложно
    // бы прерывал легальное открытие, поэтому сравниваем сам контент.
    const contentSnapshot = useAppStore.getState().content;
    const shouldCommit = () =>
      requestId === latestOpenPathRequestId &&
      useAppStore.getState().content === contentSnapshot;
    try {
      const text = await tauri.readFile(path);
      if (!shouldCommit()) {
        console.warn('[useFile] openPath: вызов устарел или документ изменён, загрузка прервана:', path);
        return false;
      }
      return await loadOpenedFile(path, text, shouldCommit);
    } catch (e) {
      // Устаревший вызов ошибкой не пугаем — его результат всё равно игнорируется
      if (requestId !== latestOpenPathRequestId) return false;
      console.error('[useFile] openPath error:', e);
      const { language } = useAppStore.getState();
      toast.show(getTranslations(language).openRecentError, 'error');
      return false;
    }
  }, [confirmDiscardIfDirty, loadOpenedFile, toast]);

  const reload = useCallback(async () => {
    if (!filePath) return;
    if (!(await confirmDiscardIfDirty())) return;
    // Замечание (pre-existing, вне тикета F3): здесь тот же паттерн гонки,
    // что чинился в openPath (await readFile → loadContent без перепроверки
    // контента). Не трогаем — отдельный тикет.
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

  return { filePath, content, isDirty, open, openPath, save, saveAs, reload, insertAsset, setContent };
}
