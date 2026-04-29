import type { Language } from '../i18n';

export interface FileData {
  path: string;
  content: string;
}

export interface Settings {
  font_family: string;
  font_size: number;
  theme: 'light' | 'dark' | 'system';
  language: Language;
  recent_files: string[];
  page_width: number;
}

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
