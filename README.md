# Markdown Viewer (Desktop)

A lightweight **desktop Markdown editor + live preview** built with **Tauri v2**, **Vite**, and **Toast UI Editor**.

The app is optimized for fast note-taking with:

- A single-pane WYSIWYG experience (edit + rendered output in the same surface)
- Sidebar outline (headings hierarchy)
- Local “vault” storage (notes, scratch, history)
- Dark mode + typography controls (font size, line height, paragraph spacing)
- Optional spellcheck toggle

---

## Project structure

- `markdown-viewer/` — Tauri + frontend source code
- `testsMDs/` — Markdown fixtures to validate rendering and outline behavior
- `docs/` — Development notes (WSL/GitHub flow, etc.)

---

## Requirements

### Development

- Node.js (LTS recommended)
- Rust (via `rustup`)
- Windows build tools for Tauri on Windows (Visual Studio Build Tools / Windows SDK)

---

## Run (dev)

```bash
cd markdown-viewer
npm install
npm run tauri dev
```

Hot reload runs while `tauri dev` is active.

---

## Build (Windows)

```bash
cd markdown-viewer
npm install
npm run tauri build
```

---

## Where the app stores data (Vault)

The app stores data inside your Windows Documents folder:

- Vault root: `Documentos/Markdown Viewer/`
- Notes: `Documentos/Markdown Viewer/notes/`
- Scratch: `Documentos/Markdown Viewer/scratch.md`
- Recent history: `Documentos/Markdown Viewer/history.json`

---

## Security notes

- Links are sanitized to block unsafe protocols (e.g. `javascript:`).
- This repo intentionally ignores local vault files and private notes via `.gitignore`.

---

## Contributing

See `CONTRIBUTING.md`.

