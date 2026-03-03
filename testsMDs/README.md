# testsMDs (fixtures)

Esta carpeta contiene **fixtures de Markdown** para probar manualmente:

- Render (headings, listas, tablas, quotes, code, HRs)
- Jerarquía (outline por encabezados)
- Sanitización de links (`javascript:`)
- Scroll y layout en documentos largos
- UX del editor (paste, ortografía, sliders de lectura)

## Caso recomendado (stress test)

- Fixture: `testsMDs/11-mapa-disparadores-locks.md`
- Reporte QA (texto largo con tabla ASCII): `testsMDs/11-mapa-disparadores-locks.qa.md`

## Cómo probar en la app

1) Corre la app en dev:

```bash
npm -C markdown-viewer install
npm -C markdown-viewer run tauri dev
```

2) Abre el fixture desde la app:

- `Ctrl+O` → selecciona `testsMDs/11-mapa-disparadores-locks.md`

3) Checklist rápido:

- Outline detecta H2/H3 y navega al click
- Tabla “Matriz de escenarios” no rompe el layout
- Inline `code` se ve consistente
- HR (`---`) visible en claro/oscuro
- Toggle “Ortografía” quita/pon subrayados
- Sliders de Formato aplican en tiempo real

