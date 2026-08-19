<div align="center">


# Mivra — WYSIWYG Markdown Editor for Windows 11
Mivra is a free, open-source visual Markdown editor for Windows 10/11. It edits local `.md` files in WYSIWYG mode, supports raw Markdown source, Mermaid diagrams, dark themes, and S3-compatible uploads.

<img width="1774" height="887" alt="Mivra WYSIWYG Markdown editor for Windows 11 screenshot" src="https://github.com/user-attachments/assets/1b639331-7b89-4d70-ac26-867795a87bdc" />


### A Modern Markdown Editor for Windows

[![Windows](https://img.shields.io/badge/Platform-Windows-0078D4?logo=windows&logoColor=white)](https://github.com/BrianIS8090/Mivra/releases)
[![Tauri 2](https://img.shields.io/badge/Tauri-2.0-FFC131?logo=tauri&logoColor=white)](https://tauri.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**A lightweight, fast, and intuitive Markdown file editor with native performance.**

[Download](https://github.com/BrianIS8090/Mivra/releases) · [Developer Docs](DEVELOPMENT.md)

</div>

---
## What is Mivra?

Mivra is a lightweight alternative to heavy Electron Markdown editors for Windows users who want visual Markdown editing, local files, Mermaid diagrams, and fast startup.


## Why another editor?

Most Markdown editors are either bloated Electron apps consuming hundreds of megabytes of RAM, or minimal text fields with no visual preview.

**Mivra** strikes the perfect balance: a native Windows application built with Rust that launches instantly, uses minimal resources, and still offers a full-featured visual editor.

## Supported Markdown features

- GitHub Flavored Markdown-style tables and task lists
- Headings, lists, links, code blocks, blockquotes
- Mermaid diagrams
- Raw Markdown source mode

## Why Mivra?

- Local `.md` files, no vault lock-in
- Windows-first design
- Built with Tauri 2 and Rust
- Visual editing plus source mode


<img width="1200" height="800" alt="Mivra WYSIWYG Markdown editor for Windows 11 screenshot" src="https://github.com/user-attachments/assets/b6756979-ca53-4f86-85b3-ebe0b72a1458" />



## Features

**Visual editing** — write in WYSIWYG mode with instant preview. Headings, lists, tables, code — everything renders exactly as it will appear in the final document.

**Dual editing modes** — switch between the visual editor and raw Markdown source with a single keystroke. Perfect for those who want to see the markup directly.

**Desktop-style menu bar** — classic File / Edit / View / Plugins / Tools / Help menus with shortcuts and recent files. The toolbar stays focused on document editing only.

**Find and replace** — `Ctrl+F` / `Ctrl+H`: match highlighting in visual mode, wrap-around navigation, case sensitivity, replace current or all at once.

**Autosave** — optional automatic saving a couple of seconds after you stop typing. Toggle it in the toolbar or via Tools menu; a status-bar indicator shows when it's on.

**Spellcheck** — underlining as you type, in both visual and source modes.

**Mermaid diagrams** — create flowcharts, sequence diagrams, Gantt charts, and other visualizations right inside your document.

**Light and dark themes** — comfortable writing at any time of day. Themes switch instantly and persist between sessions.

**Real-time statistics** — word count, character count, and characters without spaces update with every keystroke.

**Native speed** — built on Tauri 2 and Rust. Launches in under a second, minimal memory footprint, instant UI response.

**Plugins** — extend Mivra with external plugins (`.mivraplugin` packages) with a manifest-based permission system. Bundled out of the box: PDF export with themes, document import (DOCX/PDF/XLSX/CSV), table of contents, and OpenRouter-based translate/summary. See [docs/PLUGINS.md](docs/PLUGINS.md) and the [Plugin User Guide](docs/PLUGIN_USER_GUIDE.md).

**Printing and PDF export** — print via `Ctrl+P` or export a styled PDF with headers, footers, and page numbers.

**S3 cloud uploads** — drag a file, paste a screenshot from clipboard, or pick a file via Toolbar — Mivra uploads it to your S3-compatible bucket (Yandex Object Storage, TimeWeb, AWS, Cloudflare R2, MinIO etc.) and inserts a public Markdown link automatically. Secret keys live in the OS keyring, not on disk. See [docs/S3.md](docs/S3.md) for setup.

## Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Save | `Ctrl+S` |
| Open file | `Ctrl+O` |
| Save as | `Ctrl+Shift+S` |
| Find | `Ctrl+F` |
| Replace | `Ctrl+H` |
| Print | `Ctrl+P` |
| Toggle theme | `Ctrl+Shift+T` |
| Toggle mode | `Ctrl+/` |
| Bold | `Ctrl+B` |
| Italic | `Ctrl+I` |
| Strikethrough | `Ctrl+Shift+X` |
| Insert link | `Ctrl+K` |
| Insert image | `Ctrl+Shift+K` |
| Insert table | `Ctrl+Alt+T` |
| Task list (checkbox) | `Ctrl+Alt+X` |
| Code block | `Ctrl+Alt+C` |

## Installation

1. Go to the [Releases](https://github.com/BrianIS8090/Mivra/releases) page
2. Download the installer for your platform:
   - **Windows**: `Mivra_x.x.x_x64-setup.exe`
   - **macOS**: `Mivra_x.x.x_aarch64.dmg` (Apple Silicon) or `Mivra_x.x.x_x64.dmg` (Intel)
   - **Linux**: `Mivra_x.x.x_amd64.deb` or `Mivra_x.x.x_amd64.AppImage`
3. Run the installer and follow the prompts

> **System requirements:** Windows 10/11 (x64) — the primary, best-tested platform. macOS and Linux builds are produced by the release pipeline and are not covered by the same level of manual testing.

## For Developers

Technical documentation, project architecture, and build instructions are available in **[DEVELOPMENT.md](DEVELOPMENT.md)**.

## License

[MIT](LICENSE) — use freely.
