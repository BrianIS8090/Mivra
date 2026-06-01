# Graph Report - .  (2026-05-28)

## Corpus Check
- Large corpus: 237 files · ~575,355 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 309 nodes · 302 edges · 92 communities (23 shown, 69 thin omitted)
- Extraction: 77% EXTRACTED · 23% INFERRED · 0% AMBIGUOUS · INFERRED: 70 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_UI Components & Hooks|UI Components & Hooks]]
- [[_COMMUNITY_PDF Export Plugin|PDF Export Plugin]]
- [[_COMMUNITY_App Core & Bindings|App Core & Bindings]]
- [[_COMMUNITY_Tauri Backend Commands|Tauri Backend Commands]]
- [[_COMMUNITY_Project Documentation & CI|Project Documentation & CI]]
- [[_COMMUNITY_React Best Practices Skills|React Best Practices Skills]]
- [[_COMMUNITY_Plugin System Documentation|Plugin System Documentation]]
- [[_COMMUNITY_Theme & i18n|Theme & i18n]]
- [[_COMMUNITY_Plugin Runtime System|Plugin Runtime System]]
- [[_COMMUNITY_S3 Upload Backend|S3 Upload Backend]]
- [[_COMMUNITY_Test Infrastructure|Test Infrastructure]]
- [[_COMMUNITY_OpenRouter Plugins|OpenRouter Plugins]]
- [[_COMMUNITY_Toast Notifications|Toast Notifications]]
- [[_COMMUNITY_App Icons|App Icons]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]

## God Nodes (most connected - your core abstractions)
1. `Vercel React Best Practices` - 16 edges
2. `Mivra Plugin System` - 13 edges
3. `App Component` - 10 edges
4. `Mivra Plugin API` - 10 edges
5. `Tauri Commands` - 9 edges
6. `Plugin Type Definitions` - 9 edges
7. `ExportPdfDialog Component` - 8 edges
8. `Editor Component` - 8 edges
9. `App Zustand Store` - 7 edges
10. `Toolbar Component` - 6 edges

## Surprising Connections (you probably didn't know these)
- `markdownTocPlugin Test Suite` --references--> `markdown-toc Plugin Styles`  [EXTRACTED]
  src/test/markdownTocPlugin.test.ts → plugins/markdown-toc/style.css
- `Markdown TOC Plugin` --references--> `MivraExternalPlugin Global`  [INFERRED]
  plugins/markdown-toc/plugin.json → src/plugins/externalPluginTypes.ts
- `OpenRouter Summary Plugin` --references--> `MivraExternalPlugin Global`  [INFERRED]
  plugins/openrouter-summary/plugin.json → src/plugins/externalPluginTypes.ts
- `OpenRouter Translate Plugin` --references--> `MivraExternalPlugin Global`  [INFERRED]
  plugins/openrouter-translate/plugin.json → src/plugins/externalPluginTypes.ts
- `Version Bump Script (npm run version:bump)` --references--> `Release Pipeline`  [EXTRACTED]
  RELEASE.md → .github/workflows/release.yml

## Communities (92 total, 69 thin omitted)

### Community 0 - "UI Components & Hooks"
Cohesion: 0.10
Nodes (28): PluginManagerDialog Component, PluginManager CSS, StatusBar Component, Toolbar Component, useFile Hook, useSettings Hook, useTheme Hook, PluginHost Component (+20 more)

### Community 1 - "PDF Export Plugin"
Cohesion: 0.10
Nodes (25): ExportPdfDialog Component, ExportPdfSettings Type, MivraExternalPlugin Global, MivraPluginApi Interface, PdfPreviewPages Component, Academic Preset, blockToPdfContent, buildExportPdfFileName (+17 more)

### Community 2 - "App Core & Bindings"
Cohesion: 0.17
Nodes (22): PluginInfo Type, S3Config Type, Tauri Commands, App Component, Editor Component, EditorContext Provider, HelpDialog Component, PluginManagerDialog Component (+14 more)

### Community 3 - "Tauri Backend Commands"
Cohesion: 0.14
Nodes (18): FileData (Rust), Settings (Rust), add_to_recent, atomic_write, open_file (Rust command), read_settings (Rust command), save_file (Rust command), save_file_as (Rust command) (+10 more)

### Community 4 - "Project Documentation & CI"
Cohesion: 0.13
Nodes (17): Mivra Development Guide, Mivra WYSIWYG Markdown Editor, Mivra Release Process, S3 Cloud Uploads, CI Pipeline, Cross-Platform Release (Windows, macOS, Linux), Mermaid Diagram Support, S3-Compatible Providers (Yandex, TimeWeb, AWS, Cloudflare R2, MinIO) (+9 more)

### Community 5 - "React Best Practices Skills"
Cohesion: 0.12
Nodes (17): Vercel React Best Practices, Vercel React Agents, Advanced Event Handler Refs, Advanced Init Once, Advanced Use Latest, Async API Routes, Async Defer Await, Async Dependencies (+9 more)

### Community 6 - "Plugin System Documentation"
Cohesion: 0.26
Nodes (15): Mivra Plugin System, Plugin User Guide, Bundled Plugins (ensure_bundled_plugins), Export PDF Plugin (Bundled), MivraPluginApi (toolbar, dialogs, document, settings, exports), .mivraplugin Package Format, OpenRouter Summary Plugin, OpenRouter Translate Plugin (+7 more)

### Community 7 - "Theme & i18n"
Cohesion: 0.23
Nodes (12): useTheme Hook, PluralForms Type, Translations Type, English Translations, i18n Index, Russian Translations, App Zustand Store, appStore Tests (+4 more)

### Community 8 - "Plugin Runtime System"
Cohesion: 0.39
Nodes (12): PluginDialogHost Component, PluginHost Component, Builtin Plugins Registry, External Plugin Loader, External Plugin Registry, External Plugin Types, Mivra Plugin API, Plugin Manifest Converter (+4 more)

### Community 9 - "S3 Upload Backend"
Cohesion: 0.18
Nodes (11): s3_upload_bytes (Rust command), s3_upload_file (Rust command), save_local_asset_bytes (Rust command), save_local_asset_file (Rust command), sanitize_filename, upload_bytes_with_secret, upload_file_with_secret, s3UploadBytes (TS wrapper) (+3 more)

### Community 10 - "Test Infrastructure"
Cohesion: 0.20
Nodes (10): Export PDF Plugin Manifest, PluginInfo (Rust), ensure_bundled_plugins (Rust command), get_installed_plugins (Rust command), install_plugin (Rust command), install_plugin_package (Rust command), plugins_dir, read_plugin_manifest (+2 more)

### Community 11 - "OpenRouter Plugins"
Cohesion: 0.33
Nodes (5): export_bindings binary, Default Tauri Capabilities, build_specta_builder, run (Tauri app entry), Tauri Config

### Community 12 - "Toast Notifications"
Cohesion: 0.50
Nodes (5): OpenRouter Summary Plugin, OpenRouter Translate Plugin, Tauri Configuration, openRouterSummaryPlugin Test Suite, openRouterTranslatePlugin Test Suite

### Community 13 - "App Icons"
Cohesion: 0.40
Nodes (5): buildRequestBody (Summary), buildRequestBody (Translate), OpenRouter API Endpoint, summarizeWithOpenRouter, translateWithOpenRouter

### Community 14 - "Community 14"
Cohesion: 0.50
Nodes (4): createHeadingBackspaceTransaction, sourceMarkdown Utilities, headingBackspace Test Suite, sourceMarkdown Test Suite

### Community 15 - "Community 15"
Cohesion: 0.67
Nodes (4): Tauri Skill, Tauri Advanced Patterns, Tauri Security Examples, Tauri Threat Model

### Community 16 - "Community 16"
Cohesion: 0.50
Nodes (4): useS3Upload Hook, useToastStore, Toast Store Test Suite, useS3Upload Hook Test Suite

### Community 17 - "Community 17"
Cohesion: 1.00
Nodes (3): mermaid (npm package), renderMermaidPreview, Mermaid Test Suite

### Community 18 - "Community 18"
Cohesion: 0.67
Nodes (3): s3_set_secret (Rust command), Keyring integration, s3SetSecret (TS wrapper)

### Community 19 - "Community 19"
Cohesion: 0.67
Nodes (3): s3_test_connection (Rust command), test_connection_with_secret, s3TestConnection (TS wrapper)

### Community 20 - "Community 20"
Cohesion: 0.67
Nodes (3): renderPreviewHtml, modernPreset (PDF Export Preset), exportPdfRender Test Suite

## Knowledge Gaps
- **146 isolated node(s):** `Tauri Advanced Patterns`, `TypeScript Advanced Types Skill`, `Vercel React Agents`, `Advanced Event Handler Refs`, `Advanced Init Once` (+141 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **69 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Release Pipeline` connect `Project Documentation & CI` to `Plugin System Documentation`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Why does `Session: Plugin System Release 0.6.7` connect `Plugin System Documentation` to `Project Documentation & CI`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Are the 16 inferred relationships involving `Vercel React Best Practices` (e.g. with `Advanced Event Handler Refs` and `Advanced Init Once`) actually correct?**
  _`Vercel React Best Practices` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `useAppStore` (e.g. with `PluginManagerDialog Component` and `createMivraPluginApi`) actually correct?**
  _`useAppStore` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Tauri Advanced Patterns`, `TypeScript Advanced Types Skill`, `Vercel React Agents` to the rest of the system?**
  _146 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `UI Components & Hooks` be split into smaller, more focused modules?**
  _Cohesion score 0.09885057471264368 - nodes in this community are weakly interconnected._
- **Should `PDF Export Plugin` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._