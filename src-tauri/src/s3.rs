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

use s3::bucket::Bucket;
use s3::creds::Credentials;
use s3::region::Region;
use std::time::Duration;

#[cfg(not(test))]
const RETRY_DELAYS_MS: &[u64] = &[1000, 2000, 4000];
#[cfg(test)]
const RETRY_DELAYS_MS: &[u64] = &[10, 20, 40];

const MAX_ATTEMPTS: usize = 3;

fn build_bucket(config: &S3Config, secret: &str) -> Result<Bucket, String> {
  let credentials = Credentials::new(
    Some(&config.access_key_id),
    Some(secret),
    None,
    None,
    None,
  )
  .map_err(|e| format!("Ошибка credentials: {}", e))?;

  let region = Region::Custom {
    region: config.region.clone(),
    endpoint: config.endpoint.clone(),
  };

  let bucket = Bucket::new(&config.bucket, region, credentials)
    .map_err(|e| format!("Ошибка инициализации bucket: {}", e))?
    .with_path_style();

  Ok(*bucket)
}

fn classify_error_status(status: u16) -> bool {
  // true → стоит ретраить
  status >= 500 || status == 0
}

pub async fn upload_bytes_with_secret(
  config: &S3Config,
  secret: &str,
  bytes: Vec<u8>,
  original_filename: &str,
) -> Result<String, String> {
  let bucket = build_bucket(config, secret)?;
  let sanitized = sanitize_filename(original_filename);
  let id = uuid::Uuid::new_v4().to_string();
  let key = build_key(config.path_prefix.as_deref(), &id, &sanitized);

  let content_type = mime_guess::from_path(&sanitized)
    .first_or_octet_stream()
    .to_string();

  let mut last_err: Option<String> = None;
  for attempt in 0..MAX_ATTEMPTS {
    if attempt > 0 {
      tokio::time::sleep(Duration::from_millis(RETRY_DELAYS_MS[attempt - 1])).await;
    }

    let result = bucket
      .put_object_with_content_type(&key, &bytes, &content_type)
      .await;

    match result {
      Ok(response) => {
        let status = response.status_code();
        if (200..300).contains(&status) {
          return Ok(derive_public_url(config, &key));
        }
        if !classify_error_status(status) {
          return Err(format!("HTTP {}: {}", status, String::from_utf8_lossy(response.bytes())));
        }
        last_err = Some(format!("HTTP {}", status));
      }
      Err(e) => {
        last_err = Some(format!("network: {}", e));
      }
    }
  }

  Err(last_err.unwrap_or_else(|| "Неизвестная ошибка загрузки".to_string()))
}

pub async fn upload_file_with_secret(
  config: &S3Config,
  secret: &str,
  local_path: &str,
  original_filename: &str,
) -> Result<String, String> {
  let bytes = std::fs::read(local_path).map_err(|e| format!("Ошибка чтения файла: {}", e))?;
  upload_bytes_with_secret(config, secret, bytes, original_filename).await
}

// Проверка соединения с S3: HEAD-запрос по корню bucket с категоризацией ошибок.
pub async fn test_connection_with_secret(config: &S3Config, secret: &str) -> Result<(), String> {
  let bucket = build_bucket(config, secret)?;

  match bucket.head_object("/").await {
    Ok((_, status)) if (200..300).contains(&status) => Ok(()),
    Ok((_, 404)) => Err("bucket_not_found: bucket не существует или нет прав".to_string()),
    Ok((_, 401)) | Ok((_, 403)) => {
      Err("auth_failed: проверьте Access Key и права на bucket".to_string())
    }
    Ok((_, status)) => Err(format!("HTTP {}", status)),
    Err(e) => Err(format!("network_unreachable: {}", e)),
  }
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

  use wiremock::matchers::method;
  use wiremock::{Mock, MockServer, ResponseTemplate};

  fn test_config(endpoint: String) -> S3Config {
    S3Config {
      endpoint,
      region: "us-east-1".to_string(),
      bucket: "test-bucket".to_string(),
      access_key_id: "test-key".to_string(),
      public_url_prefix: None,
      path_prefix: None,
    }
  }

  #[tokio::test]
  async fn upload_bytes_succeeds_on_200() {
    let server = MockServer::start().await;
    Mock::given(method("PUT"))
      .respond_with(ResponseTemplate::new(200))
      .mount(&server)
      .await;

    let config = test_config(server.uri());
    let url = upload_bytes_with_secret(&config, "test_secret", b"hello".to_vec(), "test.txt")
      .await
      .expect("upload should succeed");
    assert!(url.ends_with("test.txt"));
    assert!(url.contains("test-bucket"));
  }

  #[tokio::test]
  async fn upload_bytes_fails_on_403_without_retry() {
    let server = MockServer::start().await;
    Mock::given(method("PUT"))
      .respond_with(ResponseTemplate::new(403))
      .expect(1)
      .mount(&server)
      .await;

    let config = test_config(server.uri());
    let result = upload_bytes_with_secret(&config, "secret", b"x".to_vec(), "f.txt").await;
    assert!(result.is_err(), "403 should fail");
  }

  #[tokio::test]
  async fn upload_bytes_retries_on_500_then_succeeds() {
    let server = MockServer::start().await;
    Mock::given(method("PUT"))
      .respond_with(ResponseTemplate::new(500))
      .up_to_n_times(2)
      .mount(&server)
      .await;
    Mock::given(method("PUT"))
      .respond_with(ResponseTemplate::new(200))
      .mount(&server)
      .await;

    let config = test_config(server.uri());
    let result = upload_bytes_with_secret(&config, "secret", b"x".to_vec(), "f.txt").await;
    assert!(result.is_ok(), "should succeed after retry");
  }

  #[tokio::test]
  async fn upload_bytes_fails_after_three_500s() {
    let server = MockServer::start().await;
    Mock::given(method("PUT"))
      .respond_with(ResponseTemplate::new(500))
      .expect(3)
      .mount(&server)
      .await;

    let config = test_config(server.uri());
    let result = upload_bytes_with_secret(&config, "secret", b"x".to_vec(), "f.txt").await;
    assert!(result.is_err(), "should fail after 3 retries");
  }

  use wiremock::matchers::any;

  #[tokio::test]
  async fn test_connection_succeeds_on_200() {
    let server = MockServer::start().await;
    Mock::given(method("HEAD"))
      .respond_with(ResponseTemplate::new(200))
      .mount(&server)
      .await;

    let config = test_config(server.uri());
    assert!(test_connection_with_secret(&config, "secret").await.is_ok());
  }

  #[tokio::test]
  async fn test_connection_fails_on_403() {
    let server = MockServer::start().await;
    Mock::given(any())
      .respond_with(ResponseTemplate::new(403))
      .mount(&server)
      .await;

    let config = test_config(server.uri());
    let err = test_connection_with_secret(&config, "secret").await.unwrap_err();
    assert!(err.contains("403") || err.contains("auth"), "got: {}", err);
  }

  #[tokio::test]
  async fn test_connection_fails_on_404() {
    let server = MockServer::start().await;
    Mock::given(any())
      .respond_with(ResponseTemplate::new(404))
      .mount(&server)
      .await;

    let config = test_config(server.uri());
    let err = test_connection_with_secret(&config, "secret").await.unwrap_err();
    assert!(err.contains("404") || err.contains("not_found"), "got: {}", err);
  }
}
