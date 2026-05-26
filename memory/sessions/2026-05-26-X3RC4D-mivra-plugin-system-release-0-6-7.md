# Mivra: система плагинов и релиз 0.6.7

## Контекст
Работа велась в `C:\Users\Brian\Downloads\Mivra`. Пользователь просил довести систему внешних плагинов, плагины Export PDF / Markdown TOC / OpenRouter Summary, документацию, затем создать PR, смержить в `main`, поднять версию и запустить GitHub Actions для сборок под разные платформы.

## Что сделано
- Реализована и замержена система плагинов Mivra.
- Export PDF переведён в формат внешнего плагина и используется как проверочный плагин.
- Добавлены/доработаны плагины Markdown TOC и OpenRouter Summary.
- Доработан Plugin Manager и меню `Плагины`.
- Добавлена документация для разработчиков плагинов и user guide по установке плагинов.
- Версия приложения поднята до `0.6.7`.
- Создан и запушен тег `v0.6.7`.
- Запущен release workflow, сборки успешно прошли для Windows, Linux, macOS x64 и macOS arm64.

## PR и релизы
- Основной PR: https://github.com/BrianIS8090/Mivra/pull/15
- Fix release workflow PR: https://github.com/BrianIS8090/Mivra/pull/16
- Fix release workflow with `releaseId`: https://github.com/BrianIS8090/Mivra/pull/17
- Fix prepare-release GH_REPO / notes: https://github.com/BrianIS8090/Mivra/pull/18
- GitHub Release: https://github.com/BrianIS8090/Mivra/releases/tag/v0.6.7
- Успешный release run: https://github.com/BrianIS8090/Mivra/actions/runs/26441909568

## Проверенные релизные ассеты
- `Mivra_0.6.7_x64-setup.exe`
- `Mivra_0.6.7_amd64.AppImage`
- `Mivra_0.6.7_amd64.deb`
- `Mivra_0.6.7_x64.dmg`
- `Mivra_0.6.7_aarch64.dmg`

## Проверки
Перед мерджем и релизом выполнялись:
- `npx tsc --noEmit`
- `npm run test`
- `cargo check --manifest-path src-tauri\Cargo.toml`
- `cargo clippy --manifest-path src-tauri\Cargo.toml -- -D warnings`
- `cargo test --manifest-path src-tauri\Cargo.toml`
- `npm run gen:types`
- `npm run tauri build`
- `graphify update .`

## Важные замечания
- Первый release run по тегу `v0.6.7` частично упал из-за гонки matrix jobs: несколько job пытались создать один и тот же GitHub Release.
- Workflow был исправлен через отдельный `prepare-release` job, который создаёт/находит release и передаёт `releaseId` в `tauri-apps/tauri-action@v0.6.2`.
- В GitHub Actions остаётся warning о Node.js 20 для `actions/checkout@v4` и `actions/setup-node@v4`; это предупреждение, не блокер текущего релиза.
- Локально после завершения оставались не относящиеся к задаче изменения: удаления в `.windsurf`, `docs/superpowers/plans/*`, `graphify-out/`. Их не трогали.
