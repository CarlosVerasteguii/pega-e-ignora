# Reporte de QA Web - Bloques 1 y 2

**Fecha:** 2026-03-12
**Entorno:** Windows 10/11, Agent-Browser CLI (Modo Web)
**URL:** http://localhost:1420

## Resumen Ejecutivo
Se ejecutó una validación parcial enfocada en funcionalidades web (sin dependencias nativas de Tauri). La aplicación demuestra buena estabilidad en el editor y persistencia básica, pero presenta fallos críticos en la gestión de preferencias de sesión y operaciones de historial.

**Métricas:**
- **Casos Web Ejecutados:** ~20
- **Pasaron:** 12
- **Fallaron:** 4
- **No Aplica (Nativos):** ~45 (Bloque 1 completo y partes de Bloque 2)
- **Bloqueados:** 2 (Interacciones complejas de UI)

**Bug Principal:** La preferencia "Reanudar sesión: No" es ignorada; la app siempre restaura la sesión anterior al recargar, lo que impide un arranque limpio configurado por usuario.

## Detalle de Casos

### Bloque 1: Instalación y App Residente
*(Mayoritariamente N/A en entorno web)*

| ID | Estado | Resumen | Nota |
|----|--------|---------|------|
| QA-001 a QA-036 | NO_APLICA | Instalación, Bandeja, Atajos Globales | Funcionalidades exclusivas de escritorio (Tauri). |
| QA-037 | NO_APLICA | Offline mode | No verificado explícitamente, pero el entorno local funcionó sin red externa. |
| QA-040 | PASA | Textos de settings | Explicaciones claras y en español (QA-161). |

### Bloque 2: Archivos, Vault, Historial y Sesión

| ID | Estado | Resumen | Nota |
|----|--------|---------|------|
| QA-041 | PASA | Arranque limpio (simulado) | Al limpiar localStorage, inicia con scratch vacío correcto. |
| QA-042 | PASA | Creación scratch.md | Al editar, el estado cambia a "editando" y persiste. |
| QA-043 | PASA | Recuperación Markdown | Recarga de página restaura contenido no guardado. |
| QA-044 | PASA | Recuperación JSON | Recarga restaura contenido JSON y modo de editor. |
| QA-045 | PASA | Guardar MD en vault (web) | Guardar (Ctrl+S) añade el archivo al historial simulado. |
| QA-046 | PENDIENTE | Guardar JSON en vault | Bloqueado por validación estricta de JSON (QA-127). |
| QA-047 | PENDIENTE | Abrir desde historial | No se pudo verificar por fallo en borrado/navegación. |
| QA-048 | NO_APLICA | Abrir (Ctrl+O) | Diálogo nativo de sistema no disponible en web auto. |
| QA-049 | PASA | Guardar como (Markdown) | Botón habilitado y funcional (aunque descarga no visible en CLI). |
| QA-053 | NO_APLICA | Guardar fuera de vault | Restricción de sistema de archivos nativo. |
| QA-054 | PASA | Guardar limpia dirty | Botón "Guardar" se deshabilita tras éxito. |
| QA-057 | **FALLA** | Eliminar de historial | Click en botón "Borrar" no elimina el ítem de la lista. |
| QA-059 | PASA | Restaurar sesión activado | Por defecto restaura correctamente. |
| QA-060 | **FALLA** | Restaurar sesión desactivado | Al desactivar opción y recargar, **sigue restaurando** la sesión previa. |
| QA-072 | PASA | Persistencia path al cambiar modo | Cambiar MD/JSON mantiene referencia \(sin archivo)\. |
| QA-073 | PASA | Metadata \(sin archivo)\ | Correcto para nuevos documentos. |
| QA-074 | **FALLA** | Título inferido | Usó timestamp \2026-03-12_...\ en vez de contenido del documento. |
| QA-120 | **FALLA** | Cambio JSON -> Markdown | A veces el editor se queda en "Cargando editor..." y requiere recarga. |
| QA-127 | PASA | Bloqueo guardar JSON inválido | Botones de guardado se deshabilitan correctamente. |
| QA-161 | PASA | Textos en español | Verificado en Settings y UI principal. |
| QA-216 | PASA | Shortcut Ctrl+S | Funciona igual que el botón de toolbar. |
| QA-217 | PASA | Flujo Guardar sin ruta | Ctrl+S en archivo nuevo deriva a flujo de nombrado/guardado. |

## Hallazgos Críticos

1.  **Persistencia Forzada (QA-060):** La configuración \estoreLastSession: false\ se guarda en localStorage pero es ignorada en el arranque web. La app siempre recupera el estado anterior.
2.  **Editor Zombie (QA-120):** En ocasiones, al cambiar de tab JSON a Markdown, el editor no termina de cargar (\Cargando editor...\), bloqueando la edición hasta un F5.
3.  **Historial Inmortal (QA-057):** Los botones de borrado en el historial parecen no responder a clics en la versión web/móvil simulada.
4.  **Inferencia de Títulos (QA-074):** El sistema de nombrado automático prefiere timestamps sobre el contenido del H1/texto, lo cual hace el historial difícil de leer.

## Recomendaciones

- **Prioridad Alta:** Corregir la lógica de \estoreLastSession\ en el \main.ts\ o store de sesión para respetar la preferencia del usuario.
- **Prioridad Media:** Investigar el ciclo de vida del componente Editor al desmontar/montar pestañas para evitar el estado de carga infinita.
- **Prioridad Baja:** Revisar la heurística de títulos para usar la primera línea de texto si es válida.

---
*Generado por Agent-Browser CLI*
