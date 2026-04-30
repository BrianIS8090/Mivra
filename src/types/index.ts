import type { Language } from '../i18n';
// Settings, FileData и S3Config теперь генерируются из Rust через specta.
// Реэкспортируем для обратной совместимости импортов (`import type { Settings } from '../types'`).
import type { Settings, FileData, S3Config } from '../bindings';

export type { Settings, FileData, S3Config };

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
  s3: S3Config | null;
  // Текущий S3-конфиг прошёл «Тест соединения» при последнем сохранении.
  // Используется для зелёной подсветки кнопки S3 в Toolbar.
  s3Verified: boolean;

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
  setS3Config: (config: S3Config | null) => void;
  setS3Verified: (verified: boolean) => void;
  updateSettings: (settings: Partial<Settings>) => void;
}
