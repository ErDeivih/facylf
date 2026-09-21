# Estado de la reparación de las filas de descanso

Fichero de traspaso. El plan completo está en `REPARACION-DESCANSOS.md`; aquí sólo va **dónde está el
trabajo**, lo medido y lo que NO hay que volver a discutir. Todo lo que sigue está medido sobre las colas
reales el **17 de septiembre de 2026** y se puede reproducir con los comandos que se citan.

## Lo que está cerrado y verificado

| pieza | dónde | cómo se comprueba |
|---|---|---|
| inventario reproducible en JSON y legible | `pruebas/reconstruccion/informes/descansos-acta.{json,md}` | `npx tsx scripts/inventario-acta-descansos.mjs --todas --json … --md …` |
| inventario por clase causal | `pruebas/reconstruccion/informes/descansos.inventario.{json,md}` | `npx tsx scripts/inventario-descansos.mjs` |
| cruce independiente del inventario | `scripts/_diag-cruce-acta.mjs` | `node scripts/_diag-cruce-acta.mjs . euskadi valencia` |
| extractor corregido por adaptador | `scripts/lib/recolector-local.mjs`, `scripts/lib/filas-descanso-isquad.mjs` | pruebas que fallan sin el arreglo |
| filas fantasma y partidos desplazados | `scripts/reconstruir-cola.mjs` | `--simular` sobre copia |
| lote de Euskadi **aplicado** | manifiesto `e698fde408abbfc4` · diario y copia previa en `pruebas/reconstruccion/` | `--verificar e698fde408abbfc4`, `--revertir e698fde408abbfc4` |
| correcciones de marcador **aplicadas** | manifiesto `51547371258d4fdd` (5 filas) | `--verificar 51547371258d4fdd` |
| lote canónico preparado (NO aplicado) | `pruebas/reconstruccion/canonico/descansos-canonicos-31144c63afd93f2d.{json,md}` | `npx tsx scripts/preparar-lote-canonico-descansos.mjs` |
| filas de descanso que quedan en una cola | `scripts/_diag-descanso-cola.mjs` | `node scripts/_diag-descanso-cola.mjs euskadi` |
| actividad natural del worker | `scripts/_diag-actividad-worker.mjs` | `node scripts/_diag-actividad-worker.mjs euskadi 2026-09-17T06:00:00.000Z` |
| las filas de UNA jornada, tal y como están | `scripts/_diag-jornada-cola.mjs` | `node scripts/_diag-jornada-cola.mjs euskadi 22 24622157 24622363 1` |

## El lote de Euskadi, aplicado el 17/09

Manifiesto **`e698fde408abbfc4`**: **759 filas en 635 jornadas** (208 correcciones + 551 retiradas),
verificación **759/759**, copia previa de 264,9 MB por la API de `backup()` de SQLite, diario JSONL con las
filas enteras. Efecto: `partidos` 34.358 → 33.807 · filas de descanso **552 → 1** · fantasma **551 → 0**.
La única que queda es la declarada: `t18 c3117 g7389 J24 ord 4`, `KUKUYAGA F.C. vs Atsedena`, con acta
267182 que **no demuestra** nada —«no saber no autoriza a borrar»—.

Después se aplicó, aparte, el lote `51547371258d4fdd`: **5 correcciones** de marcador `(Sailkatua)` en
`t22 c24622157 g24622363 J1`, verificación **5/5**.

## El defecto que apareció AL APLICAR, y que ya está corregido

Tras aplicar el lote, la simulación dejó de cuadrar: **54 filas «ambiguas»** que antes no existían. No eran
datos: eran un **artefacto de alineación**, y el defecto era de la herramienta.

La comparación entre la cola y el HTML es **posicional**. El bloque de descanso se apartaba de los dos lados
buscándolo **en la cola**; en cuanto el lote retiró esas filas, la búsqueda no encontró nada, el bloque del
HTML se quedó sin reconocer y **desplazó una posición todas las filas siguientes** de la jornada. Medido:
`t13 c2949 g7237 J19 ord 6`, la cola ponía «GETXO vs LOGROÑES» donde el HTML publica «DANOK BAT CLUB vs
DESCANSA», y lo mismo en `ord 7` y en `J28 ord 3..6`.

La corrección es la lección de siempre en esta herramienta: **lo que el extractor emite se deduce del HTML,
no de la cola**. El bloque se reconoce ahora por las entradas informativas del HTML y el código de acta sale
de la fila **emitida**; la cola sólo es el respaldo. La regla vive en
`packages/ingesta/src/reconstruccion-cola/bloques-descanso.ts`, con pruebas que fallan sin ella:

- unidad: `packages/ingesta/test/reconstruccion-cola/bloques-descanso.test.ts`;
- de punta a punta, con el caso exacto (el bloque en medio y ya retirado de la cola):
  `packages/ingesta/test/reconstruccion-cola/herramienta.test.ts` → «un bloque de descanso CON ACTA ya
  retirado de la cola no desalinea lo que va detrás».

Efecto medido en la cola real, antes y después del arreglo:

```text
antes:   idénticas 33.750 + correcciones 5 + ambiguas 54 + fantasma 0 = 33.809
después: idénticas 33.803 + correcciones 5 + ambiguas  1 + fantasma 0 = 33.809
```

**La ambigua que queda está declarada y no es un artefacto**: `t21 c23824447 g23824448 J2 ord 0`, una fila
que sólo se diferencia del HTML en el marcador de estado `(Sailkatua)` y **no tiene acta que sostenga la
corrección**, así que la herramienta se niega a corregirla. Es la regla funcionando, no un fallo.

Además, `partidos_recuperados` dejó de contar los bloques retirados: publicaba «12 partidos recuperables»
que eran los 12 bloques que el lote acababa de retirar. Quien leyera el informe habría ido a «recuperar»
doce filas de descanso como si fueran partidos perdidos. Ahora ese contador es **0** y cada bloque
informativo lleva `en_la_cola` (esquema de manifiesto **7**), que es lo que deja ver un bloque ya retirado.

Manifiesto vigente de Euskadi: **`51547371258d4fdd`** — 33.803 + 5 + 1 + 0 = 33.809.

## Lo aplicado el 17/09/2026 (segunda tanda)

| lote | qué | verificación |
|---|---|---|
| canónico **1813** (retirada) | fuera la inscripción «Atsedena» y sus 2 partidos | el canónico queda con **0** inscripciones fantasma; el grupo pasa de 25 a **23** partidos, igual que la cola. Reversible: `pnpm importar --revertir 1813` |
| cola de Valencia **3e8f9dbe8f3faba6** (recuperación) | **28 partidos recuperados** en el grupo `904325856`, con la pareja que el acta nombra | verificación **28/28**; ciclo completo ensayado antes sobre una **copia** (aplicar → verificar 28/28 → revertir → **huella lógica idéntica**); reversión en la cola real con `--revertir 3e8f9dbe8f3faba6` |

**Antes de aplicar la retirada canónica, el lote se negó a sí mismo**: se había preparado a las 10:24 y a las
13:30 dos filas de `core.match_source` de esos partidos **ya no estaban** (nadie de este trabajo las borra:
el importador sólo las inserta, y las pruebas van acotadas a sus federaciones). El guardia dijo «la fila ya no
está, vuelve a prepararlo» en vez de retirar «lo que haya», que es exactamente para lo que existe. Se
re-preparó y se aplicó. **Queda como observación**: si vuelve a pasar, hay algo fuera de este trabajo tocando
el canónico.

## La recuperación de partidos desplazados (herramienta nueva)

`reconstruir-cola --recuperar-desplazados` **corrige** —no borra— la fila del calendario que pone «Descansa»
donde el acta de esa misma fila nombra dos equipos reales. Escribe la misma operación que una corrección (un
`update`), así que el diario y la reversión que ya existían valen tal cual. Cuatro guardas:

1. el acta tiene que nombrar **dos equipos reales**;
2. los dos tienen que **resolver** en el catálogo del grupo: la clasificación de iSquad
   (`clasificacion.json`, que la herramienta ahora lee) es la que da el código del equipo que el calendario
   **no nombra nunca**, y sin ella la fila se declara pero no se recupera;
3. la pareja del acta **no puede estar ya** en esa jornada como otra fila: recuperarla duplicaría el partido;
4. **un equipo no juega contra sí mismo**: el acta del hueco está rota cuando publica el mismo equipo en los
   dos lados, y esa fila se declara sin tocarla.

Medido en Valencia: **51 desplazados, 28 recuperables** (los 28 del grupo `904325856`; los 23 del grupo
`904326881` no se recuperan porque ese grupo no tiene clasificación publicada).

### Y un efecto que apareció al recuperar, con su arreglo

Recuperar deja la cola con una fila que **la fuente no publica** —la federación nunca publicó ese partido, el
equipo que faltaba no tenía calendario— y sigue publicando «Descansa» en esa posición. Con la comparación por
posición, esa fila de más desplazaba todas las siguientes: medido, **118 filas «ambiguas»** de puro artefacto.
Se arregló apartando de la comparación las filas que la fuente no tiene y el acta SÍ sostiene (`parejasRecuperadas`),
que quedan **declaradas** en el manifiesto como `recuperadasPorActa` y ahora son una categoría más de la
partición:

```text
valencia · manifiesto e47a8d6f82361e80 · idénticas 30.291 + 0 + ambiguas 0 + fantasma 658 + recuperadas 28 = 30.977
```

## INCIDENTE: Madrid y Valencia llevaban días sin recolectar (arreglado el 17/09)

Al comprobar la salud de los recolectores apareció un fallo que **no era de este trabajo y llevaba días
parando dos federaciones**:

```text
ReferenceError: reactiva is not defined
    at file:///…/scripts/recolector-valencia.mjs:281:9
    at preparaRepasoJornadasRecientes (…:272:3)
```

`recolector-valencia.mjs` —que es el que usan **Valencia y Madrid**, porque el de Madrid lo importa— usaba
`reactiva` en su repaso de jornadas recientes pero **no la importaba**. El proceso moría al arrancar y el
supervisor lo reintentaba cada 20 s: Madrid llevaba **sin comprobar una jornada desde el 14/09 08:22Z** y
Valencia desde el **15/09 10:32Z**. Arreglado añadiendo `reactiva` a la lista de importaciones.

Verificado sin tocar la red con su propio subcomando (`repaso-reciente`, que ejercita justo la función que
reventaba): devuelve `{"jornadas": 12, "clasificaciones": 8}` y sale con código 0. Y comprobado en vivo: los
dos recolectores **han vuelto a recolectar** (Madrid procesando actas con sus pausas de 2 s, Valencia
clasificaciones con 5 s), sin reiniciar nada: el bucle de reintento recogió el fichero corregido solo.

### Lo que hay que saber de la recuperación de Valencia

El recolector, al **re-comprobar** una jornada, **borra sus filas y las reescribe desde la fuente**. Como la
fuente nunca publicó los 28 partidos recuperados —su hueco lo ocupa «Descansa»—, si vuelve a comprobar una de
esas jornadas **el partido recuperado desaparece de la cola**. Medido el 17/09 a las 14:40: **0 jornadas** de
ese grupo re-comprobadas después del lote, así que la recuperación sigue entera (658 filas con descanso, no
686).

No es una pérdida: la reconstrucción **vuelve a detectarlo** (la fila es otra vez el bloque de descanso, con
su acta legible) y `--recuperar-desplazados` lo devuelve. Es una reparación **repetible**, no un estado que se
pierda en silencio. Lo que falta, si se quiere que sea permanente, es que el recolector **conserve** la fila
**HECHO el 17/09/2026 (tarde).** El recolector ya conserva la fila recuperada:

| pieza | dónde |
|---|---|
| la decisión, **pura y probada**: qué filas se escriben al registrar una jornada | `scripts/lib/filas-descanso-isquad.mjs` → `decideFilasDeJornada` |
| el cableado: se le pasan las filas que la cola tiene hoy y el acta de cada bloque | `scripts/recolector-valencia.mjs` → `registraPartidos` |
| 4 pruebas de la regla + 1 estructural del punto de llamada | `packages/ingesta/test/descanso-isquad.test.ts` |
| comprobación del `insert` contra el **esquema real** de la cola | `scripts/_verifica-insert-conservada.mjs` |

Cómo queda: en una jornada normal se sigue **compactando** (el descanso no ocupa `orden`: eso es lo que arregló
el defecto y no se toca), y en una jornada **con recuperación** se conservan las **posiciones de la fuente** y
en el hueco del descanso se escribe la fila que la cola ya tenía. La evidencia se exige entera: el acta tiene
que nombrar **dos equipos distintos** y su pareja tiene que ser **exactamente** la de la fila de esa posición;
sin eso, la posición se descarta como siempre. Y las pruebas incluyen los casos que NO deben conservar nada:
acta ausente, acta vacía, acta que dice otra cosa, acta con el mismo equipo en los dos lados y acta ilegible.

Por qué esto es seguro de tocar: la escritura de la jornada va **entera dentro de una transacción**
(`delete` + `inserts`), así que un fallo deja la jornada como estaba —no la corrompe—; y el colector sigue
trabajando (comprobado en vivo tras el cambio: Valencia procesando actas con sus pausas de 3-5 s, Madrid
aplazando las que la federación aún no publica).

Lo que **no** se puede comprobar todavía: que la primera re-comprobación real de una de esas 28 jornadas deje
la fila en su sitio. Eso ocurre cuando le toque a ese grupo, y se mira con
`node scripts/_diag-recuperacion-valencia.mjs` (si `jornadas del grupo 904325856 re-comprobadas después del
lote` deja de ser 0, la fila tiene que seguir ahí).

## El worker de Euskadi, entre sesiones (17/09)

El worker terminó su sesión el 17/09 a las **11:59:45 local** (23/234 trabajos, código 0) y el supervisor
relanza **cada 3600 s**, así que la siguiente sesión empieza hacia las 12:59. Comprobado con
`node scripts/_diag-actividad-worker.mjs euskadi 2026-09-17T06:00:00.000Z`: **23 peticiones naturales después
de las 06:00Z**, todas `ok`, con pausas de 6-7 s, y `max(comprobada_en)` = 09:59:44Z. El supervisor hace su
trabajo; lo que parecía un worker muerto era la **espera entre sesiones**.

Cuando recompuebe `t22 c24622157 g24622363 J1` hay que mirar una cosa concreta: el worker escribe el literal
**tal y como lo publica la fuente** (`registraJornada` guarda `p.local` en crudo), así que las **5
correcciones de marcador** `(Sailkatua)` que se acaban de aplicar **volverán a proponerse** en la siguiente
simulación. No se pierde nada —la herramienta las vuelve a corregir—, pero conviene saber que es churn y no
un defecto nuevo: quien quite el marcador es el extractor del worker, y eso es una decisión de diseño que
este trabajo no ha tomado. Se comprueba con
`node scripts/_diag-jornada-cola.mjs euskadi 22 24622157 24622363 1`.

Las filas de descanso, en cambio, **no vuelven**: `decisiones_descanso` existe (creada por el worker) con
**0 decisiones**, que es lo correcto mientras la fuente no publique ningún bloque nuevo.

## El adaptador isquad (Madrid y Valencia): hecho el 17/09/2026

Era lo grande que quedaba: **4.072 de las 6.512 filas** de descanso, en las dos federaciones que no tenían
adaptador. Ya está declarado y verificado contra las colas reales.

| pieza | dónde |
|---|---|
| maqueta `isquad` y el extractor, en el catálogo de adaptadores | `packages/ingesta/src/reconstruccion-cola/adaptadores.ts` |
| lectura de la jornada archivada y de sus filas informativas | `scripts/lib/filas-descanso-isquad.mjs` |
| la regla del **código negativo** (ya existía, con pruebas) | `scripts/lib/filas-descanso-isquad.mjs` + `packages/ingesta/test/descanso-isquad.test.ts` |
| pruebas de punta a punta con una jornada de iSquad sintética | `packages/ingesta/test/reconstruccion-cola/herramienta.test.ts` (4) y el banco, que ahora sabe escribir `jornada-N.json` |

**Medido sobre las dos colas reales** (17/09/2026, `pnpm reconstruir-cola --federacion <fed> --simular`):

```text
madrid    · manifiesto 526520fcd35148a6 · 8.287 jornadas · 53.119 filas
            idénticas 49.733 + correcciones 0 + ambiguas 0 + fantasma 3.386 = 53.119
            fantasma con acta 3.386 (todas SIN pareja legible) · retirables 0 · desplazados 0

valencia  · manifiesto 48db7b13d922ad30 · 5.344 jornadas · 30.977 filas
            idénticas 30.291 + correcciones 0 + ambiguas 0 + fantasma 686 = 30.977
            fantasma con acta 686 (51 con DOS EQUIPOS REALES, 635 sin pareja) · retirables 0
            DESPLAZADOS 51, en dos grupos: 21/29509571/904325856 (29) y 21/29509582/904326881 (22)

euskadi   · manifiesto d338d37f8fee1ccc · 4.803 jornadas · 33.809 filas
            idénticas 33.808 + correcciones 0 + ambiguas 1 + fantasma 0 = 33.809
            (las 5 correcciones de marcador ya están aplicadas, así que ahora salen idénticas)
```

Las tres son de la **misma versión** de la herramienta (`71148844f96789e2`, esquema 7), así que se pueden
comparar entre sí. Cualquier manifiesto anterior a un cambio de versión **no se puede aplicar**: la
herramienta lo rechaza y pide simular de nuevo. Los manifiestos de las iteraciones intermedias siguen en
`pruebas/reconstruccion/` con su fecha; no se borran porque son el rastro de cómo se llegó hasta aquí.

Lo que dicen esas cifras, que es lo que importa:

- **En Madrid y Valencia no se puede retirar ni una fila hoy**: sus 4.072 bloques traen acta, y el acta
  —o está vacía (`{"local":"","visitante":""}`, estado `pendiente`) o no trae pareja— no demuestra que ahí
  no hubiera partido. Quedan **declaradas**, no reparadas. Es la regla funcionando, no un atasco.
- **Los 51 desplazados de Valencia están localizados** con el equipo que la cola no tiene: en el grupo
  `904325856` (el que el plan citaba) el hueco lo ocupa `C.F. Gandia 'B'`, jornada tras jornada. Ése es el
  lote de **recuperación**, y ahora se ve desde la herramienta y no sólo desde el inventario.
- La regla del código negativo tiene la evidencia medida: **3.386 de 3.386** filas con negativo en Madrid y
  **686 de 686** en Valencia tienen la palabra, y **ninguna** tiene la palabra sin el negativo.

### Dos defectos que aparecieron AL ENCHUFARLO, y cómo se vieron

Los dos se vieron porque se simuló contra la cola real, no porque las pruebas estuvieran mal:

1. **Clasificar la fila traducida en vez de la cruda.** El extractor devuelve la fila con los nombres de la
   herramienta (`codLocal`), pero el clasificador de iSquad lee los de la fuente
   (`cod_equipo_local`). Con la fila traducida, los dos lados se quedaban sin código, los 3.386 bloques se
   declaraban «sospechosos» y Madrid publicaba **0 fantasma donde hay 3.386**.
2. **Devolver el bloque como si fuera un partido.** La comparación es posicional y el bloque se aparta de
   los dos lados por parejas: si el extractor además lo devolvía, el lado del archivo se quedaba con una
   fila de más y **desplazaba todo lo que iba detrás**. Medido: **8.569 filas ambiguas** que eran puro
   artefacto, con el patrón inconfundible —la cola `ord 1` aparecía en el archivo en la posición 2—.

Los dos están fijados con pruebas que **fallan sin el arreglo**: devolviendo el bloque a la lista, la prueba
de punta a punta «no desalinea los partidos reales» falla (1 ambigua donde tiene que haber 0).

### Las 52 ambiguas de Madrid: RESUELTAS (17/09/2026)

Estaban **todas en un grupo** (`t17 c18882291 g18850968`) y eran el mismo caso: la fila trae **el nombre
vacío y el código puesto** (`local = ""`, `equipo_local_codigo = "17145319"`). El catálogo **descartaba el
código cuando el literal venía vacío** (`catalogo.ts`: `if (!limpio) continue`), así que el propio código que
la fuente publica dejaba de resolver y la fila se declaraba ambigua en vez de idéntica.

Arreglado en `packages/ingesta/src/reconstruccion-cola/catalogo.ts`: **el código entra en el catálogo
siempre**, con nombre o sin él. Medido: Madrid pasa de `ambiguas 52` a `ambiguas 0` (las 52 son ahora
idénticas: son filas bien guardadas a las que la fuente no les publica el nombre). Con su prueba, que falla
sin el arreglo, en `herramienta.test.ts`.

## El lado canónico, medido el 17/09/2026 (PostgreSQL vivo)

`npx tsx scripts/_diag-alcance-canonico-descansos.mjs` (sólo lectura) y
`npx tsx scripts/preparar-lote-canonico-descansos.mjs`, que además recorre las **claves foráneas reales** en
vez de una lista escrita a mano:

- **una** inscripción fantasma en todo el canónico: `core.team_entry` **5344**, «Atsedena»,
  euskadi 2025-26, competición 23233882, grupo 23233962, código externo `NULL`, vía
  `referencia-contextual`, visibilidad del grupo `parcial_privada`;
- cuelgan de ella **2 partidos** (`core.match` 30746 y 30747) y **2 filas de `core.match_source`**;
- **cero** apariciones, eventos, fichas de cuerpo técnico, filas de clasificación y resúmenes de equipo
  —`core.appearance`, `core.match_event`, `core.match_staff`, `core.standing_snapshot`,
  `analytics.team_edition_summary`, `analytics.player_team_season_summary`, `core.match_official`,
  `core.match_report`—: miradas por su clave foránea real, no por una lista;
- **cuadre exacto**: el canónico tiene 25 partidos en el grupo y la cola 23 filas, y el lote retira 2 → la
  diferencia es exactamente lo que sobra.

El lote está **preparado y NO aplicado**, con las filas enteras dentro para poder revertirlo.

**La maquinaria para aplicarlo ya existe (17/09/2026).** Era la pieza que faltaba: el diario canónico
(`ops.batch_cambio`, migración 0009) sólo admitía `accion in ('insert','update')` y `revierteLote` sólo sabía
borrar lo insertado o restaurar lo actualizado, así que **un borrado era irreversible**. Lo que se ha añadido:

| pieza | dónde |
|---|---|
| migración **0015** que admite la acción `borrado` | `infra/migraciones/0015-diario-borrado.sql` (aplicada: `pnpm db:migrar`) |
| la retirada con diario: guarda la fila ENTERA antes de borrarla | `packages/canonico/src/retirada.ts` |
| la reversión, que ahora **reinserta** lo retirado, en orden de escritura | `packages/canonico/src/reversion.ts` (`ORDEN_DE_BORRADO`, `ORDEN_DE_ESCRITURA`) |
| CLI: `pnpm importar --retirar <lote.json> [--aplicar]` | `packages/canonico/src/cli.ts` |
| pruebas: 6, con la reversión comparada por **huella lógica** | `packages/canonico/test/retirada.test.ts` |

Tres cosas que la retirada **no** hace, y son las que la hacen fiable: no decide qué se retira (lo decide la
herramienta que compara la cola con el HTML y lo revisa una persona); **no borra a ciegas** —relee cada fila y
se detiene si cambió desde que se preparó el lote—; y no toca nada fuera de las claves que se le dan (si un
`delete` afecta a cero filas, el lote entero se deshace).

La prueba central falla sin el arreglo: sin la rama de `borrado` en la reversión, `reinsertadas` da **0** en vez
de las 8 filas del ámbito de prueba. Comprobado desactivando la rama y volviéndola a poner.

Ensayado en seco sobre el lote real, sin escribir nada
(`pnpm importar --retirar …/descansos-canonicos-31144c63afd93f2d.json`): **2 × `core.match_source` →
2 × `core.match` → 1 × `core.team_entry`**, en ese orden de borrado. Aplicarlo es una orden
(`--aplicar`), y deshacerlo es `pnpm importar --revertir <batch_id>`; **no se ha aplicado**: la decisión de
tocar el canónico no la toma este trabajo.

Y queda dicho por qué el diario del lote que las creó no sirve: la inscripción la creó el lote **1492**, cuyo
`ops.batch_cambio` ya no existe —lo sustituyó el 1493, del mismo ámbito—, y el 1493 sólo tiene entradas de
**actualización** de esa fila. Revertir 1493 restauraría valores, no retiraría nada.

## Lo que queda, y en qué orden

**Nada urgente.** Lo que sigue queda abierto y con su motivo escrito:

1. **Los 23 desplazados del grupo `904326881`** (Valencia): **no se recuperan y no se van a recuperar.** La
   acta de esas filas nombra `C.F. Gandia 'B'`, un equipo que **no está ni en el calendario ni en la
   clasificación de ese grupo** (`Real de Gandia C.F. 'A'` y `'E'` sí, pero no ése). Recuperarlos metería en
   el grupo un equipo ajeno: se quedan declarados. Es una observación de calidad de la fuente, no una tarea
   de reparación.
2. **Retirada de las filas retirables de las demás federaciones**, una por lote reversible. Hoy las colas
   reparadas son Euskadi (551 retiradas + 5 corregidas) y Valencia (28 recuperadas). Las federaciones PNFG
   declaradas fallan con «no tiene adaptador de resolución» porque su Clase B sigue pendiente (decisión
   tomada: se dejan para después), y murcia, navarra y cantabria no tienen adaptador ninguno.
3. **Las actas que faltan** (medido el 17/09): **3.893 de las 4.072** filas de Madrid y Valencia tienen el
   acta **en cola sin descargar** (`pendiente`), así que se arreglan solas con la recolección al ritmo del
   worker; quedan **114 descargadas sin pareja** (Valencia) y **15 sin fila de acta** (Madrid). Diagnóstico:
   `node scripts/_diag-actas-descanso.mjs`. Decisión tomada: **se dejan declaradas** hasta que la recolección
   las traiga; no se tocan a mano.
4. **La pasada de colores y tablas de la web: HECHA** (17/09, tarde). Ver el apartado siguiente.

### La pasada de la web (LibraryUI, puertas P1/P2/P3)

Los tres números han pasado a cero/ok y la web **compila**:

| puerta | antes | después |
|---|---|---|
| P1 · colores literales en componentes | **84** en 13 componentes | **0** |
| P2 · `caption` y `scope` en las tablas | 0 y 0 | **2 y 5** (las 2 tablas del producto) |
| P3 · números tabulares | 1 | **2** (las 2 tablas) |

Cómo se hizo, para que se pueda revisar: `scripts/arregla-colores-web.mjs` lleva un **mapeo declarado**
hex → rol (familia de la clase conservada: `text-` sigue siendo `text-`), y los colores de los gráficos —que
viajan en atributos de SVG, donde `var()` no es una declaración CSS— pasaron a `currentColor` con una clase
de rol. Se añadieron a `tokens.css` dos roles que faltaban: `--texto-inverso` (texto sobre superficie fuerte)
y `--calor-0..3` (la escala del mapa de calor, **derivada del rojo semántico**, no una paleta aparte).
Comprobado con `tsc` limpio y `pnpm --filter @facylf/web build` correcto.

### Un fallo de la herramienta que apareció al mirar los 23

La clasificación del grupo vive en **`<grupo>/clasificacion.html.gz`** (PNFG y nova) o
**`<grupo>/clasificacion.json`** (iSquad), y la herramienta la buscaba con `dirname(archivo)`, que apunta a
`<grupo>/jornadas/`: **nunca la encontraba**. Arreglado (`reconstruir-cola.mjs`, la carpeta del grupo primero
y la de `jornadas` como respaldo). No cambia los recuentos de Euskadi ni de Madrid —sus códigos vienen del
calendario— pero es lo que hace que un equipo que el calendario no nombra se pueda identificar.

Las decisiones —todas tomadas— están en [DECISIONES-DESCANSOS.md](DECISIONES-DESCANSOS.md).

## Dos trampas ya pagadas, para no repetirlas

1. **Una cadena de `if` propia cuenta distinto que el clasificador probado.** Un recuento a mano dio 5
   partidos desplazados donde hay 18. El inventario usa `veredictoDelActaDeDescanso`, la misma función que
   la herramienta.
2. **En SQL, `'' is not null` es cierto.** Las actas de Madrid y Valencia tienen `{"local":"","visitante":""}`;
   contarlas como pareja publicó 111 y 150 filas «con dos equipos reales» que no existen. El que estaba mal
   era el cruce, no el inventario.

Y una tercera, que costó 54 filas publicadas como ambiguas: **lo que el extractor emite se deduce del HTML,
nunca de la cola**. Reconocer un bloque buscándolo en la cola funciona hasta que un lote retira la fila, y
entonces el fallo no se ve como un error de código sino como 54 filas raras que parecen un hallazgo.
