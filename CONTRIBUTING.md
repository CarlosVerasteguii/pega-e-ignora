# Contributing

Thanks for your interest in contributing!

## Local setup

```bash
npm -C markdown-viewer install
npm -C markdown-viewer run tauri dev
```

## Project conventions

- Keep changes focused and avoid unrelated refactors.
- Prefer small, incremental PRs.
- Don’t commit local vault data (`notes/`, `scratch.md`, `history.json`) or build artifacts — they’re ignored by `.gitignore`.
  - Fixtures/manual QA live in `testsMDs/` (safe to commit).

## PR checklist

- App still runs: `npm -C markdown-viewer run tauri dev`
- Build succeeds: `npm -C markdown-viewer run build` and/or `npm -C markdown-viewer run tauri build` when relevant
- If UI changes: include a short before/after description (or screenshot if it contains no sensitive content)
