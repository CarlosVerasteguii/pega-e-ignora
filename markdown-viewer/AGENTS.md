# AGENTS.md — Convenciones del proyecto

Estas convenciones aplican a todo el código dentro de `markdown-viewer/`.

## Objetivo

- Mantener la app **profesional, accesible (WCAG 2.1 AA)** y sin deuda técnica.
- Evitar “hot fixes” (timeouts hardcodeados, estilos duplicados, lógica UI dispersa).

## Stack y comandos

- Stack: Tauri + Vite + TypeScript + CSS (sin framework).
- Dev (Tauri): `npm run tauri dev`
- Dev (web): `npm run dev`
- Build: `npm run build` (obligatorio antes de cerrar cambios grandes)
- Release: `npm run tauri build`

## Arquitectura (carpetas)

- `index.html`: markup de UI (diálogos, toolbars, hosts).
- `src/main.ts`: orquestación de estados y wiring (evitar crecer “sin control”; extraer a módulos).
- `src/features/*`: features autocontenidas (p.ej. workspace JSON, vault explorer).
- `src/ui/*`: componentes/infra UI reutilizable (p.ej. toasts, preferencias, helpers).
- `src/styles.css`: estilos globales y tokens.

## Convenciones de UI/UX

- Idioma UI: **español** (labels, tooltips, textos).
- Toggles: usar `aria-pressed` + `data-*` (estado explícito) y mantener estilo “activo” en ambos temas.
- Iconos: preferir SVG inline con `stroke="currentColor"` / tamaño consistente (24px) y sin mezclar sets.
- Estados de botones: consistentes para `:hover`, `:active`, `:focus-visible`, `aria-pressed="true"`.
- Animaciones: respetar `prefers-reduced-motion` y la preferencia del usuario (“Reducir animaciones”).

## Accesibilidad (obligatorio)

- Todo control interactivo debe ser usable con teclado (Tab/Enter/Espacio) y tener foco visible.
- Usar roles ARIA correctos:
  - Toasts: `role="status"` (info/success) y `role="alert"` (error).
  - Dialog/settings: `aria-modal="true"`, `aria-labelledby` y `aria-describedby` cuando aplique.
- No usar `outline: none` sin reemplazo equivalente.
- Contraste mínimo 4.5:1 para texto normal (revisar especialmente en dark mode).

## Preferencias / persistencia

- Centralizar preferencias UI en `src/ui/uiPreferences.ts`.
- Keys de storage: prefijo `markdown-viewer.` (evitar keys sueltas).
- Preferir `data-*` en el DOM para reflejar estado (y que CSS pueda reaccionar).

## Toasts / notificaciones

- No llamar `toasts.show(...)` directo desde features: usar un **helper** central (p.ej. `notify(...)`).
- Duraciones/políticas por tipo viven en configuración (no hardcode por todos lados).
- Errores “sticky” por default y siempre con botón de cierre accesible.

## CSS

- Usar variables CSS para colores/espaciados; evitar duplicación de hex/rgb.
- Selectores simples (evitar anidación profunda); preferir clases + `data-*`.
- En layouts flex: usar `min-width: 0` en hijos que deban encoger (evita espacios/overflow raros).

## Git / higiene

- Mensajes de commit: estilo Conventional Commits (ej: `feat(ui): ...`, `fix: ...`, `docs: ...`).
- No editar `dist/` manualmente.
- Evitar dependencias nuevas sin justificar (siempre preferir utilidades internas primero).
