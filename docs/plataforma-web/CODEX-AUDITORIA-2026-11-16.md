# Auditoría Codex de la app — 16/11/2026

**Qué se ha hecho.** Pasar Codex por la app pantalla a pantalla, empezando por la **clasificación**
(`/explorar/competicion/44`, la que el usuario señala como problemática), a **390 y 1280 px**. Los
hallazgos quedan aquí con su criterio de aceptación; los claros se han aplicado y tienen prueba.

**Herramientas.** Codex CLI `0.165.0` (`codex exec`, sandbox de sólo lectura, capturas adjuntas),
Playwright/Chromium con `@axe-core/playwright` y el medidor `tmp/audita-pantalla.mjs` (desbordamiento,
objetivos táctiles, axe). App servida en `http://127.0.0.1:3001` (build de producción) y
`http://127.0.0.1:3002` (desarrollo para verificar los arreglos).

## 1 · Pantallas medidas

| Pantalla | Ruta | 390 | 1280 |
|---|---|---|---|
| Inicio | `/` | 0 desbordamiento, axe 0 | 0, axe 0 |
| Competiciones | `/explorar/competiciones` | 0, axe 0 | 0, axe 0 |
| **Clasificación** | `/explorar/competicion/44` | 0, axe 0 | 0, axe 0 |
| Jornada | `/explorar/competicion/44/jornada/1` | 0, axe 0 | 0, axe 0 |
| Acta | `/explorar/acta/2000559` | 0, axe 0 | 0, axe 0 |
| Equipo | `/explorar/equipo/8871` | 0, axe 0 | 0, axe 0 |
| Buscar | `/buscar` | 0, axe 0 | 0, axe 0 |
| Estadísticas | `/explorar/estadisticas` | 0, axe 0 | 0, axe 0 |

En las ocho pantallas: **0 desbordamiento horizontal del documento** y **0 violaciones axe
serious/critical** a los dos anchos. Los «objetivos pequeños» que cuenta el medidor son en su mayoría
enlaces de texto dentro de párrafos y celdas densas (24 px de alto), no controles: se anotan, no se
fingen arreglados.

## 2 · Hallazgos y criterio de aceptación

| # | Severidad | Hallazgo | Criterio de aceptación | Estado |
|---|---|---|---|---|
| 1 | **Alta** | A 1280 px, en la tarjeta «Jornada 10» de la clasificación los nombres se partían **letra a letra**: la columna derecha reservaba 320 px fijos dentro de una columna de ~300 px. | Los nombres se leen en líneas normales, sin disposición vertical ni solapamientos, a 390 y 1280. | **Aplicado** en `Jornada.tsx` y `PartidosDeJornada.tsx` (columna derecha `45%`, sin 320 px). Prueba: `competicion-arreglos.test.ts`. |
| 2 | **Alta** | Tres pestañas (Goleadores, Disciplina, Equipos) eran texto apagado **sin destino**. | Toda pestaña visible lleva a una sección real o no se muestra. | **Aplicado**: Goleadores enlaza a `#goleadores` (existe en la página); Disciplina y Equipos se han quitado de la barra. |
| 3 | **Media** | A 390 px solo se veían tres pestañas; las demás quedaban en un scroll horizontal sin señal. | A 390 se ve y se alcanza cada pestaña, con teclado y con gesto. | **Aplicado**: la barra se envuelve en móvil (`flex-wrap`) y sigue en una fila en escritorio. |
| 4 | Media | Al abrir el detalle «+» de una fila a 390, el bloque V-E-D/goles/forma podía desbordar su fila (riesgo deducido del código, no reproducido en captura). | Abrir el detalle no tapa filas ni crea scroll horizontal. | **Pendiente de reproducir** con el detalle abierto; no se toca a ciegas. |
| 5 | Media | Antes de la tabla hay demasiados bloques diagnósticos (último, próximo, frescura, KPIs, calidad) y la clasificación baja. | Cobertura y procedencia siguen visibles, pero el desglose no ocupa una tarjeta entera antes de la tabla. | **Decisión de producto**: no se aplica sin acordar qué se pliega. |
| 6 | Media | «Casa» y «Fuera» parecen filtros pero están apagados sin explicar por qué. | Se entiende sin pulsar ni pasar el ratón. | **Aplicado**: nota visible bajo el selector y `aria-label` en los botones. |
| 7 | Baja | Texto secundario pequeño y gris (fechas, PJ, metadatos). | Contraste ≥ 4,5:1 al tamaño real. | **Sin incumplimiento medido**: axe 0 serious/critical; se revisa si aparece. |
| 8 | Baja | El estado vacío «Sin clasificación publicada» no ofrece salida. | El vacío identifica competición/temporada y ofrece alternativa. | **Pendiente** (poco frecuente); no se inventa contenido. |
| 9 | Baja | «Las reglas cuadran», «Cuadra», «Cortes distintos» suenan a comprobación interna. | Cada mensaje describe qué datos hay, su fecha y sus límites. | **Decisión de producto**: cambiar el tono afecta a varias pantallas y al glosario. |

### Hallazgo extra (no estaba en la lista de Codex)

- **«Próximo partido» enseñaba un aplazado del 04/10 (J5)** cuando la jornada jugada era la 10. Un partido
  con fecha pasada no es el próximo. **Aplicado**: si el primer pendiente no es futuro, la tarjeta se
  titula **«Partido pendiente»**. Prueba en `competicion-arreglos.test.ts`.

## 3 · Evidencia de los arreglos

| Antes | Después |
|---|---|
| 390: 8 elementos fuera del viewport y pestañas ocultas | 390: **0** elementos fuera; 5 pestañas visibles en dos filas |
| 1280: nombres letra a letra y tarjeta de ~2.000 px de alto | 1280: nombres en 1-2 líneas y tarjeta compacta |
| «Próximo partido · 04/10 · J5» | «Partido pendiente · 04/10 · J5» |

Capturas locales: `tmp/auditoria/clasificacion-44-390.png`, `…-1280.png` (antes) y
`…-arreglada2-390.png`, `…-arreglada2-1280.png` (después).

## 4 · Pruebas

```
pnpm exec vitest run apps/web/test/competicion-arreglos.test.ts   # 4 pruebas
pnpm exec vitest run apps/web/test/jornada-pantalla.test.ts       # 31 pruebas
pnpm exec vitest run apps/web/test/ui-componentes.test.ts         # 8 pruebas
pnpm --filter @facylf/web exec tsc --noEmit                       # sin errores
```

## 5 · Reproducir la auditoría

```bash
# app en marcha (build de producción) en :3001
node tmp/audita-pantalla.mjs http://127.0.0.1:3001/explorar/competicion/44 clasificacion 390 1280

# Codex, sólo lectura, con las capturas adjuntas
codex exec -s read-only -C F:\\Proyectos\\facylf \
  -i tmp/auditoria/clasificacion-390.png -i tmp/auditoria/clasificacion-1280.png \
  -o tmp/codex-clasificacion.md "Audita la clasificación a 390 y 1280…"
```
