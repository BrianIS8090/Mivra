use crate::s3::{self, S3Config};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::fs;
use std::io::{Read, Write};
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
  #[serde(default = "default_enabled_plugins")]
  pub enabled_plugins: Vec<String>,
  #[serde(default)]
  pub removed_bundled_plugins: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Type)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
  pub id: String,
  pub name: String,
  pub version: String,
  pub description: String,
  pub author: String,
  pub entry: Option<String>,
  pub styles: Option<String>,
  #[serde(default)]
  pub permissions: Vec<String>,
  #[serde(default = "default_plugin_api_version")]
  pub api_version: u32,
  #[serde(default)]
  pub enabled: bool,
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

fn default_enabled_plugins() -> Vec<String> {
  vec!["export-pdf".to_string()]
}

fn default_plugin_api_version() -> u32 {
  1
}

fn is_supported_plugin_permission(permission: &str) -> bool {
  matches!(
    permission,
    "document:read" | "dialog" | "export:html" | "export:pdf"
  )
}

fn normalize_enabled_plugins(plugin_ids: Vec<String>) -> Vec<String> {
  let mut normalized = Vec::new();
  for plugin_id in plugin_ids {
    let next = if plugin_id == "document-designer" {
      "export-pdf".to_string()
    } else {
      plugin_id
    };
    if !normalized.contains(&next) {
      normalized.push(next);
    }
  }
  normalized
}

fn normalize_removed_bundled_plugins(plugin_ids: Vec<String>) -> Vec<String> {
  let mut normalized = Vec::new();
  for plugin_id in plugin_ids {
    let next = if plugin_id == "document-designer" {
      "export-pdf".to_string()
    } else {
      plugin_id
    };
    if !normalized.contains(&next) {
      normalized.push(next);
    }
  }
  normalized
}

fn plugin_id_in_list(plugin_ids: &[String], plugin_id: &str) -> bool {
  plugin_ids.iter().any(|id| id == plugin_id)
}

fn should_restore_bundled_plugin(
  settings: &Settings,
  plugin_id: &str,
  installed_dir_exists: bool,
  installed_version: Option<&str>,
  bundled_version: &str,
) -> bool {
  if !installed_dir_exists {
    return !plugin_id_in_list(&settings.removed_bundled_plugins, plugin_id)
      && plugin_id_in_list(&settings.enabled_plugins, plugin_id);
  }

  match installed_version {
    Some(version) => plugin_version_is_newer(bundled_version, version),
    None => true,
  }
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
      enabled_plugins: default_enabled_plugins(),
      removed_bundled_plugins: Vec::new(),
    }
  }
}

fn validate_plugin_id(id: &str) -> Result<(), String> {
  if id.len() < 3 || id.len() > 64 {
    return Err("plugin_id: длина должна быть от 3 до 64 символов".to_string());
  }

  if !id
    .chars()
    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
  {
    return Err("plugin_id: разрешены только a-z, 0-9 и '-'".to_string());
  }

  if id.starts_with('-') || id.ends_with('-') || id.contains("..") {
    return Err("plugin_id: некорректный идентификатор".to_string());
  }

  Ok(())
}

fn validate_plugin_relative_file(path: &str) -> Result<(), String> {
  let p = std::path::Path::new(path);
  if path.is_empty() || p.is_absolute() || path.contains("..") || path.contains('\\') {
    return Err("plugin_path: путь должен быть относительным файлом внутри плагина".to_string());
  }
  Ok(())
}

fn validate_plugin_manifest_file(
  plugin_dir: &std::path::Path,
  relative_path: &str,
  field: &str,
) -> Result<(), String> {
  validate_plugin_relative_file(relative_path)?;

  let canonical_plugin_dir = plugin_dir
    .canonicalize()
    .map_err(|e| format!("plugin_path: ошибка проверки директории плагина: {}", e))?;
  let target = plugin_dir.join(relative_path);
  let canonical_target = target
    .canonicalize()
    .map_err(|_| format!("{}: файл '{}' не найден", field, relative_path))?;

  if !canonical_target.starts_with(&canonical_plugin_dir) {
    return Err(format!("{}: файл вне директории плагина", field));
  }

  if !canonical_target.is_file() {
    return Err(format!("{}: '{}' должен быть файлом", field, relative_path));
  }

  Ok(())
}

fn plugin_version_is_newer(candidate: &str, current: &str) -> bool {
  let parse = |value: &str| {
    value
      .split('.')
      .map(|part| part.parse::<u32>().unwrap_or(0))
      .collect::<Vec<_>>()
  };
  let candidate_parts = parse(candidate);
  let current_parts = parse(current);
  let len = candidate_parts.len().max(current_parts.len());

  for index in 0..len {
    let left = *candidate_parts.get(index).unwrap_or(&0);
    let right = *current_parts.get(index).unwrap_or(&0);
    if left > right {
      return true;
    }
    if left < right {
      return false;
    }
  }

  false
}

fn plugins_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("Не удалось получить директорию данных приложения: {}", e))?
    .join("plugins");
  fs::create_dir_all(&dir).map_err(|e| format!("Не удалось создать директорию плагинов: {}", e))?;
  Ok(dir)
}

fn copy_plugin_dir_safely(source: &std::path::Path, dest: &std::path::Path) -> Result<(), String> {
  if dest.exists() {
    return Err("plugin_exists: плагин уже установлен".to_string());
  }

  fs::create_dir_all(dest).map_err(|e| format!("Не удалось создать директорию плагина: {}", e))?;

  for entry in fs::read_dir(source).map_err(|e| format!("Ошибка чтения плагина: {}", e))?
  {
    let entry = entry.map_err(|e| format!("Ошибка чтения элемента плагина: {}", e))?;
    let path = entry.path();
    let metadata = fs::symlink_metadata(&path)
      .map_err(|e| format!("Ошибка чтения метаданных плагина: {}", e))?;

    if metadata.file_type().is_symlink() {
      return Err("plugin_symlink: символические ссылки в плагинах запрещены".to_string());
    }

    let target = dest.join(entry.file_name());
    if metadata.is_dir() {
      copy_plugin_dir_safely(&path, &target)?;
    } else if metadata.is_file() {
      fs::copy(path, target).map_err(|e| format!("Ошибка копирования файла плагина: {}", e))?;
    }
  }

  Ok(())
}

fn replace_plugin_dir_safely(
  source: &std::path::Path,
  dest: &std::path::Path,
) -> Result<(), String> {
  if dest.exists() {
    fs::remove_dir_all(dest)
      .map_err(|e| format!("Ошибка удаления старой версии плагина: {}", e))?;
  }

  copy_plugin_dir_safely(source, dest)
}

fn read_plugin_manifest(path: &std::path::Path) -> Result<PluginInfo, String> {
  let data = fs::read_to_string(path.join("plugin.json"))
    .map_err(|e| format!("Ошибка чтения plugin.json: {}", e))?;
  let manifest: PluginInfo =
    serde_json::from_str(&data).map_err(|e| format!("Ошибка парсинга plugin.json: {}", e))?;

  validate_plugin_id(&manifest.id)?;
  let entry = manifest
    .entry
    .as_deref()
    .ok_or_else(|| "plugin_entry: поле entry обязательно".to_string())?;
  validate_plugin_manifest_file(path, entry, "plugin_entry")?;

  if let Some(styles) = &manifest.styles {
    validate_plugin_manifest_file(path, styles, "plugin_styles")?;
  }

  if manifest.api_version != default_plugin_api_version() {
    return Err(format!(
      "plugin_api_version: поддерживается только API {}, указан {}",
      default_plugin_api_version(),
      manifest.api_version
    ));
  }

  if let Some(permission) = manifest
    .permissions
    .iter()
    .find(|permission| !is_supported_plugin_permission(permission))
  {
    return Err(format!("plugin_permission: неизвестное разрешение '{}'", permission));
  }

  Ok(manifest)
}

fn plugin_package_source_root(temp_dir: &std::path::Path) -> Result<PathBuf, String> {
  if temp_dir.join("plugin.json").is_file() {
    return Ok(temp_dir.to_path_buf());
  }

  let entries = fs::read_dir(temp_dir)
    .map_err(|e| format!("plugin_package: ошибка чтения распакованного пакета: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("plugin_package: ошибка чтения элемента пакета: {}", e))?;
  let dirs = entries
    .iter()
    .filter(|entry| entry.path().is_dir())
    .collect::<Vec<_>>();
  let files = entries
    .iter()
    .filter(|entry| entry.path().is_file())
    .collect::<Vec<_>>();

  if files.is_empty() && dirs.len() == 1 {
    let nested_root = dirs[0].path();
    if nested_root.join("plugin.json").is_file() {
      return Ok(nested_root);
    }
  }

  Err(
    "plugin_package: plugin.json должен лежать в корне пакета или в единственной верхней папке"
      .to_string(),
  )
}

fn bundled_plugin_source(plugin_id: &str, app: &tauri::AppHandle) -> Result<PathBuf, String> {
  validate_plugin_id(plugin_id)?;

  if let Ok(resource_dir) = app.path().resource_dir() {
    let resource_path = resource_dir.join("bundled-plugins").join(plugin_id);
    if resource_path.exists() {
      return Ok(resource_path);
    }
  }

  let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .join("bundled-plugins")
    .join(plugin_id);
  if dev_path.exists() {
    return Ok(dev_path);
  }

  Err(format!("bundled_plugin_missing: {}", plugin_id))
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

  tmp
    .write_all(content.as_bytes())
    .map_err(|e| format!("Ошибка записи временного файла: {}", e))?;
  tmp
    .flush()
    .map_err(|e| format!("Ошибка сброса временного файла: {}", e))?;
  tmp
    .as_file()
    .sync_all()
    .map_err(|e| format!("Ошибка синхронизации временного файла: {}", e))?;

  tmp
    .persist(path)
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
      let content = fs::read_to_string(&path).map_err(|e| format!("Ошибка чтения файла: {}", e))?;
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
pub async fn save_file_as(
  app: tauri::AppHandle,
  content: String,
) -> Result<Option<String>, String> {
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
    let data = fs::read_to_string(&path).map_err(|e| format!("Ошибка чтения настроек: {}", e))?;
    let mut settings: Settings =
      serde_json::from_str(&data).map_err(|e| format!("Ошибка парсинга настроек: {}", e))?;
    settings.enabled_plugins = normalize_enabled_plugins(settings.enabled_plugins);
    settings.removed_bundled_plugins =
      normalize_removed_bundled_plugins(settings.removed_bundled_plugins);
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

async fn update_settings_after_plugin_install(
  app: &tauri::AppHandle,
  plugin_id: &str,
) -> Result<(), String> {
  let mut settings = read_settings(app.clone()).await?;
  settings
    .removed_bundled_plugins
    .retain(|id| id != plugin_id);
  settings.removed_bundled_plugins =
    normalize_removed_bundled_plugins(settings.removed_bundled_plugins);
  write_settings(app.clone(), settings).await?;
  Ok(())
}

async fn update_settings_after_plugin_uninstall(
  app: &tauri::AppHandle,
  plugin_id: &str,
  is_bundled: bool,
) -> Result<(), String> {
  let mut settings = read_settings(app.clone()).await?;
  settings.enabled_plugins.retain(|id| id != plugin_id);

  if is_bundled && !plugin_id_in_list(&settings.removed_bundled_plugins, plugin_id) {
    settings.removed_bundled_plugins.push(plugin_id.to_string());
  }

  settings.enabled_plugins = normalize_enabled_plugins(settings.enabled_plugins);
  settings.removed_bundled_plugins =
    normalize_removed_bundled_plugins(settings.removed_bundled_plugins);
  write_settings(app.clone(), settings).await?;
  Ok(())
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

#[tauri::command]
#[specta::specta]
pub async fn get_installed_plugins(app: tauri::AppHandle) -> Result<Vec<PluginInfo>, String> {
  let dir = plugins_dir(&app)?;
  let settings = read_settings(app).await.unwrap_or_default();
  let mut plugins = Vec::new();

  for entry in fs::read_dir(dir).map_err(|e| format!("Ошибка чтения директории плагинов: {}", e))?
  {
    let entry = entry.map_err(|e| format!("Ошибка чтения плагина: {}", e))?;
    if !entry.path().is_dir() {
      continue;
    }

    match read_plugin_manifest(&entry.path()) {
      Ok(mut plugin) => {
        plugin.enabled = settings.enabled_plugins.iter().any(|id| id == &plugin.id);
        plugins.push(plugin);
      }
      Err(e) => eprintln!("[plugins] пропуск некорректного плагина: {}", e),
    }
  }

  plugins.sort_by_key(|plugin| plugin.name.to_lowercase());
  Ok(plugins)
}

#[tauri::command]
#[specta::specta]
pub async fn install_plugin(
  app: tauri::AppHandle,
  folder_path: String,
) -> Result<PluginInfo, String> {
  let source = PathBuf::from(folder_path)
    .canonicalize()
    .map_err(|e| format!("Некорректный путь плагина: {}", e))?;
  if !source.is_dir() {
    return Err("plugin_source: путь должен быть директорией".to_string());
  }

  let mut manifest = read_plugin_manifest(&source)?;
  manifest.enabled = false;

  let dir = plugins_dir(&app)?;
  let dest = dir.join(&manifest.id);
  if let Err(e) = copy_plugin_dir_safely(&source, &dest) {
    fs::remove_dir_all(&dest).ok();
    return Err(e);
  }

  update_settings_after_plugin_install(&app, &manifest.id).await?;

  Ok(manifest)
}

#[tauri::command]
#[specta::specta]
pub async fn uninstall_plugin(app: tauri::AppHandle, plugin_id: String) -> Result<(), String> {
  validate_plugin_id(&plugin_id)?;
  let is_bundled = bundled_plugin_source(&plugin_id, &app).is_ok();
  let dir = plugins_dir(&app)?;
  let target = dir.join(&plugin_id);

  if !target.exists() {
    update_settings_after_plugin_uninstall(&app, &plugin_id, is_bundled).await?;
    return Ok(());
  }

  let canonical_plugins = dir
    .canonicalize()
    .map_err(|e| format!("Ошибка проверки директории плагинов: {}", e))?;
  let canonical_target = target
    .canonicalize()
    .map_err(|e| format!("Ошибка проверки директории плагина: {}", e))?;

  if !canonical_target.starts_with(&canonical_plugins) {
    return Err("plugin_path: путь плагина вне директории плагинов".to_string());
  }

  fs::remove_dir_all(canonical_target).map_err(|e| format!("Ошибка удаления плагина: {}", e))?;
  update_settings_after_plugin_uninstall(&app, &plugin_id, is_bundled).await?;
  Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_plugin_asset_path(
  app: tauri::AppHandle,
  plugin_id: String,
  relative_path: String,
) -> Result<String, String> {
  validate_plugin_id(&plugin_id)?;
  validate_plugin_relative_file(&relative_path)?;

  let plugins = plugins_dir(&app)?;
  let plugin_dir = plugins.join(plugin_id);
  let target = plugin_dir.join(relative_path);

  let canonical_plugins = plugins
    .canonicalize()
    .map_err(|e| format!("Ошибка проверки директории плагинов: {}", e))?;
  let canonical_target = target
    .canonicalize()
    .map_err(|e| format!("Ошибка проверки файла плагина: {}", e))?;

  if !canonical_target.starts_with(&canonical_plugins) {
    return Err("plugin_path: файл вне директории плагинов".to_string());
  }

  if !canonical_target.is_file() {
    return Err("plugin_path: файл плагина не найден".to_string());
  }

  Ok(canonical_target.to_string_lossy().to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn read_plugin_asset_bytes(
  app: tauri::AppHandle,
  plugin_id: String,
  relative_path: String,
) -> Result<Vec<u8>, String> {
  validate_plugin_id(&plugin_id)?;
  validate_plugin_relative_file(&relative_path)?;

  let plugins = plugins_dir(&app)?;
  let plugin_dir = plugins.join(plugin_id);
  let target = plugin_dir.join(relative_path);

  let canonical_plugins = plugins
    .canonicalize()
    .map_err(|e| format!("Ошибка проверки директории плагинов: {}", e))?;
  let canonical_target = target
    .canonicalize()
    .map_err(|e| format!("Ошибка проверки файла плагина: {}", e))?;

  if !canonical_target.starts_with(&canonical_plugins) {
    return Err("plugin_path: файл вне директории плагинов".to_string());
  }

  if !canonical_target.is_file() {
    return Err("plugin_path: файл плагина не найден".to_string());
  }

  fs::read(canonical_target).map_err(|e| format!("Ошибка чтения файла плагина: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn install_plugin_package(
  app: tauri::AppHandle,
  package_path: String,
) -> Result<PluginInfo, String> {
  let package = PathBuf::from(package_path)
    .canonicalize()
    .map_err(|e| format!("Некорректный путь пакета плагина: {}", e))?;
  if !package.is_file() {
    return Err("plugin_package: путь должен указывать на файл".to_string());
  }

  let extension = package
    .extension()
    .and_then(|value| value.to_str())
    .unwrap_or("")
    .to_ascii_lowercase();
  if extension != "zip" && extension != "mivraplugin" {
    return Err("plugin_package: поддерживаются только .zip и .mivraplugin".to_string());
  }

  let file =
    fs::File::open(&package).map_err(|e| format!("Ошибка открытия пакета плагина: {}", e))?;
  let mut archive =
    zip::ZipArchive::new(file).map_err(|e| format!("Ошибка чтения zip-пакета: {}", e))?;
  let temp_dir =
    tempfile::tempdir().map_err(|e| format!("Ошибка создания временной директории: {}", e))?;

  for index in 0..archive.len() {
    let mut file = archive
      .by_index(index)
      .map_err(|e| format!("Ошибка чтения файла пакета: {}", e))?;
    let raw_name = file.name().trim_end_matches('/').to_string();
    if raw_name.is_empty() {
      continue;
    }
    validate_plugin_relative_file(&raw_name)?;

    let target = temp_dir.path().join(&raw_name);
    if file.is_dir() {
      fs::create_dir_all(&target)
        .map_err(|e| format!("Ошибка создания директории пакета: {}", e))?;
      continue;
    }

    if let Some(parent) = target.parent() {
      fs::create_dir_all(parent)
        .map_err(|e| format!("Ошибка создания директории пакета: {}", e))?;
    }

    let mut bytes = Vec::new();
    file
      .read_to_end(&mut bytes)
      .map_err(|e| format!("Ошибка чтения содержимого пакета: {}", e))?;
    fs::write(&target, bytes).map_err(|e| format!("Ошибка распаковки пакета: {}", e))?;
  }

  let source_root = plugin_package_source_root(temp_dir.path())?;
  let mut manifest = read_plugin_manifest(&source_root)?;
  manifest.enabled = false;

  let dir = plugins_dir(&app)?;
  let dest = dir.join(&manifest.id);
  if let Err(e) = copy_plugin_dir_safely(&source_root, &dest) {
    fs::remove_dir_all(&dest).ok();
    return Err(e);
  }

  update_settings_after_plugin_install(&app, &manifest.id).await?;

  Ok(manifest)
}

#[tauri::command]
#[specta::specta]
pub async fn ensure_bundled_plugins(app: tauri::AppHandle) -> Result<Vec<PluginInfo>, String> {
  let bundled_source = bundled_plugin_source("export-pdf", &app)?;
  let bundled_manifest = read_plugin_manifest(&bundled_source)?;
  let plugins = plugins_dir(&app)?;
  let dest = plugins.join(&bundled_manifest.id);
  let settings = read_settings(app.clone()).await.unwrap_or_default();

  let installed_version = if dest.exists() {
    read_plugin_manifest(&dest)
      .ok()
      .map(|installed_manifest| installed_manifest.version)
  } else {
    None
  };

  let should_copy = should_restore_bundled_plugin(
    &settings,
    &bundled_manifest.id,
    dest.exists(),
    installed_version.as_deref(),
    &bundled_manifest.version,
  );

  if should_copy {
    replace_plugin_dir_safely(&bundled_source, &dest)?;
  }

  get_installed_plugins(app).await
}

#[tauri::command]
#[specta::specta]
pub async fn export_to_html(
  app: tauri::AppHandle,
  html: String,
  default_name: Option<String>,
) -> Result<Option<String>, String> {
  let file = app
    .dialog()
    .file()
    .add_filter("HTML", &["html", "htm"])
    .set_file_name(default_name.as_deref().unwrap_or("document.html"))
    .blocking_save_file();

  match file {
    Some(file_path) => {
      let path_buf = file_path
        .into_path()
        .map_err(|e| format!("Некорректный путь: {}", e))?;
      fs::write(&path_buf, html).map_err(|e| format!("Ошибка экспорта HTML: {}", e))?;
      Ok(Some(path_buf.to_string_lossy().to_string()))
    }
    None => Ok(None),
  }
}

#[tauri::command]
#[specta::specta]
pub async fn export_to_pdf(
  app: tauri::AppHandle,
  pdf_bytes: Vec<u8>,
  default_name: Option<String>,
) -> Result<Option<String>, String> {
  let file = app
    .dialog()
    .file()
    .add_filter("PDF", &["pdf"])
    .set_file_name(default_name.as_deref().unwrap_or("document.pdf"))
    .blocking_save_file();

  match file {
    Some(file_path) => {
      let path_buf = file_path
        .into_path()
        .map_err(|e| format!("Некорректный путь: {}", e))?;
      fs::write(&path_buf, pdf_bytes).map_err(|e| format!("Ошибка экспорта PDF: {}", e))?;
      Ok(Some(path_buf.to_string_lossy().to_string()))
    }
    None => Ok(None),
  }
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

fn canonical_upload_file_path(local_path: &str) -> Result<PathBuf, String> {
  let path = PathBuf::from(local_path);
  let metadata =
    fs::symlink_metadata(&path).map_err(|e| format!("Ошибка чтения метаданных файла: {}", e))?;
  if metadata.file_type().is_symlink() {
    return Err("invalid_local_path: символические ссылки не поддерживаются".to_string());
  }
  if !metadata.is_file() {
    return Err("invalid_local_path: путь должен указывать на файл".to_string());
  }
  path
    .canonicalize()
    .map_err(|e| format!("invalid_local_path: {}", e))
}

fn canonical_dir(path: PathBuf) -> Option<PathBuf> {
  path.canonicalize().ok().filter(|p| p.is_dir())
}

fn validate_local_upload_scope(
  app: &tauri::AppHandle,
  local_path: &str,
) -> Result<PathBuf, String> {
  let file_path = canonical_upload_file_path(local_path)?;
  let path_resolver = app.path();
  let allowed_roots: Vec<PathBuf> = [
    path_resolver.home_dir(),
    path_resolver.desktop_dir(),
    path_resolver.document_dir(),
    path_resolver.download_dir(),
  ]
  .into_iter()
  .filter_map(Result::ok)
  .filter_map(canonical_dir)
  .collect();

  if allowed_roots.iter().any(|root| file_path.starts_with(root)) {
    Ok(file_path)
  } else {
    Err("invalid_local_path: файл вне разрешённых папок".to_string())
  }
}

/// Сохранить локальный файл в {base_dir}/assets/. Возвращает относительный путь
/// от base_dir для вставки в markdown (например, "assets/screenshot.png").
/// Используется как fallback для drag&drop, когда S3 не настроен или не прошёл тест.
#[tauri::command]
#[specta::specta]
pub async fn save_local_asset_file(
  app: tauri::AppHandle,
  local_path: String,
  base_dir: String,
  target_name: String,
) -> Result<String, String> {
  let safe_name = s3::validate_upload_path_filename(&local_path, &target_name)?;
  let canonical_path = validate_local_upload_scope(&app, &local_path)?;
  let size = fs::metadata(&canonical_path)
    .map_err(|e| format!("Ошибка чтения метаданных файла: {}", e))?
    .len();
  s3::validate_upload_size(size)?;

  let assets_dir = std::path::Path::new(&base_dir).join("assets");
  fs::create_dir_all(&assets_dir)
    .map_err(|e| format!("Не удалось создать директорию assets/: {}", e))?;
  let unique_name = unique_filename(&assets_dir, &safe_name);
  let dest = assets_dir.join(&unique_name);
  fs::copy(&canonical_path, &dest).map_err(|e| format!("Ошибка копирования файла: {}", e))?;
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
  let safe_name = s3::validate_upload_filename(&target_name)?;
  s3::validate_upload_size(bytes.len() as u64)?;

  let assets_dir = std::path::Path::new(&base_dir).join("assets");
  fs::create_dir_all(&assets_dir)
    .map_err(|e| format!("Не удалось создать директорию assets/: {}", e))?;
  let unique_name = unique_filename(&assets_dir, &safe_name);
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

/// Проверить соединение с S3-хранилищем (bucket-level ListObjectsV2).
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
  app: tauri::AppHandle,
  local_path: String,
  original_filename: String,
  config: S3Config,
) -> Result<String, String> {
  let canonical_path = validate_local_upload_scope(&app, &local_path)?;
  let canonical_path = canonical_path
    .to_str()
    .ok_or_else(|| "invalid_local_path: путь должен быть UTF-8".to_string())?;
  let secret = s3::get_secret().map_err(|_| "secret_not_set".to_string())?;
  s3::upload_file_with_secret(&config, &secret, canonical_path, &original_filename).await
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
  use super::{atomic_write, save_local_asset_bytes};
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

  #[test]
  fn validate_plugin_id_accepts_lowercase_slug() {
    assert!(super::validate_plugin_id("export-pdf").is_ok());
  }

  #[test]
  fn validate_plugin_id_rejects_path_traversal() {
    let err = super::validate_plugin_id("../evil").unwrap_err();
    assert!(err.contains("plugin_id"), "got: {}", err);
  }

  #[test]
  fn validate_plugin_relative_file_rejects_absolute_path() {
    let err = super::validate_plugin_relative_file("C:\\temp\\plugin.js").unwrap_err();
    assert!(err.contains("plugin_path"), "got: {}", err);
  }

  #[test]
  fn validate_plugin_relative_file_accepts_nested_forward_path() {
    assert!(super::validate_plugin_relative_file("assets/index.js").is_ok());
  }

  #[test]
  fn validate_plugin_relative_file_rejects_parent_dir() {
    let err = super::validate_plugin_relative_file("../plugin.js").unwrap_err();
    assert!(err.contains("plugin_path"), "got: {}", err);
  }

  #[test]
  fn validate_plugin_relative_file_rejects_backslash_path() {
    let err = super::validate_plugin_relative_file("assets\\index.js").unwrap_err();
    assert!(err.contains("plugin_path"), "got: {}", err);
  }

  #[test]
  fn read_plugin_manifest_rejects_missing_entry_file() {
    let dir = unique_temp_dir();
    fs::create_dir_all(&dir).expect("Не удалось создать временную директорию");
    fs::write(
      dir.join("plugin.json"),
      r#"{
        "id": "test-plugin",
        "name": "Test Plugin",
        "version": "1.0.0",
        "description": "Test",
        "author": "Mivra",
        "entry": "index.js",
        "permissions": [],
        "apiVersion": 1
      }"#,
    )
    .expect("Не удалось записать manifest");

    let err = super::read_plugin_manifest(&dir).unwrap_err();

    assert!(err.contains("plugin_entry"), "got: {}", err);
    fs::remove_dir_all(&dir).ok();
  }

  #[test]
  fn read_plugin_manifest_rejects_unsupported_api_version() {
    let dir = unique_temp_dir();
    fs::create_dir_all(&dir).expect("Не удалось создать временную директорию");
    fs::write(dir.join("index.js"), "console.log('x')").expect("Не удалось записать entry");
    fs::write(
      dir.join("plugin.json"),
      r#"{
        "id": "test-plugin",
        "name": "Test Plugin",
        "version": "1.0.0",
        "description": "Test",
        "author": "Mivra",
        "entry": "index.js",
        "permissions": ["dialog"],
        "apiVersion": 2
      }"#,
    )
    .expect("Не удалось записать manifest");

    let err = super::read_plugin_manifest(&dir).unwrap_err();

    assert!(err.contains("plugin_api_version"), "got: {}", err);
    fs::remove_dir_all(&dir).ok();
  }

  #[test]
  fn read_plugin_manifest_rejects_unknown_permission() {
    let dir = unique_temp_dir();
    fs::create_dir_all(&dir).expect("Не удалось создать временную директорию");
    fs::write(dir.join("index.js"), "console.log('x')").expect("Не удалось записать entry");
    fs::write(
      dir.join("plugin.json"),
      r#"{
        "id": "test-plugin",
        "name": "Test Plugin",
        "version": "1.0.0",
        "description": "Test",
        "author": "Mivra",
        "entry": "index.js",
        "permissions": ["dialog", "fs"],
        "apiVersion": 1
      }"#,
    )
    .expect("Не удалось записать manifest");

    let err = super::read_plugin_manifest(&dir).unwrap_err();

    assert!(err.contains("plugin_permission"), "got: {}", err);
    fs::remove_dir_all(&dir).ok();
  }

  #[test]
  fn plugin_package_source_root_accepts_single_wrapping_directory() {
    let dir = unique_temp_dir();
    let plugin_dir = dir.join("export-pdf");
    fs::create_dir_all(&plugin_dir).expect("Не удалось создать директорию плагина");
    fs::write(plugin_dir.join("plugin.json"), "{}").expect("Не удалось записать manifest");

    let root =
      super::plugin_package_source_root(&dir).expect("Пакет с одной верхней папкой должен пройти");

    assert_eq!(root, plugin_dir);
    fs::remove_dir_all(&dir).ok();
  }

  #[test]
  fn plugin_version_is_newer_compares_semver_numbers() {
    assert!(super::plugin_version_is_newer("1.2.0", "1.1.9"));
    assert!(!super::plugin_version_is_newer("1.0.0", "1.0.0"));
    assert!(!super::plugin_version_is_newer("1.0.1", "1.1.0"));
  }

  #[test]
  fn settings_missing_enabled_plugins_uses_default_builtin() {
    let settings: super::Settings = serde_json::from_str("{}").expect("JSON должен парситься");
    assert_eq!(settings.enabled_plugins, vec!["export-pdf".to_string()]);
  }

  #[test]
  fn removed_bundled_plugin_without_installed_folder_is_not_restored() {
    let mut settings = super::Settings::default();
    settings.removed_bundled_plugins = vec!["export-pdf".to_string()];

    assert!(!super::should_restore_bundled_plugin(
      &settings,
      "export-pdf",
      false,
      None,
      "1.0.2",
    ));
  }

  #[test]
  fn disabled_missing_bundled_plugin_is_not_restored() {
    let mut settings = super::Settings::default();
    settings.enabled_plugins = Vec::new();

    assert!(!super::should_restore_bundled_plugin(
      &settings,
      "export-pdf",
      false,
      None,
      "1.0.2",
    ));
  }

  #[test]
  fn invalid_installed_bundled_plugin_is_repaired() {
    let settings = super::Settings::default();

    assert!(super::should_restore_bundled_plugin(
      &settings,
      "export-pdf",
      true,
      None,
      "1.0.2",
    ));
  }

  #[test]
  fn normalize_enabled_plugins_migrates_document_designer() {
    assert_eq!(
      super::normalize_enabled_plugins(vec![
        "document-designer".to_string(),
        "export-pdf".to_string()
      ]),
      vec!["export-pdf".to_string()]
    );
  }

  #[test]
  fn copy_plugin_dir_copies_plain_files() {
    let source = unique_temp_dir();
    let dest = unique_temp_dir();
    fs::create_dir_all(&source).expect("Не удалось создать source");
    fs::write(source.join("plugin.json"), "{}").expect("Не удалось записать manifest");
    fs::write(source.join("index.js"), "console.log('x')").expect("Не удалось записать entry");

    super::copy_plugin_dir_safely(&source, &dest).expect("Копирование должно пройти");

    assert!(dest.join("plugin.json").exists());
    assert!(dest.join("index.js").exists());
    fs::remove_dir_all(&source).ok();
    fs::remove_dir_all(&dest).ok();
  }

  #[tokio::test]
  async fn save_local_asset_bytes_sanitizes_target_name() {
    let dir = unique_temp_dir();
    fs::create_dir_all(&dir).expect("Не удалось создать временную директорию");
    let base_dir = dir.to_string_lossy().to_string();

    let relative = save_local_asset_bytes(vec![1, 2, 3], base_dir, "../evil.png".to_string())
      .await
      .expect("Сохранение должно пройти");

    assert_eq!(relative, "assets/.._evil.png");
    assert!(dir.join("assets").join(".._evil.png").exists());
    assert!(!dir.join("evil.png").exists());
    fs::remove_dir_all(&dir).ok();
  }

  #[tokio::test]
  async fn save_local_asset_bytes_rejects_exe() {
    let dir = unique_temp_dir();
    fs::create_dir_all(&dir).expect("Не удалось создать временную директорию");
    let base_dir = dir.to_string_lossy().to_string();

    let err = save_local_asset_bytes(vec![1], base_dir, "payload.exe".to_string())
      .await
      .unwrap_err();

    assert!(err.contains("unsupported_extension"), "got: {}", err);
    fs::remove_dir_all(&dir).ok();
  }
}
