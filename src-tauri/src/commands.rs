use crate::s3::{self, S3Config};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize, Deserialize, Clone, Type)]
pub struct FileData {
  pub path: String,
  pub content: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct Settings {
  #[serde(default = "default_font_family")]
  pub font_family: String,
  #[serde(default = "default_font_size")]
  pub font_size: f32,
  #[serde(default = "default_theme")]
  pub theme: String,
  #[serde(default = "default_language")]
  pub language: String,
  #[serde(default)]
  pub recent_files: Vec<String>,
  #[serde(default = "default_page_width")]
  pub page_width: f32,
  #[serde(default)]
  pub s3: Option<S3Config>,
  // Флаг: текущий S3-конфиг прошёл «Тест соединения» при последнем сохранении.
  // Сбрасывается при любом изменении полей, ставится при успешном тесте + save.
  // Используется UI: кнопка S3 в Toolbar горит зелёным.
  #[serde(default)]
  pub s3_verified: bool,
}

fn default_font_family() -> String {
  "Segoe UI Variable".to_string()
}

fn default_font_size() -> f32 {
  15.0
}

fn default_theme() -> String {
  "system".to_string()
}

fn default_language() -> String {
  "ru".to_string()
}

fn default_page_width() -> f32 {
  816.0
}

impl Default for Settings {
  fn default() -> Self {
    Settings {
      font_family: default_font_family(),
      font_size: default_font_size(),
      theme: default_theme(),
      language: default_language(),
      recent_files: Vec::new(),
      page_width: default_page_width(),
      s3: None,
      s3_verified: false,
    }
  }
}

/// Получить путь к файлу настроек в AppData.
/// Возвращает Result вместо паники: если AppData недоступен (антивирус,
/// проблемы с профилем), команда просто вернёт ошибку фронту.
fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let config_dir = app
    .path()
    .app_config_dir()
    .map_err(|e| format!("Не удалось получить директорию конфигурации: {}", e))?;
  fs::create_dir_all(&config_dir)
    .map_err(|e| format!("Не удалось создать директорию конфигурации: {}", e))?;
  Ok(config_dir.join("settings.json"))
}

/// Атомарная запись файла: пишем во временный файл и переименовываем.
/// Защищает от частично-записанного settings.json при сбое или гонке.
fn atomic_write(path: &std::path::Path, content: &str) -> Result<(), String> {
  let parent = path
    .parent()
    .ok_or_else(|| "Не удалось определить директорию файла".to_string())?;
  let mut tmp = tempfile::NamedTempFile::new_in(parent)
    .map_err(|e| format!("Ошибка создания временного файла: {}", e))?;

  tmp.write_all(content.as_bytes())
    .map_err(|e| format!("Ошибка записи временного файла: {}", e))?;
  tmp.flush()
    .map_err(|e| format!("Ошибка сброса временного файла: {}", e))?;
  tmp.as_file()
    .sync_all()
    .map_err(|e| format!("Ошибка синхронизации временного файла: {}", e))?;

  tmp.persist(path)
    .map_err(|e| format!("Ошибка замены файла: {}", e.error))?;
  Ok(())
}

/// Добавить файл в список недавних (максимум 10).
/// Возвращает Result, чтобы вызывающий мог решить, прерывать ли операцию.
fn add_to_recent(app: &tauri::AppHandle, path: &str) -> Result<(), String> {
  let settings_file = settings_path(app)?;
  let mut settings = if settings_file.exists() {
    let data = fs::read_to_string(&settings_file).unwrap_or_default();
    serde_json::from_str::<Settings>(&data).unwrap_or_default()
  } else {
    Settings::default()
  };

  // Убрать дубликат, добавить в начало
  settings.recent_files.retain(|p| p != path);
  settings.recent_files.insert(0, path.to_string());
  settings.recent_files.truncate(10);

  let json = serde_json::to_string_pretty(&settings)
    .map_err(|e| format!("Ошибка сериализации настроек: {}", e))?;
  atomic_write(&settings_file, &json)
}

#[tauri::command]
#[specta::specta]
pub async fn open_file(app: tauri::AppHandle) -> Result<FileData, String> {
  let file = app
    .dialog()
    .file()
    .add_filter("Markdown", &["md", "markdown", "txt"])
    .blocking_pick_file();

  match file {
    Some(file_path) => {
      let path_buf = file_path
        .into_path()
        .map_err(|e| format!("Некорректный путь: {}", e))?;
      let path = path_buf.to_string_lossy().to_string();
      let content =
        fs::read_to_string(&path).map_err(|e| format!("Ошибка чтения файла: {}", e))?;
      // Не блокируем открытие из-за проблем с recent-files — просто логируем
      if let Err(e) = add_to_recent(&app, &path) {
        eprintln!("[recent_files] не удалось обновить список: {}", e);
      }
      Ok(FileData { path, content })
    }
    None => Err("Файл не выбран".to_string()),
  }
}

#[tauri::command]
#[specta::specta]
pub async fn save_file(path: String, content: String) -> Result<bool, String> {
  fs::write(&path, &content).map_err(|e| format!("Ошибка сохранения: {}", e))?;
  Ok(true)
}

#[tauri::command]
#[specta::specta]
pub async fn save_file_as(app: tauri::AppHandle, content: String) -> Result<Option<String>, String> {
  let file = app
    .dialog()
    .file()
    .add_filter("Markdown", &["md", "markdown", "txt"])
    .set_file_name("untitled.md")
    .blocking_save_file();

  match file {
    Some(file_path) => {
      let path_buf = file_path
        .into_path()
        .map_err(|e| format!("Некорректный путь: {}", e))?;
      let path = path_buf.to_string_lossy().to_string();
      fs::write(&path, &content).map_err(|e| format!("Ошибка сохранения: {}", e))?;
      if let Err(e) = add_to_recent(&app, &path) {
        eprintln!("[recent_files] не удалось обновить список: {}", e);
      }
      Ok(Some(path))
    }
    None => Ok(None),
  }
}

#[tauri::command]
#[specta::specta]
pub async fn read_settings(app: tauri::AppHandle) -> Result<Settings, String> {
  let path = settings_path(&app)?;
  if path.exists() {
    let data =
      fs::read_to_string(&path).map_err(|e| format!("Ошибка чтения настроек: {}", e))?;
    let settings: Settings =
      serde_json::from_str(&data).map_err(|e| format!("Ошибка парсинга настроек: {}", e))?;
    Ok(settings)
  } else {
    Ok(Settings::default())
  }
}

#[tauri::command]
#[specta::specta]
pub async fn write_settings(app: tauri::AppHandle, settings: Settings) -> Result<bool, String> {
  let path = settings_path(&app)?;
  let json =
    serde_json::to_string_pretty(&settings).map_err(|e| format!("Ошибка сериализации: {}", e))?;
  atomic_write(&path, &json)?;
  Ok(true)
}

#[tauri::command]
#[specta::specta]
pub async fn get_recent_files(app: tauri::AppHandle) -> Result<Vec<String>, String> {
  let settings = read_settings(app).await?;
  Ok(settings.recent_files)
}

/// Чтение файла по пути (для открытия через ассоциацию файлов)
#[tauri::command]
#[specta::specta]
pub async fn read_file(path: String) -> Result<String, String> {
  fs::read_to_string(&path).map_err(|e| format!("Ошибка чтения файла: {}", e))
}

/// Подобрать уникальное имя файла в директории. Если name свободен — он же.
/// Иначе пробуем «name (1).ext», «name (2).ext», ... до 999.
fn unique_filename(dir: &std::path::Path, original: &str) -> String {
  if !dir.join(original).exists() {
    return original.to_string();
  }
  let (stem, ext) = match original.rsplit_once('.') {
    Some((s, e)) => (s.to_string(), format!(".{}", e)),
    None => (original.to_string(), String::new()),
  };
  for i in 1..1000 {
    let candidate = format!("{} ({}){}", stem, i, ext);
    if !dir.join(&candidate).exists() {
      return candidate;
    }
  }
  // Маловероятно: 1000 коллизий — возвращаем уникальное по timestamp
  let ts = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| d.as_millis())
    .unwrap_or(0);
  format!("{}-{}{}", stem, ts, ext)
}

/// Сохранить локальный файл в {base_dir}/assets/. Возвращает относительный путь
/// от base_dir для вставки в markdown (например, "assets/screenshot.png").
/// Используется как fallback для drag&drop, когда S3 не настроен или не прошёл тест.
#[tauri::command]
#[specta::specta]
pub async fn save_local_asset_file(
  local_path: String,
  base_dir: String,
  target_name: String,
) -> Result<String, String> {
  let assets_dir = std::path::Path::new(&base_dir).join("assets");
  fs::create_dir_all(&assets_dir)
    .map_err(|e| format!("Не удалось создать директорию assets/: {}", e))?;
  let unique_name = unique_filename(&assets_dir, &target_name);
  let dest = assets_dir.join(&unique_name);
  fs::copy(&local_path, &dest).map_err(|e| format!("Ошибка копирования файла: {}", e))?;
  Ok(format!("assets/{}", unique_name))
}

/// Сохранить байты (например, картинка из буфера) в {base_dir}/assets/.
/// Возвращает относительный путь от base_dir для вставки в markdown.
#[tauri::command]
#[specta::specta]
pub async fn save_local_asset_bytes(
  bytes: Vec<u8>,
  base_dir: String,
  target_name: String,
) -> Result<String, String> {
  let assets_dir = std::path::Path::new(&base_dir).join("assets");
  fs::create_dir_all(&assets_dir)
    .map_err(|e| format!("Не удалось создать директорию assets/: {}", e))?;
  let unique_name = unique_filename(&assets_dir, &target_name);
  let dest = assets_dir.join(&unique_name);
  fs::write(&dest, bytes).map_err(|e| format!("Ошибка записи файла: {}", e))?;
  Ok(format!("assets/{}", unique_name))
}

// === S3-команды ===

/// Сохранить Secret Access Key в системный keyring.
#[tauri::command]
#[specta::specta]
pub async fn s3_set_secret(secret: String) -> Result<(), String> {
  s3::set_secret(&secret)
}

/// Удалить Secret Access Key из системного keyring.
#[tauri::command]
#[specta::specta]
pub async fn s3_clear_secret() -> Result<(), String> {
  s3::delete_secret()
}

/// Проверить, сохранён ли Secret Access Key в keyring.
#[tauri::command]
#[specta::specta]
pub async fn s3_secret_exists() -> Result<bool, String> {
  s3::secret_exists()
}

/// Проверить соединение с S3-хранилищем (HEAD-запрос на bucket).
#[tauri::command]
#[specta::specta]
pub async fn s3_test_connection(config: S3Config) -> Result<(), String> {
  let secret = s3::get_secret().map_err(|_| "secret_not_set".to_string())?;
  s3::test_connection_with_secret(&config, &secret).await
}

/// Загрузить файл с диска в S3 и вернуть публичный URL.
#[tauri::command]
#[specta::specta]
pub async fn s3_upload_file(
  local_path: String,
  original_filename: String,
  config: S3Config,
) -> Result<String, String> {
  let secret = s3::get_secret().map_err(|_| "secret_not_set".to_string())?;
  s3::upload_file_with_secret(&config, &secret, &local_path, &original_filename).await
}

/// Загрузить байты в S3 и вернуть публичный URL.
#[tauri::command]
#[specta::specta]
pub async fn s3_upload_bytes(
  bytes: Vec<u8>,
  original_filename: String,
  config: S3Config,
) -> Result<String, String> {
  let secret = s3::get_secret().map_err(|_| "secret_not_set".to_string())?;
  s3::upload_bytes_with_secret(&config, &secret, bytes, &original_filename).await
}

#[cfg(test)]
mod tests {
  use super::atomic_write;
  use std::fs;
  use std::time::{SystemTime, UNIX_EPOCH};

  fn unique_temp_dir() -> std::path::PathBuf {
    let stamp = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("Системное время должно быть после UNIX_EPOCH")
      .as_nanos();
    std::env::temp_dir().join(format!("mivra-commands-test-{stamp}"))
  }

  #[test]
  fn atomic_write_replaces_existing_file() {
    let dir = unique_temp_dir();
    fs::create_dir_all(&dir).expect("Не удалось создать временную директорию");
    let path = dir.join("settings.json");

    atomic_write(&path, "first").expect("Первая запись должна пройти");
    atomic_write(&path, "second").expect("Повторная запись должна заменить файл");

    let content = fs::read_to_string(&path).expect("Файл должен читаться");
    fs::remove_dir_all(&dir).ok();

    assert_eq!(content, "second");
  }
}
