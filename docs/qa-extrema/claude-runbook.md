# Runbook para Claude Code / agent-browser

Este runbook existe para que una IA no intente probar "todo al mismo tiempo" y termine dejando huecos.

## Principios

- Probar por bloques pequenos.
- Registrar evidencia en cada bloque.
- Si se encuentra un bug, anotarlo y seguir con el resto salvo que rompa toda la app.
- Repetir casos criticos tanto en `tauri dev` como en la app instalada.

## Orden recomendado

1. Preparacion
   - Confirmar build actual
   - Confirmar version del binario o instalador
   - Confirmar carpeta del vault y fixtures disponibles
2. Smoke inicial
   - Abrir app
   - Abrir fixture Markdown
   - Abrir fixture JSON
   - Guardar
   - Reabrir
3. App residente
   - Bandeja
   - Atajo global
   - Segunda instancia
   - Salida completa
4. Sesion y persistencia
   - Restauracion
   - Scratch
   - runtime.json
   - session.json
5. Deep QA
   - Markdown
   - JSON
   - Accesibilidad
   - Errores
   - Performance
6. Instalador
   - Setup
   - MSI
   - Primera apertura
   - Reinicio del sistema o simulacion

## Como dividir el trabajo

- Bloque 1: `QA-001` a `QA-040`
- Bloque 2: `QA-041` a `QA-080`
- Bloque 3: `QA-081` a `QA-120`
- Bloque 4: `QA-121` a `QA-160`
- Bloque 5: `QA-161` a `QA-200`
- Bloque 6: `QA-201` a `QA-240`
- Bloque 7: `QA-241` a `QA-280`
- Bloque 8: `QA-281` a `QA-320`

## Formato recomendado de salida

Para cada bloque:

- Casos ejecutados
- Casos no ejecutados
- Hallazgos
- Riesgos residuales
- Evidencia usada
- Recomendacion antes del siguiente bloque

## Nota importante

`agent-browser` o cualquier automatizacion del webview puede cubrir muy bien UI, render, editor, guardado y settings, pero no sustituye por completo:

- bandeja de Windows
- atajo global del sistema
- autostart
- segunda instancia real
- instalacion via `setup.exe` o `msi`

Para esos casos, hace falta combinar automatizacion con verificacion nativa/manual.
