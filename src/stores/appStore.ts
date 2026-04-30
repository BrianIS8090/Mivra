import { create } from 'zustand';
import type { AppState, Settings } from '../types';
import type { Language } from '../i18n';

type Theme = AppState['theme'];

export const useAppStore = create<AppState>((set) => ({
  // Файл
  filePath: null,
  baseDir: null,
  content: '',
  isDirty: false,

  // Настройки
  fontFamily: 'Segoe UI Variable',
  fontSize: 15,
  theme: 'system',
  language: 'ru' as Language,
  editorMode: 'visual',
  recentFiles: [],
  pageWidth: 816,
  s3: null,
  s3Verified: false,

  // Действия
  setContent: (content) => set((state) =>
    state.content === content ? {} : { content, isDirty: true }
  ),
  // Программная загрузка контента (открытие файла, reload) — без isDirty
  loadContent: (content) => set({ content, isDirty: false }),
  setFilePath: (filePath) => set({ filePath }),
  setBaseDir: (baseDir) => set({ baseDir }),
  setDirty: (isDirty) => set({ isDirty }),
  setFontFamily: (fontFamily) => set({ fontFamily }),
  setFontSize: (fontSize) => set({ fontSize }),
  setTheme: (theme) => set({ theme }),
  setLanguage: (language) => set({ language }),
  setEditorMode: (editorMode) => set({ editorMode }),
  setRecentFiles: (recentFiles) => set({ recentFiles }),
  setPageWidth: (pageWidth) => set({ pageWidth }),
  // Любое изменение конфига S3 автоматически инвалидирует verified-флаг,
  // чтобы кнопка S3 в Toolbar не горела зелёным с устаревшими данными.
  setS3Config: (s3) => set({ s3, s3Verified: false }),
  setS3Verified: (s3Verified) => set({ s3Verified }),
  updateSettings: (settings: Partial<Settings>) => set((state) => ({
    fontFamily: settings.font_family ?? state.fontFamily,
    fontSize: settings.font_size ?? state.fontSize,
    // Settings.theme/language из bindings — string (Rust pub theme: String).
    // Casting к узкому типу безопасен: в Rust значения не валидируются,
    // но в коде мы пишем только 'light'|'dark'|'system' и 'ru'|'en'.
    theme: (settings.theme as Theme | undefined) ?? state.theme,
    language: (settings.language as Language | undefined) ?? state.language,
    recentFiles: settings.recent_files ?? state.recentFiles,
    pageWidth: settings.page_width ?? state.pageWidth,
    // Семантика ??: undefined из bindings → не трогаем, явный null → очищаем
    // через setS3Config (т.к. ?? для null также возьмёт правую сторону).
    s3: settings.s3 ?? state.s3,
    s3Verified: settings.s3_verified ?? state.s3Verified,
  })),
}));
