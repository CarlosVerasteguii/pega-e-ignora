# Prompt (Claude Code) — QA manual de render Markdown

Copia/pega esto en Claude Code (o el agente que uses) para hacer un smoke test con los fixtures:

```text
Actúa como QA de UI para la app “Pega e Ignora”.

Objetivo: validar que el Markdown fixture se renderiza bien (headings, outline, listas, tablas, code, HR).

1) Corre build:
   - npm -C markdown-viewer run build

2) Corre app en dev:
   - npm -C markdown-viewer run tauri dev

3) En la app, abre:
   - testsMDs/11-mapa-disparadores-locks.md

4) Verifica y reporta:
   - Outline: detecta H2/H3 y navegar hace scroll al heading correcto.
   - Listas: bullets con indentación correcta y numeradas consistentes.
   - Tablas: “Matriz de escenarios” no rompe layout; aparece scroll horizontal si hace falta.
   - Inline code: estilo monospace + fondo sutil.
   - HR: se ven en tema claro y oscuro.
   - Ctrl+F abre Buscar y navega coincidencias; Ctrl+H reemplaza.
   - Ctrl+K abre Command Palette.
   - “Ortografía: Sí/No” quita subrayados rojos.
   - “Lectura/Editar” oculta/muestra sidebar.

5) Si algo falla, dame:
   - pasos para reproducir,
   - observado vs esperado,
   - severidad (alta/media/baja),
   - y el archivo/selector sospechoso.
```
```

