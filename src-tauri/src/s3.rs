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
