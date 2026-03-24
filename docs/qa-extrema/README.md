# QA Extrema de Pega e Ignora

Esta carpeta concentra artefactos de QA pensados para probar la app con mucha profundidad antes de dar por bueno un empaquetado o una release.

## Contenido

- `checklist-maestra.md`
  - Checklist navegable con 320 casos agrupados por area funcional y riesgo.
- `claude-runbook.md`
  - Guia para ejecutar la checklist por bloques con Claude Code, agent-browser o pruebas manuales asistidas.
- `registro-template.md`
  - Plantilla para documentar una corrida de QA, hallazgos y regresiones.

## Filosofia

- No asumir que "si abre, ya funciona".
- Separar lo automatizable de lo nativo de Windows.
- Probar casos felices, edge cases, corrupcion de archivos, comportamiento raro y regresiones de empaquetado.
- Registrar evidencia reproducible.

## Cobertura de la checklist maestra

- Seccion A: instalacion, arranque y app residente
- Seccion B: archivos, vault, historial y sesion
- Seccion C: editor y render Markdown
- Seccion D: editor JSON, arbol y validacion
- Seccion E: preferencias, apariencia, accesibilidad y ventana
- Seccion F: comandos, teclado y productividad
- Seccion G: errores, recuperacion, seguridad y datos extranos
- Seccion H: performance, estres, empaquetado y regresion extrema

## Recomendacion de uso

1. Ejecutar primero la app en desarrollo para validar loops rapidos.
2. Ejecutar despues la version instalada (`setup.exe` o `msi`) para validar lo residente y lo nativo.
3. Marcar cada item con:
   - `[x]` si paso
   - `[ ]` si no se ha probado
   - `[!]` si hay hallazgo o regresion
4. Adjuntar capturas, rutas, archivos y pasos exactos cuando algo falle.

## Fixtures relacionados

- Markdown reutilizable: [testsMDs/README.md](C:/Users/veras/Documents/Pega%20e%20Ignora/testsMDs/README.md)
- JSON reutilizable: [testsJSONs/README.md](C:/Users/veras/Documents/Pega%20e%20Ignora/testsJSONs/README.md)
