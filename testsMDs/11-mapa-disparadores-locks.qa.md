# Reporte QA — 11-mapa-disparadores-locks.md

✅ PASS — Todo lo principal funciona

┌──────────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│            Check             │                                                         Resultado                                                          │
├──────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ H2 / H3 headings             │ Correctos — bold, color, tamaño diferenciado                                                                               │
├──────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Jerarquía (outline)          │ 13 secciones detectadas (6×H2, 7×H3) con chip de nivel y número de línea                                                   │
├──────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Listas bullet                │ Indentación nivel 1 y 2 correcta                                                                                           │
├──────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Inline `code`                │ Renderizado con fondo ámbar y monospace en todo el documento y en celdas de tabla                                          │
├──────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ --- (HR separadores)         │ 7 <hr> en DOM — existen, se ven (ver observación abajo)                                                                    │
├──────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Tabla "Matriz de escenarios" │ 6 columnas, 8 filas, header diferenciado, no rompe layout; scroll horizontal aparece solo cuando la fuente sube (correcto) │
├──────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Scroll general               │ Fluido, layout no se rompe                                                                                                 │
├──────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Colapsar / expandir sidebar  │ Historial, Jerarquía y Formato colapsan/expanden correctamente                                                             │
├──────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Sliders Formato              │ Aplican --md-font-size / --md-line-height / --md-paragraph-spacing en tiempo real                                          │
├──────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Botón Ortografía Sí↔No       │ Toggle funciona — spellcheck cambia en el editor, subrayados rojos desaparecen                                             │
└──────────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

---

⚠️ BUG-1 (severidad MEDIA) — Listas N) se muestran todas como "1."

Pasos: El MD usa 1) 2) 3) 4) 5) para las 5 secciones principales.
Esperado: 1, 2, 3, 4, 5.
Observado: Todos muestran "1." en pantalla.

Causa raíz: Toast UI Editor (ProseMirror) convierte 1), 2), 3)… en `<ol start="N">` separados de un solo ítem cada uno, pero el CSS de ProseMirror renderiza el counter marker como "1." sin respetar el atributo `start`. El HTML en DOM es correcto (`start="2"`, `start="3"`…), el fallo es de CSS.

Workaround inmediato para el usuario: Usar `1. 2. 3.` (punto en vez de paréntesis) — eso sí genera una lista continua 1-5.

Fix posible en el proyecto: Añadir en `styles.css`:

```css
.toastui-editor-contents ol[start] {
  counter-reset: list-counter calc(attr(start) - 1);
}
.toastui-editor-contents ol[start] > li::before {
  content: counter(list-counter, decimal) ". ";
}
```

(O mejor, patchear el serializer de TUI para no fragmentar listas `N)` en OLs separados.)

---

🔍 OBSERVACIÓN-1 (cosmética) — HRs casi invisibles

Los `---` generan `<hr height:1px; background:rgba(140,107,66,0.22)>` sin borde. En el tema claro son muy sutiles. Considerar subir a `height: 2px` o aumentar la opacidad.

---

ℹ️ No verificado en browser (requiere Tauri nativo)

- Persistencia de estado sidebar y sliders entre reinicios (necesita localStorage en contexto Tauri completo con vault init exitoso)
- Historial de archivos recientes
- Ctrl+O file dialog

