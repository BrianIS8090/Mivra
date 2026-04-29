import { commands, type FileData, type Settings } from '../bindings';

// Тонкая обёртка над сгенерированным bindings.ts.
// 1. Превращает discriminated union {status:'ok'|'error'} в throw-стиль,
//    привычный остальному коду.
// 2. Сохраняет старый API openFile/saveFile/... — миграция остального
//    кода не нужна.
// При изменении Rust-команд: запустите `npm run gen:types` чтобы
// перегенерировать src/bindings.ts. typescript-ошибки укажут на
// несоответствие сигнатур.

async function unwrap<T>(
  result: Promise<{ status: 'ok'; data: T } | { status: 'error'; error: string }>,
): Promise<T> {
  const r = await result;
  if (r.status === 'ok') return r.data;
  throw r.error;
}

export async function openFile(): Promise<FileData> {
  return unwrap(commands.openFile());
}

export async function saveFile(path: string, content: string): Promise<boolean> {
  return unwrap(commands.saveFile(path, content));
}

export async function saveFileAs(content: string): Promise<string | null> {
  return unwrap(commands.saveFileAs(content));
}

export async function readSettings(): Promise<Settings> {
  return unwrap(commands.readSettings());
}

export async function writeSettings(settings: Settings): Promise<boolean> {
  return unwrap(commands.writeSettings(settings));
}

export async function getRecentFiles(): Promise<string[]> {
  return unwrap(commands.getRecentFiles());
}

// Чтение файла по пути (для открытия через ассоциацию)
export async function readFile(path: string): Promise<string> {
  return unwrap(commands.readFile(path));
}

// Получить путь к файлу, переданному при запуске приложения.
// Возвращает null, если приложение запущено без аргументов.
export async function getPendingFile(): Promise<string | null> {
  return commands.getPendingFile();
}
