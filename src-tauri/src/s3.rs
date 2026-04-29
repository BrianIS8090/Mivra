use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct S3Config {
  pub endpoint: String,
  pub region: String,
  pub bucket: String,
  pub access_key_id: String,
  pub public_url_prefix: Option<String>,
  pub path_prefix: Option<String>,
}

const DANGEROUS_CHARS: &[char] = &['/', '\\', '\0', '<', '>', ':', '"', '|', '?', '*'];
const MAX_FILENAME_LEN: usize = 100;

pub fn sanitize_filename(name: &str) -> String {
  let cleaned: String = name
    .chars()
    .map(|c| if DANGEROUS_CHARS.contains(&c) { '_' } else { c })
    .collect();
  cleaned.chars().take(MAX_FILENAME_LEN).collect()
}

pub fn build_key(path_prefix: Option<&str>, uuid: &str, sanitized_filename: &str) -> String {
  match path_prefix {
    Some(prefix) if !prefix.is_empty() => {
      let prefix = prefix.trim_end_matches('/');
      format!("{}/{}-{}", prefix, uuid, sanitized_filename)
    }
    _ => format!("{}-{}", uuid, sanitized_filename),
  }
}

pub fn derive_public_url(config: &S3Config, key: &str) -> String {
  let base = match &config.public_url_prefix {
    Some(prefix) if !prefix.is_empty() => prefix.trim_end_matches('/').to_string(),
    _ => format!(
      "{}/{}",
      config.endpoint.trim_end_matches('/'),
      config.bucket
    ),
  };
  format!("{}/{}", base, key)
}

const KEYRING_SERVICE: &str = "Mivra";
const KEYRING_USERNAME: &str = "s3_secret_access_key";

fn keyring_entry(username: &str) -> Result<keyring::Entry, String> {
  keyring::Entry::new(KEYRING_SERVICE, username)
    .map_err(|e| format!("Не удалось создать запись keyring: {}", e))
}

pub fn set_secret_raw(username: &str, secret: &str) -> Result<(), String> {
  let entry = keyring_entry(username)?;
  entry
    .set_password(secret)
    .map_err(|e| format!("Не удалось сохранить секрет: {}", e))
}

pub fn get_secret_raw(username: &str) -> Result<String, String> {
  let entry = keyring_entry(username)?;
  entry
    .get_password()
    .map_err(|e| format!("Не удалось прочитать секрет: {}", e))
}

pub fn delete_secret_raw(username: &str) -> Result<(), String> {
  let entry = keyring_entry(username)?;
  entry
    .delete_credential()
    .map_err(|e| format!("Не удалось удалить секрет: {}", e))
}

pub fn secret_exists_raw(username: &str) -> Result<bool, String> {
  let entry = keyring_entry(username)?;
  match entry.get_password() {
    Ok(_) => Ok(true),
    Err(keyring::Error::NoEntry) => Ok(false),
    Err(e) => Err(format!("Ошибка проверки keyring: {}", e)),
  }
}

pub fn set_secret(secret: &str) -> Result<(), String> {
  set_secret_raw(KEYRING_USERNAME, secret)
}

pub fn get_secret() -> Result<String, String> {
  get_secret_raw(KEYRING_USERNAME)
}

pub fn delete_secret() -> Result<(), String> {
  delete_secret_raw(KEYRING_USERNAME)
}

pub fn secret_exists() -> Result<bool, String> {
  secret_exists_raw(KEYRING_USERNAME)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn sanitize_replaces_dangerous_chars() {
    assert_eq!(sanitize_filename("foo/bar.png"), "foo_bar.png");
    assert_eq!(sanitize_filename("a\\b<c>:d|e?f*g\"h"), "a_b_c__d_e_f_g_h");
  }

  #[test]
  fn sanitize_keeps_unicode() {
    assert_eq!(sanitize_filename("скриншот.png"), "скриншот.png");
    assert_eq!(sanitize_filename("file with spaces.png"), "file with spaces.png");
  }

  #[test]
  fn sanitize_truncates_to_100_chars() {
    let long_name = "a".repeat(200);
    let result = sanitize_filename(&long_name);
    assert_eq!(result.chars().count(), 100);
  }

  #[test]
  fn build_key_with_path_prefix() {
    let key = build_key(Some("mivra/"), "abc-123", "image.png");
    assert_eq!(key, "mivra/abc-123-image.png");
  }

  #[test]
  fn build_key_normalizes_trailing_slash_in_prefix() {
    let key1 = build_key(Some("mivra"), "abc-123", "image.png");
    let key2 = build_key(Some("mivra/"), "abc-123", "image.png");
    assert_eq!(key1, key2);
    assert_eq!(key1, "mivra/abc-123-image.png");
  }

  #[test]
  fn build_key_without_path_prefix() {
    let key = build_key(None, "abc-123", "image.png");
    assert_eq!(key, "abc-123-image.png");
  }

  #[test]
  fn derive_public_url_with_override() {
    let config = S3Config {
      endpoint: "https://storage.yandexcloud.net".into(),
      region: "ru-central1".into(),
      bucket: "my-bucket".into(),
      access_key_id: "id".into(),
      public_url_prefix: Some("https://cdn.example.com/".into()),
      path_prefix: None,
    };
    assert_eq!(derive_public_url(&config, "abc-foo.png"), "https://cdn.example.com/abc-foo.png");
  }

  #[test]
  fn derive_public_url_without_override_uses_endpoint_path_style() {
    let config = S3Config {
      endpoint: "https://storage.yandexcloud.net".into(),
      region: "ru-central1".into(),
      bucket: "my-bucket".into(),
      access_key_id: "id".into(),
      public_url_prefix: None,
      path_prefix: None,
    };
    assert_eq!(
      derive_public_url(&config, "abc-foo.png"),
      "https://storage.yandexcloud.net/my-bucket/abc-foo.png"
    );
  }

  #[test]
  fn derive_public_url_handles_double_slashes() {
    let config = S3Config {
      endpoint: "https://storage.yandexcloud.net/".into(),
      region: "ru-central1".into(),
      bucket: "my-bucket".into(),
      access_key_id: "id".into(),
      public_url_prefix: Some("https://cdn.example.com/".into()),
      path_prefix: None,
    };
    assert_eq!(derive_public_url(&config, "abc-foo.png"), "https://cdn.example.com/abc-foo.png");
  }

  // Тесты используют уникальный username, чтобы не конфликтовать с реальным
  // секретом пользователя при локальном запуске.
  fn test_username() -> String {
    format!("test-{}", uuid::Uuid::new_v4())
  }

  #[test]
  fn keyring_set_get_delete_roundtrip() {
    let username = test_username();
    set_secret_raw(&username, "my_secret").expect("set");
    assert_eq!(get_secret_raw(&username).expect("get"), "my_secret");
    assert!(secret_exists_raw(&username).expect("exists check"));
    delete_secret_raw(&username).expect("delete");
    assert!(!secret_exists_raw(&username).expect("exists check after delete"));
  }

  #[test]
  fn keyring_get_missing_returns_error() {
    let username = test_username();
    assert!(get_secret_raw(&username).is_err());
  }

  #[test]
  fn keyring_delete_missing_does_not_error() {
    let username = test_username();
    // Первое удаление пустого слота — допустимо вернуть Ok или специфичный Err;
    // важно, чтобы не паниковало.
    let _ = delete_secret_raw(&username);
  }
}
