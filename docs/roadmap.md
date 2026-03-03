# Roadmap (ideas)

Este documento resume ideas para seguir mejorando **Pega e Ignora**. No son compromisos; es una lista priorizada para discutir.

## UX / Producto

- **Command palette** (Ctrl+K): abrir, recientes, buscar, toggles (tema/ortografía), exportar.
- **Búsqueda** en nota (Ctrl+F) + reemplazo (Ctrl+H).
- **Recientes mejorado**: pin favorites, “abrir carpeta del archivo”, “copiar ruta”.
- **Indicadores claros**: “Guardado hace Xs”, “sin guardar”, “autosave ON”.
- **Atajos visibles**: tooltips consistentes + sección “Ayuda / Atajos”.

## Editor / Render

- **Modo lectura**: ocultar toolbar y dejar solo contenido + navegación por headings.
- **Export**: HTML/PDF/print friendly.
- **Mejor manejo de paste**: normalizar bullets, arreglar indentación, convertir tabs→spaces, “paste as plain text”.
- **Tablas**: scroll horizontal suave + “copiar como CSV”.

## Vault / Archivos

- **Explorador de notas**: árbol de carpetas dentro del vault + crear/renombrar/mover.
- **Tags** (frontmatter) + filtro rápido en sidebar.
- **Backups**: snapshots por fecha, o “versiones” simples por archivo.

## Diseño (design-system-patterns)

- **Tokens formales**: separar tokens primitivos vs semánticos vs de componentes (mejor escalabilidad).
- **Accesibilidad de color**: revisar contraste en ambos temas, especialmente texto muted y estados hover.
- **Densidad**: preset “compacto / cómodo” (espaciado UI, no solo tipografía del editor).

## Micro-interacciones (micro-interactions)

- **Toast no intrusivo** para “Guardado”, “Link bloqueado”, “Vault migrado”.
- **Animaciones suaves**: colapsables, focus rings, pressed states (respetando `prefers-reduced-motion`).
- **Estados vacíos** mejores (historial/jerarquía) con copy claro.

## Calidad

- **Smoke tests manuales** documentados usando `testsMDs/`.
- **CI básico**: build lint/typecheck (si se agrega lint) y build Tauri (cuando sea viable).

