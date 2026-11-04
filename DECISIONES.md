# Decisiones del agente

Registro de las decisiones de **Nivel 2** del [protocolo de autonomía](F:\EspacioCodigo\_flujo-dsh\PROTOCOLO-AUTONOMIA.md):
las que el agente toma solo y deja escritas aquí con su motivo, para que David las revise cuando quiera.
Las de Nivel 3 (alcance, datos, credenciales, dinero, ramas) no se deciden aquí: se marcan y se para.

---

## 2026-11-04 · Sesión 1 — pruebas en verde y pantalla 2 (Competición)

### 1. Las pruebas se arreglan en las PRUEBAS, no en el código de la plataforma

- **Qué se hizo**: `pnpm test` fallaba por tres motivos distintos —el canónico estaba apagado, dos
  suites limpiaban con un `NOT IN` cuadrático sobre 2,28 M de personas y la limpieza no borraba los
  agregados de `analytics` (FK desde `0005`)—. Los tres se arreglan en `packages/canonico/test/`.
- **Por qué**: ninguna aserción de negocio fallaba (593 asserts en verde). Tocar código de la
  plataforma para arreglar una prueba habría escondido el problema real. Detalle en
  [`INFORME-PRUEBAS.md`](INFORME-PRUEBAS.md).
- **Nivel**: 1.

### 2. La pantalla 2 vive en una ruta nueva: `/explorar/competicion/[id]`

- **Qué se hizo**: la pantalla nueva se monta en `apps/web/src/app/explorar/competicion/[id]`, con
  `id` = `core.phase_group.id`.
- **Por qué**: `/competicion/[slug]` ya existe y la web vieja la usa (lee las colas locales con slug);
  el encargo de la web dice que **las rutas nuevas conviven con las viejas** hasta W9 y que no se
  rompa la web vieja. Next no permite dos segmentos dinámicos distintos al mismo nivel (`[slug]` y
  `[id]`), así que la pantalla nueva va bajo el prefijo de la sección del prototipo («Explorar»).
- **Alternativas descartadas**: reescribir `/competicion/[slug]` (rompe la web vieja y sus pruebas);
  `/liga/[id]` (no es el vocabulario del prototipo).
- **Nivel**: 2.

### 3. Se reutilizan las consultas del canónico; sólo se añaden las que faltaban

- **Qué se hizo**: se usan las consultas ya existentes `rachas-del-grupo`, `zonas-del-grupo`,
  `ranking-goleadores` y `partidos-de-grupo`, y se añaden cuatro
  en `apps/web/src/consultas/competiciones.ts`: `grupo-por-id`, `grupos-de-la-edición`,
  `ediciones-de-la-competición` y `clasificación-de-la-pantalla`. Todas con contrato, `presupuestoMs`,
  `plan: 'indexado'`, `LIMIT` y parámetros de ejemplo.
- **Por qué**: la capa de datos ya estaba hecha y probada (66 consultas con contrato). Duplicarla
  habría creado dos definiciones de lo mismo. La clasificación sí necesitaba consulta propia porque la
  existente devuelve las dos tablas (oficial y reconstruida) a propósito, para la página que las
  compara; la pantalla nueva enseña **una** y dice cuál es.
- **Nivel**: 2.

### 4. Clasificación: manda la oficial; si no publica goles, se enseñan los reconstruidos y se dice

- **Qué se encontró**: en el grupo real de CyL (797, Liga Nacional Juvenil 2025-26) la tabla **oficial**
  trae `goles_favor = goles_contra = 0` en las 16 filas —la federación no publicó los goles— mientras
  que la **reconstruida** trae los goles reales (67:29, 56:31…). Enseñar «0:0» en todas las filas
  habría sido un dato falso con pinta de dato.
- **Qué se decidió**: la tabla es la oficial (posición, puntos, PJ, G-E-P); los goles salen de la
  reconstrucción **sólo cuando la oficial no los publica**, con una nota al pie que lo dice
  («Los goles no vienen en la tabla oficial: se enseñan los reconstruidos…»). Regla en
  `lib/pantalla-competicion.ts` (`publicaGoles`, `golesDeLaFila`), probada.
- **Por qué**: la regla del proyecto es «desconocido ≠ 0»; la reconstrucción no inventa nada, se
  calcula con los resultados publicados. Lo que no se hace es mezclar orígenes sin decirlo.
- **Nivel**: 2 (decisión de presentación dentro del sistema ya establecido).

### 5. Nombres de menores: se ocultan incluso en goleadores

- **Qué se hizo**: los goleadores pasan por `nombreVisible(es_menor, nombre)`
  (`apps/web/src/lib/menores.ts`): si es menor, la pantalla dice «Jugador menor de edad»; si no hay
  nombre publicado, «Nombre no publicado». Probado.
- **Por qué**: invariante de `CLAUDE.md` y `SEGURIDAD-OPERACION.md` §5. En el grupo real **los ocho
  primeros goleadores son menores**, así que la tarjeta se ve sin nombres: es correcto, no un fallo.
- **Nivel**: 1 (cumplimiento de una invariante).

### 6. Lo que no está, se apaga en vez de fingirse

- **Casa / Fuera**: el conmutador se enseña como el prototipo pero desactivado: `analytics` sólo tiene
  `jugados_casa`/`jugados_fuera`, no el G-E-P por condición, y agregarlo desde `core.match` choca con
  la regla «ninguna página agrega hechos de más de un partido». Queda como hueco de la proyección
  (migración nueva, 0051+), anotado en `BACKLOG.md`.
- **Pestañas Jornadas/Goleadores/Disciplina/Equipos**: desactivadas con `aria-disabled` y un `title`;
  no hay pantalla todavía y un enlace a «en obras» sin decirlo es peor que uno apagado.
- **Zonas**: sólo se pinta la leyenda de las franjas que existen; sin zonas fijadas no se pinta
  ninguna y se dice. En el grupo real sólo hay descensos (2), y la leyenda lo refleja.
- **Nivel**: 2.

### 7. Se añade un token, no un color a mano

- **Qué se hizo**: `--radius-tarjeta: 14px` en `apps/web/src/app/tokens.css`, con su comentario.
- **Por qué**: las tarjetas del prototipo tienen 14 px de radio y la escala existente sólo llegaba a
  10 px. La regla del sistema de diseño es «si un valor no tiene token, primero se crea el token».
- **Nivel**: 1 (higiene del sistema de diseño).

### 8. Grupo de referencia de Castilla y León: 797 (Liga Nacional Juvenil 2025-26)

- **Qué se hizo**: la prueba contra el canónico real usa el grupo 797 (16 equipos, 30 jornadas,
  clasificación oficial publicada, zonas y proyección). No está escrito en la página: la pantalla va
  por id de URL y la prueba es la única que lo fija.
- **Por qué**: es el equivalente real de la pantalla del prototipo («Liga Nacional Juvenil · Grupo»)
  con datos completos de CyL.
- **Nivel**: 1 (elección de dato de prueba).

---

### 9. David decidió el 2026-11-04 (coordinación): el diseño manda, la lógica de datos se conserva

- **Decisión de David** (en `ESPECIFICACION.md`, commit `6744b8d`): «El diseño manda: la capa visual se
  rehace contra el prototipo y el sistema de diseño. Lo que sí se reutiliza: contratos de API,
  consultas, la ingesta y todo lo que no sea presentación. Se decide componente a componente».
- **Cómo casa con lo hecho**: exactamente lo implementado. La pantalla 2 es una capa de presentación
  nueva (`apps/web/src/app/explorar/...` y `componentes/competicion/`) sobre las consultas existentes
  del canónico; no se copia ningún componente de la interfaz vieja. La web vieja sigue en pie hasta W9.
- **Nivel**: 2 (ejecución de una decisión de David).

---

## Preguntas de Nivel 3 que quedan abiertas (no bloquean el trabajo)

1. ~~**¿Se reutiliza `apps/web` (Next) o se rehace contra el diseño?**~~ **DECIDIDA por David el
   2026-11-04**: el diseño manda y la presentación se rehace contra el prototipo; se conservan
   consultas, contratos, ingesta y todo lo que no sea presentación (ver decisión 9 arriba).
2. **¿Cuántas de las 22 pantallas entran en la primera tanda?** Mientras no se decida, se hace una cada
   vez; la 2 ya tiene primera versión.
3. **¿`V-E-D` o `G-E-P`?** La pantalla 2 usa `G-E-P`, que es lo que enseña el prototipo en esa pantalla.
   Si se elige `V-E-D`, se cambia en la cabecera de la tabla y en la consulta de rachas.
