# Pega e Ignora (Desktop)

Editor de Markdown para escritorio: **pegas texto**, escribes notas y lo lees cómodo (**interlineado/espaciado/tamaño**) sin que te estorbe.

Construido con **Tauri v2**, **Vite** y **Toast UI Editor**.

## Features

- Editor WYSIWYG en una sola vista (editar + ver render en el mismo lugar)
- Sidebar con **Jerarquía** (outline por encabezados)
- Secciones del sidebar colapsables (menos ruido)
- Tema oscuro/claro
- Command palette (`Ctrl+K`)
- Buscar / reemplazar (`Ctrl+F` / `Ctrl+H`)
- Modo lectura (oculta sidebar)
- Controles de lectura: tamaño, interlineado, espaciado
- Toggle de ortografía (para quitar subrayados cuando el texto mezcla idiomas)
- Vault local (notas, scratch y recientes)
- Explorador de notas (in-app)
- Sanitización básica de links inseguros

## Estructura del repo

- `markdown-viewer/` — código fuente (Tauri + frontend)
- `testsMDs/` — fixtures de Markdown para probar render/outline
- `docs/` — notas de desarrollo (flujo GitHub en WSL, roadmap)

## Requisitos

- Node.js (LTS recomendado)
- Rust (via `rustup`)
- Build tools para Tauri en Windows (Visual Studio Build Tools / Windows SDK)

## Correr en dev

```bash
cd markdown-viewer
npm install
npm run tauri dev
```

## Build (Windows)

```bash
cd markdown-viewer
npm install
npm run tauri build
```

## Dónde guarda datos (Vault)

Dentro de Documentos:

- Vault: `Documentos/Pega e Ignora/`
- Notas: `Documentos/Pega e Ignora/notes/`
- Scratch: `Documentos/Pega e Ignora/scratch.md`
- Historial: `Documentos/Pega e Ignora/history.json`

Si ya usabas `Documentos/Markdown Viewer/`, la app te ofrece migrarlo al abrir.

## Contribuir

Ver `CONTRIBUTING.md`.
