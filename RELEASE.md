# Как выпустить новую версию

## Шаг 1 — Обновить версию

Обновить номер версии в трёх файлах:

| Файл | Поле |
|------|------|
| `package.json` | `"version"` |
| `src-tauri/tauri.conf.json` | `"version"` |
| `src-tauri/Cargo.toml` | `version` |

## Шаг 2 — Закоммитить и запушить

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: bump version to 0.4.0"
git push
```

## Шаг 3 — Создать тег и запушить

```bash
git tag v0.4.0
git push origin v0.4.0
```

После пуша тега GitHub Actions автоматически:

1. Запускает сборку на трёх платформах параллельно (Windows, macOS, Linux)
2. Собирает установщики:
   - **Windows**: `.exe` (NSIS installer)
   - **macOS**: `.dmg` (Apple Silicon + Intel)
   - **Linux**: `.deb` + `.AppImage`
3. Создаёт GitHub Release на странице `Releases` репозитория
4. Прикрепляет все установщики к релизу

## Где скачать

После завершения сборки (обычно 5-10 минут) установщики доступны на:

```
https://github.com/BrianIS8090/Mivra/releases
```

## Статус сборки

Прогресс сборки можно отслеживать во вкладке **Actions** репозитория:

```
https://github.com/BrianIS8090/Mivra/actions
```

## Локальная сборка (только Windows)

Если нужен установщик только для текущей платформы:

```bash
npm run tauri build
```

Результат: `src-tauri/target/release/bundle/nsis/Mivra_X.Y.Z_x64-setup.exe`
