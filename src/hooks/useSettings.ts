import { useCallback, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import * as tauri from '../utils/tauri';

export function useSettings() {
  const {
    fontFamily,
    fontSize,
    theme,
    language,
    recentFiles,
    pageWidth,
    setFontFamily,
    setFontSize,
    setTheme,
    setLanguage,
    setPageWidth,
    updateSettings,
  } = useAppStore();

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
      });
    } catch (e) {
      console.error('Ошибка сохранения настроек:', e);
    }
  }, [fontFamily, fontSize, theme, language, recentFiles, pageWidth]);

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
  }, [fontFamily, fontSize, theme, language, pageWidth, persist]);

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
