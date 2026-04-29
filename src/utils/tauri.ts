import { commands, type FileData, type Settings, type S3Config } from '../bindings';

export type { S3Config };

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

// Сохранить Secret Access Key в системный keyring.
export async function s3SetSecret(secret: string): Promise<void> {
  await unwrap(commands.s3SetSecret(secret));
}

// Удалить Secret Access Key из системного keyring.
export async function s3ClearSecret(): Promise<void> {
  await unwrap(commands.s3ClearSecret());
}

// Проверить, сохранён ли Secret Access Key в keyring.
export async function s3SecretExists(): Promise<boolean> {
  return unwrap(commands.s3SecretExists());
}

// Проверить соединение с S3-хранилищем (HEAD-запрос на bucket).
export async function s3TestConnection(config: S3Config): Promise<void> {
  await unwrap(commands.s3TestConnection(config));
}

// Загрузить файл с диска в S3 и вернуть публичный URL.
export async function s3UploadFile(
  localPath: string,
  originalFilename: string,
  config: S3Config,
): Promise<string> {
  return unwrap(commands.s3UploadFile(localPath, originalFilename, config));
}

// Загрузить байты в S3 и вернуть публичный URL.
export async function s3UploadBytes(
  bytes: Uint8Array,
  originalFilename: string,
  config: S3Config,
): Promise<string> {
  // Tauri 2 принимает Uint8Array как Vec<u8> через числовой массив
  return unwrap(commands.s3UploadBytes(Array.from(bytes), originalFilename, config));
}

// Скопировать локальный файл в {baseDir}/assets/. Возвращает относительный путь.
// Используется как fallback для drag&drop, когда S3 не настроен/не verified.
export async function saveLocalAssetFile(
  localPath: string,
  baseDir: string,
  targetName: string,
): Promise<string> {
  return unwrap(commands.saveLocalAssetFile(localPath, baseDir, targetName));
}

// Сохранить байты (картинка из буфера) в {baseDir}/assets/. Возвращает
// относительный путь. Fallback для paste, когда S3 не настроен/не verified.
export async function saveLocalAssetBytes(
  bytes: Uint8Array,
  baseDir: string,
  targetName: string,
): Promise<string> {
  return unwrap(commands.saveLocalAssetBytes(Array.from(bytes), baseDir, targetName));
}
