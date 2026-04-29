#!/usr/bin/env node
// Меняет версию проекта одновременно в трёх файлах:
//   - package.json                 (источник для frontend через __APP_VERSION__)
//   - src-tauri/Cargo.toml         (Rust-крейт)
//   - src-tauri/tauri.conf.json    (имя установщика и метаданные bundle)
//
// Использование:
//   node scripts/bump-version.mjs 0.7.0
//   npm run version:bump -- 0.7.0
//
// После запуска покажет следующие шаги (git commit + tag + push).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const newVersion = process.argv[2];
if (!newVersion) {
  console.error('Использование: node scripts/bump-version.mjs <X.Y.Z>');
  process.exit(1);
}
if (!SEMVER_REGEX.test(newVersion)) {
  console.error(`Некорректный формат версии: "${newVersion}". Ожидается X.Y.Z (опционально с pre-release).`);
  process.exit(1);
}

const targets = [
  { file: 'package.json', kind: 'json' },
  { file: 'src-tauri/tauri.conf.json', kind: 'json' },
  { file: 'src-tauri/Cargo.toml', kind: 'cargo' },
];

let oldVersion = null;

for (const target of targets) {
  const path = join(root, target.file);
  const raw = readFileSync(path, 'utf8');

  if (target.kind === 'json') {
    const parsed = JSON.parse(raw);
    if (oldVersion === null) oldVersion = parsed.version;
    if (parsed.version === newVersion) {
      console.log(`= ${target.file}: уже ${newVersion}, пропускаю`);
      continue;
    }
    parsed.version = newVersion;
    // Сохраняем форматирование, близкое к существующему: 2 пробела + trailing newline.
    writeFileSync(path, JSON.stringify(parsed, null, 2) + '\n');
    console.log(`✓ ${target.file}: ${newVersion}`);
  } else if (target.kind === 'cargo') {
    // Регексп на ПЕРВУЮ строку version = "..." в Cargo.toml.
    // Не парсим TOML целиком, чтобы не зависеть от лишних библиотек и не
    // ломать форматирование (включая комментарии и [package] группировку).
    const match = raw.match(/^(version\s*=\s*")([^"]+)(")/m);
    if (!match) {
      console.error(`Не нашёл строку version = "..." в ${target.file}`);
      process.exit(1);
    }
    const currentVersion = match[2];
    if (oldVersion === null) oldVersion = currentVersion;
    if (currentVersion === newVersion) {
      console.log(`= ${target.file}: уже ${newVersion}, пропускаю`);
      continue;
    }
    const updated = raw.replace(
      /^(version\s*=\s*")([^"]+)(")/m,
      `$1${newVersion}$3`,
    );
    writeFileSync(path, updated);
    console.log(`✓ ${target.file}: ${newVersion}`);
  }
}

console.log();
if (oldVersion === newVersion) {
  console.log('Все файлы уже на этой версии, изменений нет.');
  process.exit(0);
}

console.log(`Версия: ${oldVersion} → ${newVersion}`);
console.log();
console.log('Следующие шаги:');
console.log('  cargo check --manifest-path src-tauri/Cargo.toml   # обновит Cargo.lock');
console.log('  git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json');
console.log(`  git commit -m "chore: bump version to ${newVersion}"`);
console.log(`  git tag v${newVersion}`);
console.log(`  git push && git push origin v${newVersion}`);
