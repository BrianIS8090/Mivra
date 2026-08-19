import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../stores/appStore';
import * as tauri from '../utils/tauri';

// Лёгкий доступ к настройкам: только селекторы стора и actions.
// Не читает диск и не запускает таймеры — безопасно вызывать в любом
// компоненте (Toolbar и др.) сколько угодно раз.
export function useSettings() {
  // Индивидуальные селекторы — компонент ререндерится только при
  // изменении конкретных полей, которые он реально читает.
  const fontFamily = useAppStore((s) => s.fontFamily);
  const fontSize = useAppStore((s) => s.fontSize);
  const theme = useAppStore((s) => s.theme);
  const language = useAppStore((s) => s.language);
  const pageWidth = useAppStore((s) => s.pageWidth);
  const enabledPlugins = useAppStore((s) => s.enabledPlugins);
  const autosave = useAppStore((s) => s.autosave);
  const setFontFamily = useAppStore((s) => s.setFontFamily);
  const setFontSize = useAppStore((s) => s.setFontSize);
  const setTheme = useAppStore((s) => s.setTheme);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const setPageWidth = useAppStore((s) => s.setPageWidth);
  const setAutosave = useAppStore((s) => s.setAutosave);

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

  const changeAutosave = useCallback((enabled: boolean) => {
    setAutosave(enabled);
  }, [setAutosave]);

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
    enabledPlugins,
    autosave,
    changeAutosave,
  };
}

// Владелец жизненного цикла настроек: первичная загрузка с диска,
// автосохранение (debounce 500 мс) и flush при закрытии окна.
// Должен вызываться ровно один раз — в App. Остальным компонентам
// нужен лёгкий useSettings.
export function useSettingsOwner() {
  const settings = useSettings();
  const s3 = useAppStore((s) => s.s3);
  const s3Verified = useAppStore((s) => s.s3Verified);
  const removedBundledPlugins = useAppStore((s) => s.removedBundledPlugins);
  const updateSettings = useAppStore((s) => s.updateSettings);

  // persist запрещён до завершения первичной загрузки: иначе дефолтный
  // слепок стора перезапишет реальные настройки на диске.
  const [loaded, setLoaded] = useState(false);

  // Загрузить настройки при монтировании
  useEffect(() => {
    let cancelled = false;
    tauri.readSettings()
      .then((loadedSettings) => {
        if (cancelled) return;
        updateSettings(loadedSettings);
        setLoaded(true);
      })
      .catch(() => {
        // Настройки ещё не созданы — используем значения по умолчанию,
        // persist при этом разрешаем: записаны будут именно они.
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [updateSettings]);

  // Сохранить текущие настройки. Состояние читаем из стора напрямую,
  // чтобы flush при beforeunload отправлял свежие значения, а не замыкание.
  const persist = useCallback(async () => {
    const state = useAppStore.getState();
    try {
      await tauri.writeSettings({
        font_family: state.fontFamily,
        font_size: state.fontSize,
        theme: state.theme,
        language: state.language,
        recent_files: state.recentFiles,
        page_width: state.pageWidth,
        s3: state.s3,
        s3_verified: state.s3Verified,
        enabled_plugins: state.enabledPlugins,
        removed_bundled_plugins: state.removedBundledPlugins,
        autosave: state.autosave,
      });
    } catch (e) {
      console.error('Ошибка сохранения настроек:', e);
    }
  }, []);

  // Автосохранение настроек при изменении — только после первичной загрузки
  useEffect(() => {
    if (!loaded) return;
    const timeout = setTimeout(() => {
      persist();
    }, 500);
    return () => clearTimeout(timeout);
  }, [
    loaded,
    settings.fontFamily,
    settings.fontSize,
    settings.theme,
    settings.language,
    settings.pageWidth,
    s3,
    s3Verified,
    settings.enabledPlugins,
    removedBundledPlugins,
    settings.autosave,
    persist,
  ]);

  // Принудительный flush при закрытии окна — иначе изменения за последние
  // 500мс debounce-окна могут не сохраниться. В Tauri событие может
  // не сработать при destroy() — в этом случае useExit перехватит закрытие.
  useEffect(() => {
    if (!loaded) return;
    const onBeforeUnload = () => {
      // sync вызов невозможен — IPC всегда async; пытаемся отправить
      // и надеемся, что доставится до destroy
      persist().catch(() => {
        /* окно уже закрывается */
      });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [loaded, persist]);

  return settings;
}
