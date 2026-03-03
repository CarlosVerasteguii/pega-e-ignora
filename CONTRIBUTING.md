# Contributing

Thanks for your interest in contributing!

## Local setup

```bash
cd markdown-viewer
npm install
npm run tauri dev
```

## Project conventions

- Keep changes focused and avoid unrelated refactors.
- Prefer small, incremental PRs.
- Don’t commit local vault data (`notes/`, `scratch.md`, `history.json`) or build artifacts — they’re ignored by `.gitignore`.

## PR checklist

- App still runs: `npm run tauri dev`
- Build succeeds: `npm run build` (inside `markdown-viewer/`) and/or `npm run tauri build` when relevant
- If UI changes: include a short before/after description (or screenshot if it contains no sensitive content)

