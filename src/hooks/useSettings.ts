import { useCallback, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import * as tauri from '../utils/tauri';

export function useSettings() {
  // Индивидуальные селекторы — компонент ререндерится только при
  // изменении конкретных полей, которые он реально читает.
  const fontFamily = useAppStore((s) => s.fontFamily);
  const fontSize = useAppStore((s) => s.fontSize);
  const theme = useAppStore((s) => s.theme);
  const language = useAppStore((s) => s.language);
  const recentFiles = useAppStore((s) => s.recentFiles);
  const pageWidth = useAppStore((s) => s.pageWidth);
  const s3 = useAppStore((s) => s.s3);
  const s3Verified = useAppStore((s) => s.s3Verified);
  const setFontFamily = useAppStore((s) => s.setFontFamily);
  const setFontSize = useAppStore((s) => s.setFontSize);
  const setTheme = useAppStore((s) => s.setTheme);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const setPageWidth = useAppStore((s) => s.setPageWidth);
  const updateSettings = useAppStore((s) => s.updateSettings);

  // Загрузить настройки при монтировании
  useEffect(() => {
    tauri.readSettings()
      .then(updateSettings)
      .catch(() => {
        // Настройки ещё не созданы — используем значения по умолчанию
      });
  }, [updateSettings]);

  // Сохранить текущие настройки
  const persist = useCallback(async () => {
    try {
      await tauri.writeSettings({
        font_family: fontFamily,
        font_size: fontSize,
        theme,
        language,
        recent_files: recentFiles,
        page_width: pageWidth,
        s3,
        s3_verified: s3Verified,
      });
    } catch (e) {
      console.error('Ошибка сохранения настроек:', e);
    }
  }, [fontFamily, fontSize, theme, language, recentFiles, pageWidth, s3, s3Verified]);

  const changeFontFamily = useCallback((family: string) => {
    setFontFamily(family);
  }, [setFontFamily]);

  const changeFontSize = useCallback((size: number) => {
    const clamped = Math.max(10, Math.min(32, size));
    setFontSize(clamped);
  }, [setFontSize]);

  const changeTheme = useCallback((newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
  }, [setTheme]);

  const changeLanguage = useCallback((newLang: 'ru' | 'en') => {
    setLanguage(newLang);
  }, [setLanguage]);

  const changePageWidth = useCallback((width: number) => {
    const clamped = Math.max(400, Math.min(1600, width));
    setPageWidth(clamped);
  }, [setPageWidth]);

  // Автосохранение настроек при изменении
  useEffect(() => {
    const timeout = setTimeout(() => {
      persist();
    }, 500);
    return () => clearTimeout(timeout);
  }, [fontFamily, fontSize, theme, language, pageWidth, s3, s3Verified, persist]);

  // Принудительный flush при закрытии окна — иначе изменения за последние
  // 500мс debounce-окна могут не сохраниться. В Tauri событие может
  // не сработать при destroy() — в этом случае useExit перехватит закрытие.
  useEffect(() => {
    const onBeforeUnload = () => {
      // sync вызов невозможен — IPC всегда async; пытаемся отправить
      // и надеемся, что доставится до destroy
      persist().catch(() => {
        /* окно уже закрывается */
      });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [persist]);

  return {
    fontFamily,
    fontSize,
    theme,
    language,
    changeFontFamily,
    changeFontSize,
    changeTheme,
    changeLanguage,
    pageWidth,
    changePageWidth,
  };
}
