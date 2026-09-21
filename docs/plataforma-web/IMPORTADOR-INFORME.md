# Importador SQLite → PostgreSQL · informe final

Encargo: [`ENCARGO-IMPORTADOR.md`](ENCARGO-IMPORTADOR.md). Paquete: `packages/canonico`.
Fecha del informe: 14 de septiembre de 2026. Todo lo que sigue está medido en esta máquina, contra
las colas reales de `descargas-*` y el PostgreSQL canónico local (`facylf-postgres`, 127.0.0.1:5433).

Lo que **no** es una medición va marcado como ESTIMADO.

## 1. Qué se ha construido

Un importador incremental, por grupo, que lee la cola SQLite **en sólo lectura** y escribe en el
canónico con el rol `facylf_publicador`. Un grupo = un lote = **una transacción**: o entra entero o
no entra nada. En `--seco` se ejecuta el lote completo y se revierte, así que también valida
vocabularios y recuentos sin dejar rastro.

```bash
pnpm importar --federacion castilla-leon --temporada 2024-25 --grupo 11379752 [--seco]
pnpm importar --estado
pnpm importar --revertir <lote>
```

## 2. Importaciones reales hechas

| federación | temporada | grupo | partidos | participaciones | eventos | filas escritas | tiempo |
|---|---|---|---|---|---|---|---|
| Castilla y León | 2024-25 | 11379752 (Tercera Fed., 1ª Fase Gr. VIII) | 342 | 12.177 | 8.657 | 28.909 | 2 min 16 s |
| Castilla y León | 2025-26 | 22911127 (Tercera Fed., 1ª Fase Gr. VIII) | 306 | 11.522 | 7.828 | 25.950 | 2 min 14 s |
| **Canarias** | 2025-26 | 903011009 (3ª Fed. Femenino Gr. XII) | 132 | 4.291 | 2.651 | 10.351 | 43 s |
| **Cataluña** | 2025-26 | 54322935 (Primera Catalana Gr. 3) | 240 | 9.403 | 653 | 17.539 | 43 s |
| Castilla y León | **2026-27 (en curso)** | 24218933 | 18 | 696 | 455 | 2.605 | 9 s |

En las cuatro, la validación del lote dice **«recuentos origen/destino: cuadran»** para todas las
entidades (partidos, actas, participaciones, eventos, técnicos, árbitros). La diferencia entre
marcador y eventos aparece en 1 partido por grupo y queda como incidencia estructurada, nunca
silenciada.

**Idempotencia en datos reales**: reimportar el grupo de Canarias da `0 filas insertadas · 8.425
actualizadas`, mismos recuentos y misma cobertura (`completa hasta J22`). El estado canónico no
cambia.

**Reversión en datos reales**: revertir un lote de 27.168 filas dejó 0 fallos; el segundo caso de
prueba restauró 25.881 filas y no conservó ninguna.

**Los cinco grupos están reimportados con las correcciones de las rondas 6 y 7**: identidad nominal
para quien no tiene código, vocabulario de roles medido y reconciliación de la ficha de cuerpo
técnico. En Castilla y León las fichas quedaron en **6.442, exactamente las del origen** (3.180 + 3.089
+ 173), y el residuo de los cambios de regla —356 identidades viejas que ya no citaba nadie— se retiró
con la herramienta de mantenimiento. Personas en el canónico: 3.472, de las cuales 2.090 son
identidades nominales (cuerpo técnico, árbitros y jugadores sin código), marcadas como tales para que
la web no las presente como perfiles confirmados.

**Clasificación reconstruida.** Cada lote escribe la tabla del grupo en `core.standing_snapshot` con
`origen = 'reconstruida'`, calculada con las reglas ya probadas de `packages/dominio` (victoria 3,
empate 1, derrota 0; desempate por enfrentamiento directo sólo cuando los empatados se han enfrentado
todos entre sí, después diferencia de goles y goles a favor; si sigue el empate, sorteo pendiente y se
marca en vez de ordenar a dedo). Se calcula **hasta la última jornada completa**: una tabla a mitad de
jornada no es la tabla de ninguna jornada, y si la primera jornada está incompleta no se escribe nada.
La oficial (`origen = 'oficial'`) sigue pendiente; cuando se importe, la web enseñará ésa.

Comprobado sobre el grupo completo de Tercera Federación (342 partidos, 19 equipos): suma de partidos
jugados 684 = 2 × 342; suma de puntos 920 = 3 × 236 victorias + 2 × 106 empates; goles a favor 813 =
goles en contra 813; **0 filas** con `ganados + empatados + perdidos ≠ jugados` o
`puntos ≠ 3·ganados + empatados`.

**Corrección (importando la tabla oficial):** en la primera versión de este informe se dijo que ese
grupo tenía equipos con 35, 36 y 37 partidos jugados «y estaba bien, porque el calendario no es un
round-robin perfecto». **Era falso.** Con 19 equipos cada uno juega 18 rivales dos veces: 36 partidos,
siempre. La clasificación oficial que publica la federación da 36 a los diecinueve. La reconstruida daba
35 a cinco equipos y 37 a otros cinco porque **el calendario archivado tiene partidos con el equipo mal
asignado**. Comparadas las dos tablas: **7 de 19 equipos difieren**, siempre en victorias/derrotas
(nunca en empates) y compensándose entre sí — los totales coinciden (684 partidos, 920 puntos, 236
victorias). Los resultados existen; algunos están colgados del equipo que no es.

Esa comparación es justo la regla 5 de la skill de calidad («la clasificación reconstruida coincide con
la oficial, o la diferencia está explicada») y ya está en marcha: la oficial se importa del HTML
archivado, la web enseña la oficial cuando existe y la diferencia queda registrada equipo a equipo en
`ops.normalizacion_error`.

### Los siete partidos mal asignados: causa y reparación (15/09/2026)

Lo que faltaba era localizarlos, y el informe anterior decía «cinco». **Son siete**, y el error no
estaba donde se creía:

- **No era la fuente.** El HTML archivado de las siete jornadas describe el calendario correcto: leído
  con el extractor actual da un round-robin perfecto (19 equipos, 342 partidos, 0 equipos con ≠36
  partidos, 0 parejas irregulares). Lo que estaba mal era la **fila de la cola**.
- **El recuento por equipo sólo ve cinco** porque dos de los siete se compensan entre sí: `C.D.
  Mirandés S.A.D. "B"` y `Júpiter Leonés` aparecen los dos en un partido que les quita un enfrentamiento
  y en otro que se lo da.
- **El mecanismo, demostrado:** el conjunto de jornadas en las que la fila «Descansa» precede al primer
  partido es `{8, 9, 23, 33, 34, 36, 37}` y coincide **al 100 %** con el conjunto de jornadas mal
  asignadas. El equipo que descansaba se coló como `local` del primer partido, el `local` verdadero pasó
  a `visitante` y el `visitante` verdadero se perdió.
- **Alcance medido en las 18 colas:** 181 partidos con esta misma forma (Castilla y León 78, Asturias
  48, Aragón 34, Cantabria 10, Castilla-La Mancha 6, La Rioja 5), 2 con el campo invertido y 242 que no
  comparten ningún equipo. De los 22 grupos importados, sólo estaba afectado el 11379752.

**Regla nueva del importador** (`packages/canonico/src/resolucion/equipos-acta.ts`): cuando el
calendario y el acta de ese mismo `codigo_acta` se contradicen sobre quién jugó, **manda el acta** (es el
documento del partido, y todo su contenido es relativo a esa pareja), pero sólo se corrige si la
contradicción es demostrable (`invertido`, o `fuga` con el equipo fantasma sin jugar ningún otro partido
de la jornada). Cualquier otro desacuerdo **detiene el lote** en vez de elegir. Detalle completo en
[IMPORTADOR-SQLITE.md](IMPORTADOR-SQLITE.md).

Resultado medido tras reparar y reimportar el grupo (lotes 713 y 714, idempotentes):

| comprobación | antes | después |
|---|---|---|
| equipos que juegan 36 partidos | 9 de 19 | **19 de 19** |
| parejas con recuento ≠ 2 | 14 | **0** |
| equipos de la reconstruida que difieren de la oficial | 7 de 19 | **0 de 19** |
| participaciones / eventos / técnicos / árbitros | 12.177 / 8.657 / 3.180 / 342 | **idénticos** |
| apariciones obsoletas de los partidos reparados | 0 retiradas | **250 retiradas** |

La segunda pasada da **0 filas insertadas · 25.926 actualizadas · 0 rechazadas** con la misma cobertura:
la idempotencia, comprobada sin buscarla otra vez.

**Muestra de las dieciocho federaciones (14/9/2026).** Con el importador ya corregido se importó, de
cada federación, el grupo con más datos dentro de la ventana (`scripts/importar-muestra-federaciones.mjs`):
**17 de 18 federaciones, 193.219 filas, y ni un solo valor fuera de los vocabularios medidos** — que es
la prueba de fuego de un importador que trabaja contra dieciocho adaptadores, cinco lenguas y formatos
distintos. Melilla es la única que falta: no tiene cola propia todavía. El canónico queda con 22 grupos,
6.483 partidos, 160.450 participaciones, 106.037 eventos y 13.080 personas.

**Grupos añadidos el 15/09/2026**, en el orden recomendado (Salamanca primero, después regionales y
nacionales), todos de Castilla y León 2025-26 y todos con la última jornada completa:

| grupo | competición | categoría | partidos | actas | filas escritas | oficial vs reconstruida |
|---|---|---|---|---|---|---|
| 22911139 | 1ª División Provincial de Aficionados · Primera - **Salamanca** | aficionados | 182 | 182 | 14.541 | coinciden |
| 22911162 | 1ª División Provincial de Juveniles · Primera - **Salamanca** | juvenil | 182 | 182 | 14.141 | 1 equipo: sanción de −3 |
| 22911133 | 1ª División Regional de Aficionados · Primera - A | aficionados | 240 | 240 | 19.463 | coinciden |
| 22911134 | 1ª División Regional de Aficionados · Primera - B | aficionados | 240 | 240 | 19.088 | 1 equipo: sanción de −3 |
| 22911129 | **Liga Nacional Juvenil** · Primera - III | juvenil | 240 | 240 | 20.361 | coinciden |

Ninguno de los cinco tiene una sola pareja de equipos imposible (62 de 62 equipos juegan los partidos
que les toca) ni un solo partido con la pareja del calendario contradiciendo a la del acta. Las dos
diferencias con la oficial son la misma cosa y están explicadas: los resultados son idénticos
(`Sporting Carbajosa` 5-3-18 y `C.D.F. Helmántico` 7-3-20 en las dos tablas) y la oficial resta tres
puntos en cada caso — una sanción, no un resultado que falte. **No se corrige inventando.**

El canónico queda con **27 grupos, 7.567 partidos, 196.258 participaciones, 133.772 eventos, 41.945
fichas de cuerpo técnico y 16.062 personas.** La reimportación de 22911139 da **0 filas insertadas**.

**Menores.** El grupo juvenil de Salamanca tiene 385 personas y **las 385 quedan marcadas
`es_menor = true`**: la privacidad no depende de la pantalla que las enseñe, está en el dato.
`visibility_state = 'completa'` describe la **cobertura de la competición** (26 de 26 jornadas, 182 de
182 actas), no autoriza a publicar información nominal de menores: eso lo restringe
[SEGURIDAD-OPERACION.md](SEGURIDAD-OPERACION.md) §1.


Los tres primeros grupos se reimportaron en la misma tanda y dieron **0 filas insertadas**: la
idempotencia, comprobada sin buscarla. Y los recolectores siguieron trabajando a su ritmo durante toda
la tanda (187 peticiones en tres minutos, doce federaciones activas): importar y recolectar conviven.

Casos que han entrado, que son justo los que hay que probar: federaciones con resultados pero **sin
ninguna acta** (Madrid, La Rioja, Extremadura, Castilla-La Mancha), una con **todos los resultados a
NULL** porque la temporada acaba de empezar (Cataluña 2026-27), una federación pequeña (Canarias) y el
caso rico de Castilla y León.

## 3. Cuánto ocupa un grupo en PostgreSQL
Grupo completo de Tercera Federación (11379752): 342 partidos, 12.177 participaciones, 8.657 eventos,
3.180 técnicos, 817 personas, 1.049 referencias externas.

**MEDIDO** — suma de `pg_column_size()` de las filas del grupo (dato real, sin estimar):

| tabla | filas | medido |
|---|---|---|
| `core.appearance` | 12.177 | 969 KB |
| `core.match_event` | 8.657 | 792 KB |
| `core.match_staff` | 3.180 | 220 KB |
| `source.external_ref` | 1.049 | 108 KB |
| `core.match_report` | 342 | 92 KB |
| `core.person` | 817 | 81 KB |
| `core.person_name` | 817 | 71 KB |
| `core.person_source_identity` | 817 | 65 KB |
| `core.match` | 342 | 40 KB |
| `core.match_official` | 342 | 19 KB |
| `core.match_source` | 342 | 17 KB |
| catálogo y jornadas (equipos, clubes, campos, jornadas) | 112 | 9 KB |
| **total de filas** | **33.894** | **2,43 MB** |

**ESTIMADO** — la parte proporcional de `pg_total_relation_size` (tabla + índices + TOAST) que le
toca al grupo por su número de filas: **≈ 11,6 MB**. Índices y TOAST pesan más que las propias filas,
como era de esperar en `appearance` y `match_event` (las dos tablas que dominan: ≈ 3,7 MB y ≈ 4,3 MB
estimados).

**Diario de reversión** (lo que hace posible `--revertir` exacto): el lote de ese grupo guarda 28.909
filas en `ops.batch_cambio`, **4,8 MB medidos** (≈ 174 bytes por fila, porque guarda el estado
anterior de lo que actualiza). Con sus índices, ≈ 7 MB ESTIMADO. **Medido en conjunto: el diario de un
grupo pesa más que sus partidos y actas juntos.** Por eso ahora se poda (ver §5).

Resumen para dimensionar: **un grupo ≈ 2,4 MB de filas y ≈ 11,6 MB con índices**, y mientras ese lote
sea el último de su ámbito hay que sumarle su diario (≈ 4,8 MB medidos).

## 3.1 ¿Cabe el canónico completo en disco?

La pregunta del cliente, respondida con dos cosas medidas y no con una corazonada
(`scripts/_diag-tamano-canonico.mjs`).

**Coste medido por fila** en el canónico (datos de fila, sin índices):

| entidad | bytes por fila |
|---|---|
| partido | 120 |
| acta (`match_report`) | 275 |
| participación | 82 |
| evento | 94 |
| ficha de cuerpo técnico | 69 |
| persona | 113 |

**Filas que hay hoy en las 18 colas de origen**: 85.594 grupos · 520.501 partidos · 6.944.512
participaciones · 4.420.258 eventos · 1.047.790 fichas de cuerpo técnico.

**ESTIMACIÓN** (marcada como estimación: es «lo ya recolectado», no «lo que llegará»):

| concepto | tamaño |
|---|---|
| datos de fila | 1.142 MB |
| con índices y TOAST (factor 4,8 medido sobre el grupo completo) | 5,4 GB |
| diario de reversión (medido: +60 %, y se poda por grupo) | +3,2 GB |
| **total estimado** | **8,6 GB** |

En el disco donde vive el contenedor hay **118,1 GB libres de 208,3 GB**. **Sí cabe**, con margen de
más de diez veces, incluso contando el diario. Lo que no cabe es el tiempo: a 193-398 filas/s, cargar
esas ocho millones y medio de filas es una operación de días de máquina, no de horas.

Los dos números que hay que vigilar cuando la carga arranque de verdad: el canónico ocupa hoy 86 MB y
`ops.batch_cambio` no devuelve el espacio de lo borrado sin `VACUUM FULL` (el espacio queda
reutilizable, pero el fichero no encoge).

## 4. Rendimiento medido y lo que implica

| grupo | filas | segundos | filas/s |
|---|---|---|---|
| 11379752 (342 partidos), primera importación | 28.909 | 136 | 213 |
| 11379752 (342 partidos), **reimportación con la caché** | 28.909 | **73** | 396 |
| 22911127 (306 partidos), primera importación | 25.950 | 134 | 193 |
| 22911127 (306 partidos), **reimportación con la caché** | 25.950 | **43** | 603 |
| 903011009 (132 partidos), primera importación | 10.351 | 43 | 241 |
| 903011009 (132 partidos), **reimportación con la caché** | 10.351 | **26** | 398 |

Entre 1,9 y 3,1 veces más rápido según el grupo, con los recuentos cuadrando igual. La mejora viene de
resolver la identidad de cada persona **una vez por lote** en lugar de dos o tres consultas por
aparición, y de aplicar al final, en una sola sentencia, el seguimiento de `primera_acta`,
`ultima_acta` y `es_menor`.

La escritura va fila a fila con `insert … on conflict … do update … returning`, que es lo que hace
falta para saber si cada fila se ha insertado o actualizado (y para el diario). Las participaciones y
los eventos ya iban por tandas, pero **resolver cada persona costaba dos o tres consultas por
aparición** (decenas de miles por grupo). Ahora la identidad se resuelve una vez por lote y el
seguimiento (`primera_acta`, `ultima_acta`, `es_menor`) se aplica al final en una sola sentencia: la
misma reimportación bajó de 54,8 s a 26 s, **2,1 veces más rápida**, con los recuentos cuadrando
igual.

**ESTIMADO**: importar la temporada en curso de Cataluña tal y como está hoy en la cola (57.018
partidos en 266 grupos) sigue siendo una carga de horas; antes de lanzarla hay que medir con el
importador ya optimizado y decidir el orden de carga.

## 5. Diario de lote y reversión (decisión tomada)

- Un lote guarda, fila a fila, la clave y el estado anterior de todo lo que escribe. Eso es lo que
  permite que `--revertir` deje la base exactamente como estaba (probado: 25.881 restauradas, 0
  conservadas).
- El diario sólo sirve mientras ese lote sea el último de su ámbito. Al confirmar un lote nuevo del
  mismo grupo, el importador **borra el diario de los anteriores** de ese ámbito y lo dice en
  consola: `diario: 18.776 filas del diario anterior de este mismo grupo borradas (ese lote ya no era
  reversible; éste sí)`. Medido en la reimportación de Canarias. De los lotes viejos queda su fila en
  `ops.batch` con recuentos, validación y cobertura.
- Al borrar, el espacio queda **reutilizable** pero el fichero no se encoge (VACUUM normal): medido,
  `ops.batch_cambio` sigue ocupando 22,4 MB con 65.890 filas vivas y 11,5 MB de datos reales.
- `--revertir` de un lote cuyo diario ya se podó **se niega con un mensaje explícito** en vez de
  deshacer a medias.

## 6. Migraciones añadidas

Ninguna migración aplicada se ha editado; las tres son nuevas:

- `0009-diario-de-lote.sql` — `ops.batch_cambio`.
- `0010-claves-naturales-club-y-campo.sql` — claves naturales que faltaban para el `on conflict` de
  `core.club` y `core.venue` sin código externo.
- `0011-cascada-estado-derivado.sql` — el estado derivado (cobertura y agregados) se va con la
  entidad de la que sale. Sin esto, revertir un lote no podía borrar el grupo ni su edición: el punto
  de control de cobertura lo bloqueaba. Lo encontró la prueba obligatoria 6.

## 7. Vocabularios
**Ninguno nuevo.** Canarias, la temporada 2026-27 y los grupos de Castilla y León se han importado sin
un solo cambio de código, que es el criterio de aceptación pedido. Un valor fuera del vocabulario
medido sigue deteniendo el lote entero sin escribir nada (`ValorDesconocido`, prueba 7).

### Jugadores sin código federativo: error encontrado y corregido

Midiendo las colas para probar «todos los tipos de datos» apareció un fallo grave que ninguna prueba
cubría: al jugador sin `jugador_codigo` se le inventaba un código con su nombre (`nominal:<NOMBRE>`)
y `context_key` vacío. Eso une a **todas** las personas que se llaman igual en toda la federación y
en todas las temporadas, y además las marcaba como identidad confirmada (`identidad_nominal = false`).
No es un caso raro: Cataluña trae **255.701 de 255.701** participaciones sin código, Navarra 286.064
de 422.475, Extremadura 27.772, Castilla y León 17.596, Murcia 16.775, Galicia 8.644, Baleares 7.962,
Euskadi 5.718, Aragón 107.

Corregido: sin código, la identidad es **nominal** (`identidad_nominal = true`) con el ámbito que fija
ADR-0011 — `rol=jugador;temporada=…;ambito=equipo:<team_entry>;nombre=…`—, y los menores siguen
marcados como menores. Además, el autor de un gol/evento sin código ya no se pierde: si su equipo se
puede resolver, se le da identidad nominal; si no, el evento se queda sin persona, que es la verdad.
Probado con dos casos nuevos en `packages/canonico/test/lote.test.ts` (pruebas 8 y 9): mismo nombre en
dos equipos no se fusiona, no aparece ningún `codigo_externo` que empiece por `nominal:`, y la segunda
pasada no crea personas. En el canónico actual, comprobado: **0 identidades falsas y 0 personas
huérfanas**.

Lo que queda por refinar (no urgente, y anotado): si una fuente trae código en las participaciones
pero no en los eventos, el mismo jugador puede acabar con una identidad confirmada por sus
apariciones y otra nominal por su gol. En Canarias se ha medido: de 13 goleadores sin código, **0**
tenían gemelo codificado con el mismo nombre normalizado, así que hoy no hay duplicados; cuando
aparezca el caso, el enlace correcto es buscar dentro de la propia acta un jugador con código cuyo
nombre coincida en ese mismo equipo.

### Cataluña: la federación sin códigos, y los dos fallos que destapó

Cataluña publica por un adaptador propio y **todas** sus participaciones vienen sin `jugador_codigo`.
Su grupo de Primera Catalana (240 partidos, 9.403 participaciones, 2.552 fichas de cuerpo técnico) se
importó sin un solo cambio de código: 17.539 filas, 43 s, validación correcta, cobertura completa
hasta J30. De sus 1.190 personas, **las 1.190 son identidades nominales** (`identidad_nominal = true`),
que es la verdad: a esos jugadores y técnicos sólo se les conoce por su nombre.

Esa importación destapó dos fallos que ninguna prueba cubría:

1. **Roles sin normalizar.** Se creía que eran «17 variantes sólo en Canarias»: medidos sobre las 18
   colas son **130 literales** en cinco lenguas. `2ºEntrenador` (76.509 filas) se normalizaba a
   `entrenador` porque la regla general se evaluaba antes que la específica, y `DEL. Equipo` (282.265),
   `A.T.S.` (7.781) o `DELEGAT EQUIP` (14.714) pasaban tal cual, partiendo en dos identidades a la
   misma persona. Corregido con una lista cerrada de 17 roles, reglas ordenadas de lo específico a lo
   general y **registro medible** de lo que no encaja (`ops.normalizacion_error`), documentado en
   `IMPORTADOR-SQLITE.md`. En el grupo de Cataluña pasaron de 6 roles sin normalizar a 0.
2. **Fichas de cuerpo técnico duplicadas.** `core.match_staff` se indexa por `(partido, persona, rol)`,
   así que al corregir la identidad la fila vieja no se pisaba: **2.552 fichas de origen eran 4.475 en
   el canónico**, y la validación decía «cuadran» porque no contaba técnicos ni árbitros. Corregido:
   el lote retira de sus partidos las fichas que no confirma (1.923 retiradas, anotadas en el lote) y
   la validación cuenta ya técnicos y árbitros.

Queda una herramienta de mantenimiento para el residuo de esos cambios de regla, con informe por
defecto y borrado sólo si se pide:

```bash
pnpm --filter @facylf/canonico huerfanos            # informa
pnpm --filter @facylf/canonico huerfanos --aplicar  # borra personas sin ninguna referencia
```

Sólo borra personas a las que no apunta ninguna aparición, designación, ficha ni evento, y que no
tienen ninguna decisión de identidad registrada. Medido: 249 personas huérfanas del cambio de roles,
borradas; **0 huérfanas** y 3.327 personas en el canónico después.

## 8. Criterios de aceptación (§10 del encargo)

- [x] Un grupo completo de Castilla y León se importa y los siete puntos de §9 pasan — `7/7` en
      verde en `packages/canonico/test/lote.test.ts`.
- [x] El mismo importador procesa un grupo de Canarias sin un solo cambio de código — 903011009,
      43 s, validación correcta. **Y un grupo de Cataluña**, la federación cuyo 100 % de
      participaciones viene sin código de jugador, también sin cambios: 54322935, 17.539 filas, 43 s.
- [x] Un grupo de la temporada en curso, a medias, importa y su `coverage_checkpoint` lo refleja —
      24218933 (2026-27): `jornadas 34/34 · partidos 18 (con resultado 18) · completa hasta J2 ·
      verificada_hasta_jornada`. No dice «completa»: dice hasta dónde llega.
- [x] `pnpm test` (125 pruebas, 22 ficheros), `pnpm lint` (dominio, ingesta y canónico) y
      `tsc --noEmit` en verde.
- [x] Ninguna consulta se escribe por concatenación de cadenas: los valores van siempre por
      parámetros (`$1`, `$2`, …). Lo único que se interpola son **nombres de tabla y de columna**,
      que salen de constantes del propio esquema (o de las claves reales del diario), nunca de un
      dato de la cola.
- [x] El informe cuadra con los recuentos de la cola (validación de cada lote).
- [x] `IMPORTADOR-SQLITE.md` no necesitaba vocabulario nuevo; sí recoge ahora la política del diario.

## 9. Prohibiciones (§11) respetadas

- No se ha editado ninguna migración ya aplicada.
- Las colas SQLite se abren en sólo lectura y no se les ha hecho ningún `PRAGMA` de escritura.
- Los recolectores no se han tocado: ni ritmo, ni pausas, ni reintentos.
- El importador sólo escribe con `facylf_publicador`; el pool rechaza la cadena de `facylf_admin`.
- Sigue sin haber pantallas nuevas: primero el dato.

## 10. Lo que queda pendiente

1. **~~Reimportar los tres grupos de Castilla y León~~** — hecho el 15/09/2026 con la caché de
   personas, los roles corregidos y la reconciliación con el acta. El grupo 11379752 se reimportó dos
   veces (lotes 713 y 714) y la segunda dio 0 filas insertadas.
2. **~~`core.standing_snapshot`: la clasificación oficial~~** — hecho: se importa del HTML archivado con
   `origen = 'oficial'`, la reconstruida se guarda aparte con `origen = 'reconstruida'` y, cuando las
   dos existen, la diferencia se registra equipo a equipo. En el grupo 11379752 las dos **coinciden**.
3. **242 partidos donde el calendario y el acta no comparten ningún equipo.** No se pueden resolver de
   forma automática (no se sabe qué partido describe el acta) y el importador **detiene el lote** cuando
   los encuentra, así que los grupos que los contienen no se importan hasta revisar la fuente. Medido:
   Euskadi 167, Castilla y León 62, Aragón 5, Castilla-La Mancha 3, La Rioja 3, Ceuta 2. Es la
   incidencia abierta más grande de la ingesta.
4. **Agregados `analytics.*`**: las tablas existen y su cascada está puesta, pero el importador todavía
   no las rellena.
5. **Permisos**: el rol `facylf_lector` no puede leer `source.*` (la procedencia es del importador). Es
   una decisión razonable, pero conviene confirmarla por escrito antes de que la web quiera mostrar «de
   dónde viene este dato».
6. **Carga inicial**: no se ha lanzado la importación masiva. Con los números de §4 es una decisión de
   días de máquina, no de minutos. Ahora mismo la máquina tiene **1,5 GB libres de 32 GB** y cuatro
   recolectores están parados esperando 2,5 GB para abrir Chrome: la carga masiva y la recolección no
   caben a la vez en esta máquina.

