# Project Context: GitHub desde Codex CLI en WSL (Pega e Ignora)

Fecha: 2026-03-03

## Objetivo

Estandarizar cómo trabajar con GitHub desde Codex CLI en WSL (crear ramas, commit, push, PR y editar PR) **sin usar scripts**.

## Alcance

- Entorno: WSL
- Proyecto local en Windows montado en: `/mnt/c/Users/veras/Documents/Markdown Viewer`
- App (Tauri + Vite) en: `markdown-viewer/`
- Markdown de prueba en: `testsMDs/`
- GitHub CLI disponible en Windows como:
  - `/mnt/c/Program Files/GitHub CLI/gh.exe`

## Regla base

- Usar `git` (WSL) para todo lo relacionado a commits/branches/remotes.
- Usar `gh.exe` (Windows) para operaciones de PR.

---

## Setup inicial (una sola vez por repo)

Primero asegúrate de estar en la **raíz del repo git**.

Si este folder todavía **no** es un repo (no hay `.git/`), tienes 2 opciones:

1) Clonar el repo aquí, o
2) Inicializar git y agregar `origin` (necesitas la URL del repo):

```bash
cd "/mnt/c/Users/veras/Documents/Markdown Viewer"
git init
git remote add origin https://github.com/<owner>/<repo>.git
git checkout -b main
```

Luego (ya con repo y remoto):

```bash
cd "/mnt/c/Users/veras/Documents/Markdown Viewer"

# 1) Identidad git (local al repo)
git config user.name "Carlos Verastegui"
git config user.email "CarlosVerasteguii@users.noreply.github.com"

# 2) Credenciales GitHub desde WSL usando gh.exe (Windows)
git config credential.helper "!/mnt/c/Program\\ Files/GitHub\\ CLI/gh.exe auth git-credential"

# 3) Verificar sesión GitHub
'/mnt/c/Program Files/GitHub CLI/gh.exe' auth status -h github.com
```

---

## Flujo diario recomendado

### 1) Sincronizar `main`

```bash
cd "/mnt/c/Users/veras/Documents/Markdown Viewer"
git checkout main
git pull origin main
```

### 2) Crear rama

```bash
git checkout -b feat/<nombre-corto>
# ejemplos: feat/sidebar-collapsible, fix/ordered-list-start, docs/wsl-github-flow
```

### 3) Commit manual

```bash
git status
git add -A
git commit -m "feat(scope): descripcion corta"
```

Convención sugerida:

- `feat(scope): ...`
- `fix(scope): ...`
- `docs(scope): ...`
- `refactor(scope): ...`
- `chore(scope): ...`

### 4) Push de rama

```bash
git push -u origin HEAD
```

### 5) Crear PR

```bash
'/mnt/c/Program Files/GitHub CLI/gh.exe' pr create \
  --repo <owner>/<repo> \
  --base main \
  --head <tu-rama> \
  --title "feat(scope): titulo PR" \
  --body "Resumen, cambios principales, validaciones"
```

### 6) Editar título/descripcion de PR

```bash
'/mnt/c/Program Files/GitHub CLI/gh.exe' pr edit <numero> \
  --repo <owner>/<repo> \
  --title "titulo actualizado" \
  --body "descripcion actualizada"
```

### 7) Verificar estado PR

```bash
'/mnt/c/Program Files/GitHub CLI/gh.exe' pr view <numero> --repo <owner>/<repo>
'/mnt/c/Program Files/GitHub CLI/gh.exe' pr checks <numero> --repo <owner>/<repo>
```

---

## Troubleshooting rápido

- Error `could not read Username for 'https://github.com'`:
  - Falta `credential.helper` con `gh.exe`.
- Error `Author identity unknown`:
  - Configura `user.name` y `user.email` (local o global).
- `gh: command not found` en WSL:
  - Usar la ruta completa a `gh.exe` como en este documento.
- Error de `CRLF` en scripts (`$'\\r' command not found`):
  - Evitar scripts con CRLF para flujo git crítico; preferir comandos manuales.
- Error al usar `gh.exe --body-file /tmp/archivo.md`:
  - Causa: `gh.exe` es binario de Windows y no resuelve rutas Linux (`/tmp/...`).
  - Solución: convertir a ruta Windows con `wslpath -w`.

### WSL vs Windows paths (clave con `gh.exe`)

Si usas `gh.exe`, pasa rutas Windows en `--body-file`:

```bash
cp /tmp/pr_body.md ./_tmp_pr_body.md
WIN_PATH=$(wslpath -w "$PWD/_tmp_pr_body.md")

'/mnt/c/Program Files/GitHub CLI/gh.exe' pr edit <numero> \
  --repo <owner>/<repo> \
  --body-file "$WIN_PATH"
```

Alternativa sin archivo:

```bash
'/mnt/c/Program Files/GitHub CLI/gh.exe' pr edit <numero> \
  --repo <owner>/<repo> \
  --body "$(cat /tmp/pr_body.md)"
```

---

## Política para pedirle a Codex CLI

Pide instrucciones directas, por ejemplo:

- “crea rama `feat/x`, haz commit y push”
- “crea PR contra `main` con este título y body”
- “edita el PR #N y actualiza descripción”

Codex debe ejecutar comandos manuales (`git` + `gh.exe`) y no depender de scripts.
