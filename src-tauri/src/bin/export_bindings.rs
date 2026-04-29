// Бинарь для офлайн-генерации src/bindings.ts без запуска Tauri-приложения.
// Используется через `npm run gen:types` или CI, чтобы убедиться, что
// закоммиченный bindings.ts соответствует Rust-командам.

fn main() {
  mivra_lib::build_specta_builder()
    .export(
      specta_typescript::Typescript::default(),
      "../src/bindings.ts",
    )
    .expect("Не удалось сгенерировать TS-bindings");
  println!("✓ Сгенерирован src/bindings.ts");
}
