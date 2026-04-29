import type { Language } from '../i18n';
// Settings и FileData теперь генерируются из Rust через specta.
// Реэкспортируем для обратной совместимости импортов (`import type { Settings } from '../types'`).
import type { Settings, FileData } from '../bindings';

export type { Settings, FileData };

export type EditorMode = 'visual' | 'source';

export interface AppState {
  // Файл
  filePath: string | null;
  baseDir: string | null;
  content: string;
  isDirty: boolean;

  // Настройки
  fontFamily: string;
  fontSize: number;
  theme: 'light' | 'dark' | 'system';
  language: Language;
  editorMode: EditorMode;
  recentFiles: string[];
  pageWidth: number;

  // Действия
  setContent: (content: string) => void;
  loadContent: (content: string) => void;
  setFilePath: (path: string | null) => void;
  setBaseDir: (baseDir: string | null) => void;
  setDirty: (dirty: boolean) => void;
  setFontFamily: (fontFamily: string) => void;
  setFontSize: (fontSize: number) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setLanguage: (language: Language) => void;
  setEditorMode: (mode: EditorMode) => void;
  setRecentFiles: (files: string[]) => void;
  setPageWidth: (pageWidth: number) => void;
  updateSettings: (settings: Partial<Settings>) => void;
}
