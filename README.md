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

**Mermaid diagrams** — create flowcharts, sequence diagrams, Gantt charts, and other visualizations right inside your document.

**Light and dark themes** — comfortable writing at any time of day. Themes switch instantly and persist between sessions.

**Real-time statistics** — word count, character count, and characters without spaces update with every keystroke.

**Native speed** — built on Tauri 2 and Rust. Launches in under a second, minimal memory footprint, instant UI response.

**S3 cloud uploads** — drag a file, paste a screenshot from clipboard, or pick a file via Toolbar — Mivra uploads it to your S3-compatible bucket (Yandex Object Storage, TimeWeb, AWS, Cloudflare R2, MinIO etc.) and inserts a public Markdown link automatically. Secret keys live in the OS keyring, not on disk. See [docs/S3.md](docs/S3.md) for setup.

## Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Save | `Ctrl+S` |
| Open file | `Ctrl+O` |
| Save as | `Ctrl+Shift+S` |
| Toggle theme | `Ctrl+Shift+T` |
| Toggle mode | `Ctrl+/` |
| Bold | `Ctrl+B` |
| Italic | `Ctrl+I` |
| Insert link | `Ctrl+K` |
| Insert table | `Ctrl+Alt+T` |
| Code block | `Ctrl+Alt+C` |

## Installation

1. Go to the [Releases](https://github.com/BrianIS8090/Mivra/releases) page
2. Download `Mivra_x.x.x_x64-setup.exe`
3. Run the installer and follow the prompts

> **System requirements:** Windows 10/11 (x64). macOS and Linux support is planned for future releases.

## For Developers

Technical documentation, project architecture, and build instructions are available in **[DEVELOPMENT.md](DEVELOPMENT.md)**.

## License

[MIT](LICENSE) — use freely.
