## Mapa de disparadores (código)

1) Comando manual

- `routes/console.php:645` llama directo a `AssessmentResumenFinalService::generateIfReady(...)`
  (no dispatch de job, no pre-lock).

2) Finalización (CompletionService)

- Dispatch: `app/Modules/Assessment/Services/AssessmentAplicanteCompletionService.php:360`
- Pre-lock antes de dispatch: sí (`Cache::add("analysis:resumen_final:<id>", ..., 8 min)`)
  - Si el lock ya existe: no dispatch (`...:370-377`)
- Luego dispatcha `EvaluateAssessmentResumenFinalJob` (`...:363`)

3) Endpoint candidato (Controller)

- Se ejecuta en el flujo del endpoint que arma el status: `app/Modules/Assessment/Controllers/AssessmentCandidatoController.php:190-191`
- Dispatch resumen final (si todo finalizado y falta summary): `.../AssessmentCandidatoController.php:1185`
- Pre-lock antes de dispatch: sí (`...:1186-1188`, TTL 8 min)
  - Si el lock ya existe: no dispatch (`...:1196-1202`)

4) Post-evaluación (jobs que al terminar vuelven a disparar resumen final)

- Entrevista: `app/Modules/Assessment/Jobs/EvaluateAssessmentEntrevistaJob.php:31` (sin pre-lock)
- Psicometría: `app/Modules/Assessment/Jobs/EvaluateAssessmentPsicometriaJob.php:33` (sin pre-lock)
- Idiomas: `app/Modules/Idiomas/Jobs/EvaluateIdiomasExamenJob.php:51-53` (sin pre-lock)

5) CandidatoService (CV)

- Tras score CV: `app/Modules/Assessment/Services/AssessmentCandidatoService.php:667` (sin pre-lock)

---

## Locks / cache (dónde y qué pasa)

### Lock dentro del job (siempre)

- `app/Modules/Assessment/Jobs/EvaluateAssessmentResumenFinalJob.php:38-50`
- Hace `Cache::add("analysis:resumen_final:<id>", true, now()+8min)`
  - Si ya existe: skip y sale (`...:39-49`)

### Problema de doble-lock (misma key)

- Los paths CompletionService y CandidatoController ponen el mismo lock antes del dispatch
  (`analysis:resumen_final:<id>`), y el job vuelve a intentar el mismo `Cache::add(...)`.
- Resultado práctico: si el worker toma el job “rápido” (`<< 8 min`), el job ve el lock y siempre
  skipea.

---

## Readiness / “razones de skip” en `generateIfReady()`

En `app/Modules/Assessment/Services/AssessmentResumenFinalService.php:21`:

- assessment missing → skip false (`...:25-32`)
- fecha_finalizacion null → skip false (`...:34-40`)
- “fresh summary” (si ya existe ASSESSMENT/GLOBAL con score+resumen y está fresco) → skip pero
  retorna true (`...:69-86`)
- Módulos requeridos faltantes:
  - entrevista requerida y ENTREVISTA/GLOBAL incompleta → false (`...:88-100`)
  - psicometría requerida y SECCION/PS incompleta → false (`...:102-114`)
  - idioma requerido y SECCION/IN incompleta → false (`...:116-128`)
- “no modules available” (sin CV y sin módulos requeridos activos) → false (`...:130-136`)
- Respuesta inválida del LLM → throw (`...:203-208`)

Qué módulos son “requeridos” depende del assessment:

- `resolveRequiredModules()` en `app/Modules/Assessment/Services/AssessmentResumenFinalService.php:256-282`

---

## Matriz de escenarios

| Origen dispatch | pre-lock (antes) | lock en job | precondiciones ok (`generateIfReady`) | evidencia BD típica | resultado |
|---|---:|---:|---:|---|---|
| `assessment:resumen-final` (comando) `routes/console.php:645` | No | N/A | Depende | `assessment_aplicante_ai_analisis` aparece ASSESSMENT/GLOBAL si generó | Determinístico (sin race de locks) |
| CompletionService `...CompletionService.php:360-377` | Sí (8 min) | Sí (misma key) | Irrelevante si el job skipea | No hay `chatgpt_log` `assessment:resumen_final` para esa ventana; no ASSESSMENT/GLOBAL | No determinístico: depende del delay del worker (>8 min “a veces sí”) |
| CandidatoController `...CandidatoController.php:1185-1203` | Sí (8 min) | Sí (misma key) | Irrelevante si el job skipea | Igual que arriba; además puede repetirse por tráfico/polling del endpoint | No determinístico: depende del timing + tráfico |
| CV (CandidatoService) `...AssessmentCandidatoService.php:667` | No | Sí | Si falta entrevista/psico/idioma → false | No ASSESSMENT/GLOBAL; tampoco `chatgpt_log` resumen_final | Puede “bloquear 8 min” aunque no esté listo |
| Job Entrevista `...EvaluateAssessmentEntrevistaJob.php:31` | No | Sí | Si todo ya está (y `fecha_finalizacion`) → true | `chatgpt_log` `assessment:resumen_final` SUCCESS + ASSESSMENT/GLOBAL | Debería ser estable, salvo lock externo |
| Job Psicometría `...EvaluateAssessmentPsicometriaJob.php:33` | No | Sí | idem | idem | idem |
| Job Idiomas `...EvaluateIdiomasExamenJob.php:51-53` | No | Sí | idem | idem | idem |

---

## Validación BD (2–3 aplicantes)

Redacté UUID/nombres/prompts; solo ids y presencia/fechas.

### Aplicante id=14 (ASSESSMENT id_assessment=3)

assessment_aplicantes

- `fecha_finalizacion = 2026-03-03 15:57:33` (assessment_aplicantes, SELECT)

ai_analisis (presencia)

- ENTREVISTA/GLOBAL: sí (tiene score+resumen)
- SECCION/PS: sí
- SECCION/IN: sí
- ASSESSMENT/GLOBAL (resumen final): sí, `updated_at=2026-03-03 10:23:51-06`

chatgpt_log

- Existe `assessment:resumen_final` SUCCESS en `2026-03-03 10:23:51-06` (coincide con `updated_at` del ASSESSMENT/GLOBAL)

failed_jobs

- 0 fallas para `EvaluateAssessmentResumenFinalJob` (conteo = 0)

Clasificación: “Job corrió y generó”.

---

### Aplicante id=16 (ASSESSMENT id_assessment=3)

assessment_aplicantes

- `fecha_finalizacion = 2026-03-03 16:10:25`

ai_analisis

- ENTREVISTA/GLOBAL: sí
- SECCION/PS: sí
- SECCION/IN: sí
- ASSESSMENT/GLOBAL: no existe (falta resumen final)

chatgpt_log

- No hay entradas de `assessment:resumen_final` después de `2026-03-03 10:23:51-06`, aunque sí hay
  actividad posterior de módulos (p.ej. `assessment:entrevista_evaluacion` hasta `2026-03-03 12:28:44-06`).

failed_jobs

- 0 fallas

Clasificación: “Job no generó; altamente consistente con skip por lock/cache (no llegó al prompt), no con fallo”.

---

### Aplicante id=17 (ASSESSMENT id_assessment=3)

assessment_aplicantes

- `fecha_finalizacion = 2026-03-03 17:00:43`

ai_analisis

- ENTREVISTA/GLOBAL: sí
- SECCION/PS: sí
- SECCION/IN: sí
- ASSESSMENT/GLOBAL: no existe

chatgpt_log

- Igual que id=16: hay módulos corriendo (`psychometry_report`, `idiomas_evaluacion`,
  `entrevista_evaluacion`) pero no `assessment:resumen_final` en ese rango.

failed_jobs

- 0 fallas

Clasificación: “Job no generó; consistente con lock/cache o no-dispatch efectivo”.

---

## Conclusión

### Root causes probables (máx 3, ordenadas)

1. Doble-lock con la misma key `analysis:resumen_final:<id>` en pre-dispatch (CompletionService/Controller)
   y dentro del job → el job skipea casi siempre si se ejecuta antes de 8 min.
   Evidencia: `...CompletionService.php:361-363`, `...CandidatoController.php:1186-1189`, `...EvaluateAssessmentResumenFinalJob.php:38-50`.
2. Locks “pegajosos” + múltiples disparadores: cada hit del endpoint candidato puede volver a
   poner el lock 8 min y encolar un job que se auto-skipea; mientras tanto, los jobs post-evaluación
   (entrevista/psico/idiomas) que sí deberían generar quedan bloqueados por esa misma key.
3. Readiness vs timing: `generateIfReady()` puede retornar false por módulos faltantes
   (`...AssessmentResumenFinalService.php:88-128`) después de adquirir lock en el job; eso introduce
   ventanas donde aunque después ya esté “ready”, nuevas corridas pueden no ocurrir.

### Recomendación mínima (sin implementar) para eliminar la variabilidad

- Eliminar el pre-lock `analysis:resumen_final:<id>` antes del dispatch en
  `AssessmentAplicanteCompletionService` y `AssessmentCandidatoController`, y dejar un solo lock
  (el del job) como dedupe.

Si quieres, en otra vuelta puedo armarte un “timeline” por aplicante (solo con `updated_at`/`created_at`)
para mostrar exactamente en qué ventana de 8 minutos se vuelve imposible que corra el resumen final.
