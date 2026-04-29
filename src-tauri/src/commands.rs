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
