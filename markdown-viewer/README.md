# Pega e Ignora (Windows Desktop)

Editor + preview de Markdown en tema oscuro, hecho con Tauri (se construye como `.exe`/instalador en Windows).

## Features

- Vista única: editas y ves renderizado en el mismo espacio (WYSIWYG)
- Sidebar con Jerarquía (outline) por encabezados
- Sidebar con secciones colapsables (Historial/Jerarquía/Formato)
- Tema oscuro con colores por jerarquías (`h1/h2/h3…`) + resaltado de código
- Controles de lectura: tamaño, interlineado y espaciado (persisten por app)
- Toggle de ortografía (para ocultar/mostrar subrayado del corrector)
- Autosave a `scratch.md`
- Guardado de notas en carpeta “vault” dentro de Documentos
- Historial básico (recientes)
- Command palette: `Ctrl+K`
- Modo lectura (oculta sidebar)

## Dónde guarda todo

- Vault: `Documentos/Pega e Ignora/`
- Notas: `Documentos/Pega e Ignora/notes/`
- Scratch: `Documentos/Pega e Ignora/scratch.md`
- Historial: `Documentos/Pega e Ignora/history.json`

## Dev

```bash
cd markdown-viewer
npm install
npm run tauri dev
```

Mientras `npm run tauri dev` esté corriendo, cada cambio que hagas en `markdown-viewer/src/` debería recargar la ventana de la app (hot reload).

### Markdown de prueba

En `testsMDs/` hay archivos `.md` para probar el render/outline/seguridad (incluye un caso largo: `testsMDs/11-mapa-disparadores-locks.md`).

### GitHub desde WSL (Codex)

Flujo recomendado (git + `gh.exe`) en `docs/wsl-github-codex.md`.

Si solo quieres ver el UI en el navegador (sin Tauri):

```bash
cd markdown-viewer
npm run dev
```

## Build (Windows)

Requisitos típicos:

- Node.js
- Rust (rustup)
- Visual Studio Build Tools (C++/Windows SDK)

Luego:

```bash
cd markdown-viewer
npm install
npm run tauri build
```
