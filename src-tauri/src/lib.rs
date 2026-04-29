pub mod commands;
pub mod s3;

use std::env;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;
use commands::{
  get_recent_files, open_file, read_file, read_settings, s3_clear_secret, s3_secret_exists,
  s3_set_secret, s3_test_connection, s3_upload_bytes, s3_upload_file, save_file, save_file_as,
  write_settings,
};

// Глобальное состояние для хранения пути к файлу, переданному при запуске
struct PendingFilePath(Mutex<Option<String>>);

#[tauri::command]
#[specta::specta]
fn get_pending_file(state: State<PendingFilePath>) -> Option<String> {
  // Если другой поток запаникует, удерживая мьютекс — не паникуем здесь сами,
  // а восстанавливаем доступ через into_inner. Команда не критична: если
  // что-то пошло не так, безопаснее вернуть None.
  let mut guard = state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
  guard.take()
}

// Создаёт tauri_specta::Builder с зарегистрированными командами.
// Используется и в run() (для invoke_handler + опционального экспорта в dev),
// и из отдельного bin/export_bindings для генерации TS-типов без старта приложения.
pub fn build_specta_builder() -> tauri_specta::Builder<tauri::Wry> {
  tauri_specta::Builder::<tauri::Wry>::new()
    .commands(tauri_specta::collect_commands![
      open_file,
      save_file,
      save_file_as,
      read_settings,
      write_settings,
      get_recent_files,
      read_file,
      get_pending_file,
      s3_set_secret,
      s3_clear_secret,
      s3_secret_exists,
      s3_test_connection,
      s3_upload_file,
      s3_upload_bytes,
    ])
}

// Абсолютный путь к frontend bindings, независимый от текущей директории
// запуска cargo/npm/Tauri.
pub fn bindings_output_path() -> PathBuf {
  PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .join("..")
    .join("src")
    .join("bindings.ts")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Проверяем аргументы командной строки при запуске
  let args: Vec<String> = env::args().collect();
  let pending_file = if args.len() > 1 {
    let file_path = args[1].clone();
    // Проверяем, что это действительно путь к файлу markdown
    if file_path.ends_with(".md")
      || file_path.ends_with(".markdown")
      || file_path.ends_with(".mdown")
      || file_path.ends_with(".mkd")
      || file_path.ends_with(".txt") {
      Some(file_path)
    } else {
      None
    }
  } else {
    None
  };

  let builder = build_specta_builder();

  // В dev-сборке генерируем bindings.ts при старте приложения, чтобы
  // изменения в Rust-командах сразу отражались в TS. В release-сборке
  // код вообще не вкомпилируется.
  #[cfg(debug_assertions)]
  builder
    .export(
      specta_typescript::Typescript::default(),
      bindings_output_path(),
    )
    .expect("Не удалось сгенерировать TS-bindings");

  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_store::Builder::default().build())
    .manage(PendingFilePath(Mutex::new(pending_file)))
    .invoke_handler(builder.invoke_handler())
    .run(tauri::generate_context!())
    .expect("Ошибка запуска приложения");
}

#[cfg(test)]
mod tests {
  #[test]
  fn bindings_output_path_points_to_frontend_src() {
    let expected = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
      .join("..")
      .join("src")
      .join("bindings.ts");

    assert_eq!(super::bindings_output_path(), expected);
  }
}
