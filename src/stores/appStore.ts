import { create } from 'zustand';
import type { AppState, Settings } from '../types';
import type { Language } from '../i18n';

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
  updateSettings: (settings: Partial<Settings>) => set((state) => ({
    fontFamily: settings.font_family ?? state.fontFamily,
    fontSize: settings.font_size ?? state.fontSize,
    theme: settings.theme ?? state.theme,
    language: settings.language ?? state.language,
    recentFiles: settings.recent_files ?? state.recentFiles,
    pageWidth: settings.page_width ?? state.pageWidth,
  })),
}));
