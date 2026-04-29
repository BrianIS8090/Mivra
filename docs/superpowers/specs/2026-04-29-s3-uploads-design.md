# Spec — S3-загрузка файлов из редактора

**Дата:** 2026-04-29
**Цель:** позволить пользователю загружать картинки и документы напрямую из редактора в S3-совместимый bucket. Mivra автоматически формирует публичную ссылку и вставляет markdown-узел `![]()` или `[]()`. Это нужно, чтобы при передаче `.md` другому человеку картинки открывались из интернета, а не из локального `assets/`.

## Контекст и мотивация

Сейчас редактор хранит вложения локально через `pickAndFormatAsset` (`src/utils/paths.ts`): диалог открывается в `{baseDir}/assets/`, в документ вставляется относительная ссылка. При шаринге `.md` получатель не видит картинок, пока ему отдельно не передадут содержимое `assets/`.

Решение — параллельный путь через S3-совместимое облако. Пользователь настраивает один раз (endpoint, ключи, bucket), и далее любая вставка идёт сразу в облако с готовым публичным URL.

Целевые провайдеры — Yandex Object Storage и TimeWeb Cloud Storage; протокол S3 generic, поэтому фактически работает с AWS, Cloudflare R2, Backblaze B2, Selectel, MinIO без правок.

## Scope

В этой итерации:
- Конфигурация провайдера S3 в UI (endpoint, region, bucket, access key id + secret, опциональные public URL prefix и path prefix).
- Secret хранится в OS keyring, не в `settings.json`.
- Загрузка через три триггера: drag & drop, paste из буфера обмена, кнопка Toolbar / Ctrl+Shift+A.
- Whitelist расширений (картинки + pdf/zip/mp4/webm).
- Soft-warn при размере >10 MB, hard-limit 100 MB.
- Toast-индикация прогресса.
- Retry x3 (1s/2s/4s) на network/5xx, без retry на 4xx.
- Test connection в форме настроек.

Не входит:
- Локальный fallback при настроенном S3 (S3 = total override).
- Сохранение paste/drop без S3 в локальный `assets/` (в этой итерации paste без S3 показывает toast «настройте S3», drop без S3 — игнорируется).
- Прогресс-бар для multipart-загрузок крупных файлов.
- UI для удаления файлов из bucket'а.
- Presigned URLs для приватных bucket'ов.
- Миграция URL'ов в существующих документах при смене провайдера.

## Архитектура

```
Frontend (React/TS)                         Rust (Tauri commands)
─────────────────────                       ─────────────────────
Toolbar [«S3» button] ──→ S3SettingsDialog  s3_set_secret(secret)
                              │             s3_clear_secret()
                              │             s3_secret_exists() -> bool
                              ▼             s3_test_connection(config)
                          IPC commands ◄──→ s3_upload_file(path, name, config)
                                            s3_upload_bytes(bytes, name, config)
Editor                                                 │
 ├─ ondrop  ─────┐                                     ▼
 ├─ onpaste ─────┼──→ useS3Upload                 OS Keyring
 └─ insertAsset ─┘    (toast + IPC)            (Windows Credential
       │                                        Manager / Keychain)
       ▼                                              │
  applyMarkdownAction                                 │
  (вставка ![]() в                                    ▼
   позицию курсора)                              S3 Bucket (rust-s3)
```

**Граничные условия:**
- `secret` НИКОГДА не идёт через `settings.json` и не возвращается из Rust на фронт. Фронт пишет → Rust сохраняет в keyring; Rust сам читает при upload. Фронт может только узнать «есть ли секрет?» и удалить его.
- При переустановке OS / удалении профиля keyring чистится → пользователь заново вводит ключ. `settings.json` сохраняет endpoint/region/bucket — не надо повторно вводить всё.
- specta-bindings: `S3Config` экспортируется как TS-тип автоматически из Rust.

## Структуры данных

### Rust (commands.rs, через specta)

```rust
#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct S3Config {
  pub endpoint: String,                   // https://storage.yandexcloud.net
  pub region: String,                     // ru-central1
  pub bucket: String,                     // my-bucket
  pub access_key_id: String,              // YCAJ...
  pub public_url_prefix: Option<String>,  // https://cdn.mysite.com/, иначе авто
  pub path_prefix: Option<String>,        // mivra/, иначе корень bucket'а
}

pub struct Settings {
  // ... существующие поля
  #[serde(default)]
  pub s3: Option<S3Config>,               // None до первой настройки
}
```

### IPC контракт

```rust
s3_set_secret(secret: String)             -> Result<(), String>
s3_clear_secret()                         -> Result<(), String>
s3_secret_exists()                        -> Result<bool, String>

s3_test_connection(config: S3Config)      -> Result<(), String>
// HEAD на bucket. Без записи. Возвращает Ok при 200/204; иначе строковая ошибка
// auth_failed / bucket_not_found / network_unreachable / unknown.

s3_upload_file(
  local_path: String,
  original_filename: String,
  config: S3Config,
) -> Result<String, String>
// Вернёт public URL для вставки в markdown.

s3_upload_bytes(
  bytes: Vec<u8>,
  original_filename: String,
  config: S3Config,
) -> Result<String, String>
// То же, но из буфера/clipboard. Tauri 2 передаёт Uint8Array binary frame.
```

### Frontend хук

```ts
// src/hooks/useS3Upload.ts
export function useS3Upload() {
  const ready: boolean;  // settings.s3 != null && s3_secret_exists()
  uploadAndInsertFile(path: string, name: string): Promise<void>;
  uploadAndInsertBytes(bytes: Uint8Array, name: string): Promise<void>;
}
```

## Data flow

### Drag & drop

```
Tauri native event 'tauri://drag-drop' → массив локальных путей
для каждого пути:
  1. ext check vs whitelist → не совпало: toast «не поддерживается»
  2. metadata.size → если >100 MB: toast hard-fail
                   → если >10 MB: confirm dialog «Загрузить N MB?»
  3. if S3 ready:
       toast.show("Загрузка name (i/N)...")
       IPC s3_upload_file(path, basename, config)
       success → applyMarkdownAction insert ![name](url)
       error   → toast.error
     else: ничего (drop без S3 в текущей итерации не обрабатывается)
```

### Paste из буфера

```
'paste' listener на document, capture phase (раньше Crepe):
  1. event.clipboardData.items → ищем kind='file' & type^='image/'
     не нашли: пропускаем (текст обрабатывает Crepe штатно)
  2. e.preventDefault(); e.stopPropagation()
  3. blob → ArrayBuffer → Uint8Array
  4. имя: clipboard-{Date.now()}.{ext по mime}
  5. if S3 ready:
       toast.show("Загрузка clipboard-...")
       IPC s3_upload_bytes(bytes, name, config)
       success → applyMarkdownAction insert ![](url)
       error   → toast.error
     else: toast.info("Настройте S3, чтобы вставлять из буфера")
```

### Кнопка Toolbar / Ctrl+Shift+A

```
useMarkdownActions.insertAssetAction:
  if S3 ready:
    @tauri-apps/plugin-dialog open с whitelist filter
    user pick path → name
    size check → confirm если >10 MB
    toast.show("Загрузка name...")
    IPC s3_upload_file(path, name, config)
    success → applyMarkdownAction insert
    error   → toast.error
  else:
    pickAndFormatAsset (СУЩЕСТВУЮЩЕЕ поведение, не трогаем)
    → возвращает relative markdown → applyMarkdownAction insert
```

## Параметры и константы

```
WHITELIST_IMG  = png, jpg, jpeg, gif, webp, svg, bmp, apng, avif, tiff, tif, heic
WHITELIST_DOC  = pdf, zip, mp4, webm
SIZE_WARN      = 10 MB → confirm
SIZE_HARD      = 100 MB → отказ
RETRY_DELAYS   = 1s / 2s / 4s
KEY_FORMAT     = {path_prefix?}{uuid}-{sanitized_filename}
                 sanitize: оставляем юникод, заменяем на _ только опасные
                 символы / \ \0 < > : " | ? *
                 sanitized_filename ограничен 100 символами (без UUID-префикса)
S3_URL_STYLE   = path-style (Bucket::with_path_style() в rust-s3) — Yandex,
                 TimeWeb и большинство S3-compatible требуют именно так,
                 vhost-style на них не работает
CLIPBOARD_MIME = image/png  → png
                 image/jpeg → jpg
                 image/gif  → gif
                 image/webp → webp
                 другие mime игнорируем (передаём в Crepe)
```

### Markdown шаблоны

| Тип | Шаблон |
|---|---|
| Image | `![{name}]({public_url})\n` |
| Document | `[{name}]({public_url})\n` |

`{name}` — `original_filename` без расширения.

## UI

### Toolbar

Новая кнопка «S3» **слева** от «Справка». Открывает `<S3SettingsDialog>`.

### S3SettingsDialog

Поля формы:
- Endpoint URL (text, required, placeholder `https://storage.yandexcloud.net`)
- Region (text, required, placeholder `ru-central1`)
- Bucket (text, required)
- Access Key ID (text, required)
- Access Key Secret (password, write-only — если не заполнено в форме, существующий секрет в keyring остаётся)
  - При наличии существующего секрета поле подписано «••• сохранён» с кнопкой «Очистить».
- Public URL prefix (text, optional, placeholder `https://cdn.mysite.com/ или авто`)
- Path prefix (text, optional, placeholder `mivra/`)

Кнопки:
- «Тест соединения» — IPC `s3_test_connection`, спиннер → ✓ / ✗ с текстом
- «Сохранить» — IPC `s3_set_secret` (если поле заполнено) + `write_settings` с обновлённым `Settings.s3`
- «Отмена» — закрыть модал без сохранения

### Toast

Новый компонент `<ToastContainer>` + хук `useToast`:
- очередь до 5 одновременных
- типы: `loading` (spinner), `success` (auto-dismiss 2s), `error` (sticky, кнопка ✕), `info` (auto-dismiss 4s)
- API: `show(msg, type) → id`, `update(id, msg, type?)`, `dismiss(id)`

## Capabilities (Tauri)

`src-tauri/capabilities/default.json` дополнить:
- `fs:allow-write-file` со scope `$TEMP/**` (для clipboard paste, если приймет решение использовать temp-файлы; в текущей реализации не нужен — паст идёт через bytes IPC).
- При необходимости загрузки крупных файлов через path-метод — `fs:allow-read-file` со scope `**` (уже есть для текущего workflow).

CSP в `tauri.conf.json`: `connect-src` оставить с `ipc:` + `https:` — S3-запросы идут из Rust, webview-CSP их не видит. Не сужаем по конкретным доменам S3, чтобы не ломать конфиг при добавлении нового провайдера.

## Errors

| Источник | Поведение |
|---|---|
| Network (timeout/connect) | retry x3 → toast «Не удалось подключиться к S3» |
| HTTP 5xx | retry x3 → toast с raw status |
| HTTP 401/403 | без retry → toast «Проверьте Access Key и права на bucket» |
| HTTP 404 | без retry → toast «Bucket {name} не найден» |
| HTTP 4xx другое | без retry → toast с status + body |
| Keyring miss | toast «Секрет не настроен. Откройте настройки S3» |
| Whitelist miss | toast «{name}: расширение не поддерживается» |
| Size > 100 MB | toast «{name}: файл слишком большой» |
| IO (path не существует) | toast с raw error |

## Edge cases

1. **Изменение настроек во время upload.** `config` передаётся в IPC по value, upload получает снимок. Текущий завершится в старый bucket, следующий — в новый.
2. **Удаление secret во время upload.** Secret читается keyring'ом в начале команды и держится в памяти Rust. Завершится корректно. Следующий upload → «secret_not_set».
3. **Кириллица в filename.** Сохраняется в key (S3 поддерживает юникод). rust-s3 кодирует в URL при подписи. В markdown URL вставляется как есть; браузер декодирует.
4. **Sanitize.** Оставляем юникод, заменяем только опасные символы (`/ \ \0 < > : " | ? *`) на `_`. Длина итогового имени до 100 символов.
5. **Concurrency.** Несколько одновременных upload'ов — независимые Promise, toast'ы стекуются. Вставка в редактор по факту завершения (не по порядку запуска).
6. **Unmount во время upload.** `handleRef.current.editor` после unmount = null — вставка тихо пропускается, toast остаётся.
7. **CSP.** S3-запросы идут из Rust, не из webview, на CSP не влияют. img-src уже разрешает `https:`.

## Testing

### Rust (commands.rs `mod tests`)

- Снапшот-тест `S3Config` через specta (ключи и типы соответствуют ожиданию).
- `s3_upload_with_mock` через wiremock или mockito:
  - happy path: `PUT /bucket/key` → 200 → public_url корректен
  - 403 → Err без retry
  - 500 x3 → Err после трёх попыток
  - sequence 503 → 503 → 200 → success
- Sanitize: `/foo/bar` → `_foo_bar`, `имя файла.png` → `имя файла.png`, `con.txt` → `con.txt`.
- Key construction: с/без `path_prefix`, разные сочетания.

### Frontend (vitest)

- `useS3Upload`:
  - `ready=true` когда `settings.s3` существует И `s3_secret_exists` вернул true
  - `uploadAndInsertBytes` зовёт IPC `s3_upload_bytes` с правильными аргументами
  - `applyMarkdownAction` зовётся с правильным URL после успешного IPC
  - Ошибка IPC → toast.error
- `Toast`: show/update/dismiss, max 5 одновременных, queue-семантика.
- `S3SettingsDialog`:
  - Загружает текущий config из store
  - При Save отправляет в IPC `s3_set_secret` (только если поле непустое) + `write_settings`
  - «Тест соединения» — мокнутый IPC, asserts spinner → success/error state

### Manual smoke (после реализации)

- Yandex Object Storage: создать bucket, ввести ключи, paste скриншот (Win+Shift+S → Ctrl+V), убедиться, что ссылка открывается в браузере.
- TimeWeb Cloud Storage: то же.
- Drag из проводника `.png`, `.pdf`, `.exe` (отказ).
- Видео 50 MB: warn-confirm → загружается.
- Невалидный ключ → re-test → toast 401/403.
- Отключить интернет → upload → 3 ретрая → ошибка.

## Порядок реализации (для writing-plans)

1. **Rust базовая инфраструктура.** Cargo dep `rust-s3`, `keyring`, `uuid`, `bytes`. `S3Config` struct + serde + specta::Type. Команды set/clear/exists/test для secret. Юнит-тесты sanitize и key construction.
2. **Rust upload core.** `do_upload(reader, ...)` приватная функция. Команды `s3_upload_file` и `s3_upload_bytes`. Retry логика. Mock-тесты через wiremock.
3. **specta regen.** Перегенерировать `src/bindings.ts`. Обновить `src/utils/tauri.ts` обёртки. Settings type автоматически.
4. **Frontend toast infrastructure.** Компонент + хук + Zustand-стор для очереди. CSS под существующие переменные.
5. **Frontend useS3Upload.** Логика ready-check, upload bytes/file, обёртка в toast. Юнит-тесты через мок IPC.
6. **S3SettingsDialog.** Форма, валидация, кнопка S3 в Toolbar слева от «Справка». i18n строки RU/EN.
7. **Триггеры в Editor.**
   - drag-drop через Tauri event `tauri://drag-drop`
   - paste через document listener (capture phase)
   - кнопка через `useMarkdownActions.insertAssetAction` (расширение существующего)
8. **Smoke + полировка.** Ручная проверка с реальным Yandex bucket. Корректировка edge cases.

## Затронутые/новые файлы

**Новые:**
- `src/components/S3Settings/S3SettingsDialog.tsx` + `s3-settings.css`
- `src/components/Toast/Toast.tsx` + `toast.css`
- `src/hooks/useS3Upload.ts`
- `src/hooks/useToast.ts`
- `src-tauri/src/s3.rs` (новый модуль с upload-логикой) — или дополнение `commands.rs`

**Изменения:**
- `src-tauri/Cargo.toml` — `rust-s3`, `keyring`, `uuid`, `bytes`, `wiremock` (dev)
- `src-tauri/src/commands.rs` — `S3Config`, расширенный `Settings`, secret-команды, test_connection
- `src-tauri/src/lib.rs` — регистрация новых команд в specta builder
- `src/bindings.ts` — авто-перегенерируется
- `src/components/Toolbar/Toolbar.tsx` — кнопка S3
- `src/components/Editor/Editor.tsx` — drop-handler, paste-handler
- `src/hooks/useMarkdownActions.ts` — расширение insertAssetAction для S3-флоу
- `src/stores/appStore.ts` — `s3: S3Config | null` в state, action `setS3Config`
- `src/types/index.ts` — реэкспорт `S3Config` из bindings
- `src/i18n/ru.ts` + `en.ts` — все строки настроек, ошибок, toast'ов
- `src-tauri/capabilities/default.json` — fs scope для temp при необходимости
- `src/utils/tauri.ts` — обёртки над новыми bindings-командами
