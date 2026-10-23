# Traspaso · Importación al canónico (estado al 25/09/2026, fin de sesión)

Para el agente que continúe. Todo lo que hay aquí está **medido**, no supuesto; lo que no se ha medido se dice
como tal. El encargo vigente:

> Importar al canónico TODOS los datos recolectados de TODAS las federaciones y temporadas, para que ninguna
> consulta (informes de equipo, cruces entre temporadas, trayectorias de jugadores) se apoye en una base
> incompleta sin saberlo. Medido: cuántos grupos hay en cada cola, cuántos se importan, cuáles fallan y por
> qué, y una herramienta repetible para volver a hacerlo cuando lleguen datos nuevos.

## 1 · Qué es el proyecto, en cinco líneas

Plataforma privada de fútbol federado. 19 federaciones españolas se recolectan con `scripts/recolector-local.mjs`
(cada una con su cola SQLite en `descargas-<federacion>/recolector-local/cola-v2.sqlite`; Castilla y León vive en
`descargas-federacion/`). El recolector **archiva el HTML y el JSON de cada acta** y guarda rutas y hashes en
SQLite. Un importador (`packages/canonico`) lleva eso a PostgreSQL canónico (contenedor `facylf-postgres`,
127.0.0.1:5433). La web (`apps/web`) lee `core` con un rol de sólo lectura. `docs/informes/GUIA-INFORMES-EQUIPO.md`
es la guía de los informes y donde se documentan las reglas que salen de cada hallazgo.

## 2 · Estado medido (25/09/2026)

| | |
|---|---:|
| grupos que conocen las colas | 73.991 |
| grupos con datos recolectados | ~30.200 |
| de ésos, **dentro del canónico** | **29.626** (98 %) |
| grupos que la cola conoce y no tienen datos | ~44.800 (techo de recolección, no fallo) |
| partidos · actas · apariciones · personas en el canónico | 836.948 · 426.475 · 11.747.730 · 1.179.592 |
| actas `hecha` en las colas (importables) | 427.210 |
| actas pendientes dentro de alcance | 226.876 |
| plan del importador en régimen normal | ~380–800 grupos (crecimiento de la cola + tablas oficiales) |
| fallos por pasada | ~23, siempre las mismas familias (v. §4) |
| `pnpm test` / `pnpm lint` | 597 pasan + 1 saltada / limpio |

**Medido de nuevo el 26/09/2026** (`pnpm importar:estado` + `pnpm cola:archivos-que-faltan`): actas `hecha` en
las colas **430.891**; dentro del canónico **837.326 partidos · 427.967 actas · 11.794.783 apariciones ·
1.187.684 personas**. Y del lado de la tabla oficial, **14.954 grupos** en los que «la federación no la
archiva». La cola crece sola: estos números son de una fecha y hay que volver a tomarlos, no citarlos.

**Ritmos.** Importador en este PC: 26–125 grupos/min según tengan actas (medido: 3.073 grupos en 89 min, 2.433
en 34 min, 361 en 5,7 min). Recolectores: 180–300 s **entre peticiones por worker** (`ritmo.intervaloMinSeg` /
`ritmo.intervaloMaxSeg`), repartidos por turnos y cuotas de CPU (`scripts/servidor/`, `pnpm flota:reiniciar`).
El ritmo del servidor de ingesta se lee de su `historial.jsonl` con `node scripts/servidor/compara-ritmo.mjs` y
está resumido en `docs/plataforma-web/RITMO-MEDIDO.md` — **no se ha medido en esta sesión**.

## 3 · Las herramientas (todas probadas hoy)

| para qué | comando |
|---|---|
| importar lo recolectado (reanudable, con registro) | `pnpm importar:todo` |
| ver el plan por causa sin importar | `pnpm importar:todo --plan` |
| **el parte**: cola, canónico, pendientes, fallos por motivo | `pnpm importar:estado` (`--json`, `--federacion`) |
| medir, importar y comparar con el ciclo anterior | `pnpm ciclo:importar` (`--aplicar`) |
| recalcular el estado de la tabla oficial de cada grupo | `node --import tsx scripts/revisa-tabla-oficial.mts [--aplicar]` |
| qué clasificaciones archivadas no da ni una fila el lector | `pnpm importar:clasificaciones` (`--federacion`) |
| que un cambio del lector no pierda lo ya leído | `pnpm importar:compara-lectores` |
| mirar una clasificación archivada celda a celda | `pnpm importar:mira-clasificacion` (`--federacion`, `--grupo`) |
| actas descargadas que no están en el canónico | `pnpm importar:actas-sin-informe` |
| **¿falta algún fichero archivado en disco?** (acta a acta, por federación) | `pnpm cola:archivos-que-faltan` (`--federacion`, `--actas`, `--json`) |
| **¿por qué se rechaza cada tabla oficial?** (reparto por motivo y federación) | `pnpm cola:motivos-tabla-oficial` (`--json`) |
| qué publica de verdad un archivo de clasificación (crudo, sin interpretarlo) | `node scripts/_diag-forma-archivo-clasificacion.mjs <ruta>` |
| ¿el valor de una celda ofuscada SALE del archivo? (celda a celda, con el descifrador real) | `node scripts/_diag-clasificacion-ofuscada.mjs <ruta>` |
| qué decidió **no** recoger cada recolector | `pnpm cola:bitacora` |
| qué guarda cada cola, tabla por tabla | `pnpm cola:tablas` · `pnpm cola:mira --tabla eventos --donde "..."` |
| filas de calendario que su propio acta contradice | `pnpm cola:filas-desplazadas` (`--aplicar`) |
| el ciclo de Cataluña (reparar, retirar, reimportar) | `pnpm ciclo:cataluna` (`--aplicar`) |

Registro de la importación: `pruebas/reconstruccion/importacion-todo.jsonl` (una línea por grupo y pasada) y
`pruebas/reconstruccion/estado-importacion.json` (el parte). Migraciones de esta sesión: **0019** (estado de la
tabla oficial en la cobertura), **0020** (seis estados), **0021** (`tabla_oficial_archivo_en`, la fecha del
archivo con el que se decidió). Nunca se edita una migración aplicada: se añade otra.

## 4 · Los problemas que quedan y cómo se arreglan

### 4.1 · ¿Falta algún fichero en disco? — **MEDIDO el 26/09/2026: cero casos irrecoverables**

La pregunta ya tiene número. Herramienta: `pnpm cola:archivos-que-faltan`
(`scripts/mide-archivos-que-faltan.mjs`), hermana de `mide-actas-sin-informe.mjs`: recorre las 19 colas y
comprueba, acta a acta, el fichero archivado con la MISMA regla de rutas que `leeArchivo` (la ruta guardada o
esa misma con `.gz` detrás).

Medido sobre **430.891 actas `hecha`**:

| | |
|---|---:|
| con su fichero donde la cola dice | 407.361 (94,54 %) |
| `hecha` sin ruta de archivo (nada que comprobar) | 26 |
| **fichero archivado que no está** | **23.504 (5,45 %)** |
| · de ésas, ya están en el canónico (el dato vive en PostgreSQL) | 22.932 |
| · de ésas, el análisis y las tablas estructuradas viven en la cola | 572 |
| · **sin fichero, sin datos en la cola y sin informe: irrecoverables** | **0** |

Por federación: **valencia 15.803** (toda la 2025-26, 269 grupos), **madrid 6.728** (2019-20 y 2020-21, 116
grupos), **cataluna 973** (2026-27, 89 grupos, casi todas de J1). Ninguna otra federación tiene un solo fichero
en falta.

**Qué significa, sin adornos.** No hay ninguna acta cuyo contenido exista en ningún sitio: cero
irrecoverables. Lo que sí se ha perdido en esas 23.504 es la **evidencia de ingesta** —el fichero archivado—, y
eso es real: esas actas ya no se podrán volver a analizar con un parser mejor desde el archivo. Volver a
pedirlas es **restaurar evidencia, no rescatar datos**: no bloquea ninguna importación y se hace al ritmo de la
flota cuando haya hueco (§4.4).

Cinco comprobaciones sostienen el número, porque **el primer intento dio 24.524 y era falso**:

1. los ficheros de esas actas **no están en ninguna parte del árbol de su federación**, buscados por nombre en
   todo `descargas-<federación>` (recorridos 54.826 + 41.159 + 20.614 ficheros; encontrados: 0 de 15.803 +
   6.728 + 909 códigos distintos);
2. **no es que nunca se escribieran**: la tabla `archivos` de la propia cola los registra escritos (p. ej.
   valencia `acta-26434600`: `tipo=acta`, 1.911 B, `guardado_en=2026-09-22T10:28:37Z`), así que se escribieron y
   después desaparecieron del disco. Es un hecho del entorno, no un fallo del recolector;
3. los 225 avisos `reparacion_parser` de Asturias siguen siendo un **falso positivo histórico** (el fichero
   está como `.html.gz` y `readFileSync` sobre la ruta guardada es el error que los produjo): en Asturias, de
   24.787 actas `hecha`, **16.199 llevan la ruta plana en la cola y el fichero sólo como `.gz`** — eso es lo
   normal, no una pérdida, y por eso se lee siempre con `leeArchivo`;
4. el `.gz` salva el caso en **356.138 actas** del conjunto: mirar sólo la ruta guardada habría dado cientos de
   miles de pérdidas falsas;
5. y las rutas guardadas por los recolectores de Valencia, Madrid, Cataluña y la prueba de 10 GB son las del
   **contenedor** (`/app/descargas-…`, v. `docker/compose.yml`), no las de este disco: 24.524 actas las traían
   así, y sin traducir el prefijo la herramienta se inventa la pérdida (lo hace, y lo cuenta en el parte).

⚠️ **Y CÓMO SE SIGUE EL PROGRESO, porque el número engaña.** Después de devolver 973 actas de Cataluña, la
auditoría de esa federación marca **0 ficheros en falta** — pero NO porque se hayan recuperado: la auditoría sólo
mira las actas `hecha`, y las devueltas están `pendiente`. Lo que hay que mirar es **cuántas `hecha` hay**: eran
13.741, bajaron a 12.768 al devolverlas, y a la hora de escribir esto iban **12.771**, o sea que **el
recolector ya había vuelto a bajar y analizar 3** — a su ritmo, sin que nadie lo acelere. Cuando ese número
vuelva a 13.741, la recuperación de Cataluña está terminada.

El detalle acta a acta —con su grupo, sus bytes de `datos`, sus filas estructuradas y su URL de petición— queda
en `pruebas/reconstruccion/archivos-que-faltan.json`. **Lo primero que hay que hacer si se retoma esto es
volver a ejecutar la herramienta, no leer este resumen**: la flota sigue recolectando y el número cambia.

⚠️ **`scripts/_diag-integridad-archivos.mjs` sigue teniendo el fallo del prefijo del contenedor** (no se pudo
editar en la sesión del 26/09/2026; se intentó y no se logró). Da **27.461 «perdidas de verdad»** que no lo son,
porque compara contra `/app/…`. **No lo uses para decidir si falta algo: usa `pnpm cola:archivos-que-faltan`,
que sí traduce el prefijo y además cuenta cuántas rutas tradujo.**

### 4.2 · El resolutor de equipos de la tabla oficial — **ARREGLADO, PROBADO Y MEDIDO el 26/09/2026**

**El premio, medido antes de tocar nada** (`pnpm cola:motivos-tabla-oficial`,
`scripts/mide-motivos-tabla-oficial.mjs`, que lee `ops.normalizacion_error` con el rol de migración porque el de
lectura no ve esa tabla):

| motivo del rechazo | grupos |
|---|---:|
| **la tabla trae equipos que no se pueden resolver dentro de su propio grupo** | **1.358** |
| la fuente publica tabla pero el canónico no tiene jornada completa de corte (`sin_corte`) | 947 |
| R1: la posición publicada no es coherente | 373 |
| R5: todas las filas traen 0 puntos aunque haya victorias y empates | 134 |
| el HTML/archivo trae tabla y el lector no saca filas | 155 |
| dos filas apuntan al mismo equipo · R4 · R7 (federación publicando mal) | 67 |

Reparto de los 1.358 (avisos, no grupos): madrid 1.222, valencia 868, aragon 746, cataluna 443, castilla-leon
377, navarra 286, andalucia 189, murcia 162, asturias 89, castilla-la-mancha 70, euskadi 58, extremadura 41,
cantabria 30, ceuta 12, baleares 2. Los demás motivos **no los arregla nadie desde aquí**: es la federación la
que publica mal.

**La premisa, comprobada en las dos maquetas** (no supuesta): el JSON de Madrid trae `equipoCodigo` en 16 de 16
filas del grupo 24897956, y el HTML de Aragón (grupo 5199185) lleva `codequipo=` en el enlace de cada equipo.
Herramienta: `node scripts/_diag-forma-archivo-clasificacion.mjs <ruta del archivo>`, que mira el archivo crudo
sin interpretarlo.

**Qué se hizo** (`packages/canonico`):

- `importaClasificacionOficial` (`clasificacion-oficial.ts`) acepta un `resuelvePorCodigoPublicado` que se llama
  **sólo** cuando fallan las tres vías de `resuelveEquipoOficial` y la fila publica código. Sin código, nada
  cambia: la prueba 16 (la tabla se descarta) sigue pasando tal cual.
- `lote.ts` implementa ese gancho con `resuelveEquipo` —**el mismo camino que el calendario**—, así que la
  inscripción se busca o se crea por (club, temporada, nombre) e (equipo-temporada, grupo), con la procedencia
  `clasificacion` declarada, y entra en el catálogo del grupo para las filas siguientes.
- **El bloque de descanso se aparta**: la fuente da de alta un pseudo-equipo «DESCANSA» **con su propio código**
  (Aragón, grupo 5199185: `codequipo=5199186`) y con el resolutor por código se habría creado la inscripción
  fantasma que `retirada.ts` ya tuvo que limpiar. Se filtra con `esFilaDeDescanso` (exportada de
  `origen/cola.ts`: una sola definición de «es descanso», la que declara cada maqueta en `@facylf/ingesta`), se
  cuenta y se declara en el aviso.
- El aviso `clasificacion_oficial_importada` ahora lleva `resueltas_por_codigo_publicado` y `filas_de_descanso`,
  y hay un aviso nuevo `clasificacion_oficial_solo_descansos` para el caso de que la tabla archivada sólo traiga
  el descanso.

**Verificación hecha:** `pnpm --filter @facylf/canonico exec tsc --noEmit` limpio y la prueba nueva
**16 bis** en `packages/canonico/test/lote.test.ts` (dos equipos inscritos que no han jugado + una fila
«DESCANSA»): con el gancho puesto entran los dos equipos por su código, con el gancho quitado la prueba FALLA
(se comprobó), que es lo que la hace valer.

**La pasada real, hecha el 26/09/2026** (`pnpm importar:todo`, 1.226 grupos, **1.030 dentro · 196 fallidos ·
12,5 minutos**): el canónico pasó a 841.042 partidos y 429.240 actas. Y el resultado del arreglo, medido y sin
adornos —`node scripts/mide-motivos-tabla-oficial.mjs`, contador nuevo del aviso de importación—:

```
RESOLUTOR POR EL CÓDIGO QUE PUBLICA LA TABLA:
  4 importación(es) lo USARON (de 148 desde que existe el contador) · 4 grupo(s)
  6 fila(s) resueltas por código · 1 fila(s) de descanso apartadas
```

| estado de la tabla oficial | antes | después |
|---|---:|---:|
| `importada` | 6.055 | 6.072 |
| `rechazada` | 1.894 | **1.784** |
| **`sin_corte`** | **702** | **1.404** |
| `sin_archivar` | 14.954 | 14.870 |
| `sin_filas` · `ilegible` | 3.785 · 1.380 | 3.785 · 1.380 |

**Lo que esto dice, y es lo importante:** el arreglo del resolutor **funciona** (4 grupos lo usaron, 6 filas
resueltas por código, y el descanso se apartó una vez) pero **NO era el que más datos desbloquea**, que es lo
que suponía este documento. Grupos que antes morían en el resolutor de equipos ahora pasan de ahí y mueren más
adelante: **`sin_corte` se ha DOBLADO, de 702 a 1.404 grupos**. El bloqueo dominante de la tabla oficial no es
resolver los equipos, es que **no hay ninguna jornada COMPLETA a la que colgar la foto** — y eso es una decisión,
no un arreglo: el código se niega a colgarla de una jornada cualquiera «en vez de hacer pasar por la tabla de
J30 la foto de otro día», y esa negativa está razonada en `importarClasificacionOficial`.

**Lo que queda de este apartado, y ahora se sabe cuál es el grande:** decidir la política de `sin_corte`
(¿se admite la última jornada existente, declarando de qué jornada es la foto? ¿se guarda la tabla sin jornada de
corte, como foto suelta de la temporada?). Son **1.404 grupos**, tres veces más que el resolutor. Eso lo decide
una persona: no se toca por iniciativa propia. Y los 196 fallidos de la pasada son de Cataluña (186), todos de la
familia «partidos 8≠240» —el destino guarda el calendario viejo e inventado mientras la cola reparada da 8—, que
se arregla retirando lo inventado con `pnpm ciclo:cataluna`; **no los introduce el resolutor** (no toca partidos,
técnicos ni árbitros).

**✅ `sin_corte`: DECIDIDO Y HECHO el 27/09/2026 (opción A, migración 0022).** Con el usuario delante se eligió
anclar la tabla a la **última jornada que exista** del grupo —aunque no esté completa— en vez de no escribirla, y
**declarar la salvedad donde la ve el rol de lectura**. Qué cambió:

- `infra/migraciones/0022-corte-completo-de-la-tabla-oficial.sql` (aplicada): columna
  `ops.coverage_checkpoint.tabla_oficial_corte_completo` — `true` = corte sobre jornada completa (foto
  verificada) · `false` = anclada a la última jornada, sin confirmar · `null` = no hay tabla. El estado
  `sin_corte` NO desaparece: sigue siendo lo correcto para un grupo sin ninguna jornada;
- `packages/canonico/src/lote.ts`: el corte es `clasificacion?.matchdayId ??` la última jornada del grupo, y se
  pasa `corteCompleto`. `clasificacion-oficial.ts`: lo acepta, lo mete en el aviso de importación y registra
  `clasificacion_oficial_anclada_a_jornada_incompleta`, que es la clase de cosa que dentro de tres meses nadie
  recuerda haber decidido;
- prueba **16 ter** en `packages/canonico/test/lote.test.ts`, y **verificada al revés**: falla sin el cambio
  (`undefined`: la tabla se descartaba). 29 de 29 en el fichero, `pnpm lint` limpio.

**✅ RESULTADO MEDIDO (27/09/2026).** Con el recalculo de veredictos y la reimportación (plan de 2.954 grupos:
**2.732 dentro · 222 fallidos · 51,7 min**), el estado de la tabla oficial queda:

| | antes de la política | después |
|---|---:|---:|
| **`importada` (dentro, consultable)** | 7.669 | **10.052** |
| **ancladas a jornada SIN confirmar** (`sin_corte`, opción A) | 0 | **2.225** |
| corte sobre jornada COMPLETA (foto verificada) | — | 315 |
| `rechazada` · `ilegible` | 715 · 57 | 719 · 57 |

Y el canónico: **872.668 partidos · 432.401 actas · 11.896.229 apariciones · 1.202.266 personas**. Los 222
fallidos son de Cataluña (209) y son la familia «partidos 8≠240» —el destino guarda el calendario viejo—, que es
exactamente lo que arregla el ciclo de Cataluña.

**La política de `sin_corte` es, con diferencia, el mayor desbloqueo de toda esta tarea:** 2.225 grupos que antes
se quedaban sin su tabla oficial por no tener una jornada completa. Compárese con el resolutor por `codequipo`
(4 grupos en su primera pasada) o con el lector de Galicia y Ríoja (1.330 clasificaciones legibles): ninguno se
acerca. El motivo es que el corte afectaba a temporadas enteras —2026-27 recién empezadas y calendarios a
medias—, no a casos sueltos.

Para verlo en cualquier momento: `pnpm cola:motivos-tabla-oficial` enseña el reparto por jornada de corte, y
`pnpm importar:estado` el total de tablas dentro.

**Y salió un arreglo de fondo que no se buscaba.** La fila de cobertura se crea al FINAL del lote, así que el
`update` que escribe el estado de la tabla oficial **no encontraba fila en la primera importación de un grupo**:
el veredicto se quedaba en NULL hasta reimportar o pasar `revisa-tabla-oficial.mts`. Eso explica los **177 grupos
«sin calcular»** y por qué existía esa herramienta para rellenarlos a posteriori. Ahora es un
`insert … on conflict`: el veredicto se guarda la primera vez que se decide. El upsert de cobertura del final no
nombra esas columnas, así que el valor no se pisa.

**✅ PASADA CERRADA el 26/09/2026 — y es la medida del arreglo del lector.** Se aplicó
`revisa-tabla-oficial.mts --aplicar` (29.451 grupos anotados; **4.045 con veredicto viejo y archivo que hoy se
lee** → se les quitó la fecha para que el plan los volviera a mirar) y se lanzó `pnpm importar:todo` con un plan
de **4.383 grupos**: **4.183 dentro · 200 fallidos · 65,5 minutos**. Los fallidos son de Cataluña (190) y son la
familia «partidos 8≠240» de siempre —el destino guarda el calendario viejo e inventado—, que arregla
`pnpm ciclo:cataluna` retirando lo inventado.

| estado de la tabla oficial | antes | después |
|---|---:|---:|
| **`importada` (dentro, consultable)** | 6.076 | **7.669** |
| **`ilegible` para el lector** | 1.380 | **57** |
| **`rechazada`** | 1.841 | **715** |
| archivada y sin importar | 177 | 209 |
| sin filas · la federación no la archiva | 3.888 · 14.862 | 3.887 · 14.871 |

Y el canónico queda en **846.663 partidos · 429.697 actas · 11.838.542 apariciones · 1.192.960 personas**.
Lo que hizo esto, por partes: el **lector** de Galicia y Ríoja (1.330 clasificaciones más legibles), el
**resolutor por código** (pequeño pero real: 4 grupos), el **descanso apartado** y, sobre todo, haber
**recalculado los veredictos viejos**: sin ese paso, 4.045 grupos con archivo legible se habrían quedado fuera
para siempre, porque un veredicto es de un lector y nadie lo había vuelto a mirar.

Salida: `pruebas/reconstruccion/_importacion-tras-lector.txt` y el registro en
`pruebas/reconstruccion/importacion-todo.jsonl`.

### 4.3 · La captura — **MEDIDO el 26/09/2026: en Galicia y Ríoja NO hay que volver a descargar**

El plan decía «cambiar el recolector para archivar el DOM ya pintado, en Galicia, Ríoja y Cataluña (1.380 + 676
grupos)». **Antes de tocar el recolector miré un archivo de verdad, y en Galicia y Ríoja la premisa es falsa: los
valores SÍ están en el archivo archivado.** Lo que no los ve es el lector.

La prueba, sobre `descargas-galicia/recolector-local/t18-2022-23/comp-15035102/grupo-15578307/clasificacion.html.gz`
(herramienta nueva: `node scripts/_diag-clasificacion-ofuscada.mjs <ruta> [--filas 2]`, que descifra celda a celda
con el descifrador que YA existe):

- el lector de hoy mira el **texto** de la celda, y en las celdas ofuscadas el texto es
  `#idh337231:before{content:"2,8158"}` (el CSS, porque el `textContent` incluye el `<style>`) o
  `ntype("idh337233",4,0,"fa-6");…` (el script). Con eso, `enteroExacto` falla y la racha de números se corta
  justo detrás del equipo → cero filas;
- con `numeroOfuscadoHtml` (el descifrador del parser de actas, `packages/ingesta/src/parsers/ofuscacion.ts`)
  **salen las tres celdas ofuscadas de la fila probada: 3 descifradas, 0 sin descifrar**;
- y confirma lo que ya decía el comentario de ese descifrador: *«spans ocultos que suelen ser señuelos»*. En la
  fila probada el `<span style="display:none">13</span>` era el señuelo y el valor real es **18** (la clase
  `fa-1` de `ntype()` más el texto visible `8`). O sea: **el `13` que el traspaso citaba como prueba de que «el
  archivo no contiene la verdad» es precisamente el número que no hay que creerse.**

**Consecuencia para el plan:** el arreglo de Galicia y Ríoja es del **LECTOR**
(`packages/ingesta/src/parsers/clasificacion.ts`), no del recolector, y **no hay que volver a pedir ni una de esas
1.863 clasificaciones** — que a 180–300 s por petición y worker es tiempo de flota de días. La captura nueva sólo
se justifica donde el archivo de verdad no traiga el valor.

**CUIDADO al implementarlo, que es donde se puede escribir un dato falso:** el descifrador concatena dígitos, así
que la celda del coeficiente (`content:"2,8158"`) sale como `28158`. Esa columna NO es un entero y **no puede
entrar en la racha de números**: si entra, desplaza todas las columnas siguientes y los puntos acaban en el campo
de los partidos jugados. La regla que ya existe en `leeFilaConNumeros` para el «Pts/PJ» decimal —la celda se
cuenta como número pero NO se guarda y la racha sigue— es la que hay que aplicar aquí, y hay que añadir un
guardián que lo compruebe con una tabla real de Galicia antes de dar el lector por bueno.

**El mapa de columnas ya está resuelto, con aritmética y no con suposiciones** (26/09/2026). La tabla que
publica Galicia **no es el resumen: es el desglose casa/fuera**, y por eso el lector la descarta por diseño
(`clasificacion.ts:270`: la cabecera dice «Partidos Casa»/«Partidos Fuera») y luego no encuentra ningún resumen
que leer. Sus columnas, alineadas con la cabecera de dos filas de la propia página, son:

```
[Pts/PJ] [Pts] [Jc] [Gc] [Ec] [Pc] [Fc] [Cc] [Jf] [Gf] [Ef] [Pf] [Ff] [Cf]
```

Y los números descifrados de la fila de R.C. DEPORTIVO lo confirman solos: casa J=19 G=18 E=0 P=1 (suma 19 ✓),
fuera J=19 G=17 E=2 P=0 (suma 19 ✓), totales **J=38 G=35 E=2 P=1 → 107 puntos**, y la columna `Pts/PJ` publica
**2,8158 = 107/38 exacto**. Se repite en las filas siguientes: 97/38 = 2,5526 · 70/38 = 1,8421 · 69/38 = 1,8158
· 61/38 = 1,6. Es decir: el decimal es un COCIENTE (`Pts/PJ`), y por eso tratarlo como entero escribe basura;
y las celdas ofuscadas de verdad son las tres primeras de datos (`Pts/PJ`, `Jc`, `Gc`).

**Lo que hay que implementar, entonces** (es un cambio de lector, mediano, y hay que hacerlo con cuidado):

1. `valorDeCelda(celda, contexto)` en `packages/ingesta/src/parsers/clasificacion.ts`: si el texto de la celda ya
   es un entero, se devuelve tal cual (**cero riesgo para las demás federaciones**); si no y la celda trae
   ofuscación (`ntype(`, `:before`, `fa-\d`), se descifra con `numeroOfuscadoHtml` —el que ya existe— pasándole
   **la tabla numérica del `eval` de la página dentro de un `<script>`**: sin ella el descifrador tira de la
   clase, y el propio módulo avisa de que la clase puede ser el señuelo; metida como texto plano, en cambio, sus
   40 dígitos se concatenan con los de la celda (medido: salía `2,59e+44`).
2. **La celda del cociente NO puede entrar en la racha de números**: `content:"2,8158"` se devuelve como el
   decimal que publica (y la racha ya sabe saltarse un decimal sin cortarse, igual que el «Pts/PJ» de otras
   federaciones). Si entra como `28158`, desplaza todas las columnas y los puntos acaban en «jugados».
3. `totalesDelDesglose` tiene que reconocer **las dos formas** de desglose: la de 9 números
   (`puntos, casa(J,G,E,P), fuera(J,G,E,P)`) que ya lee, y la de 13 de Galicia/Ríoja
   (`Pts/PJ, Pts, casa(J,G,E,P,F,C), fuera(J,G,E,P,F,C)`).
4. Y, cuando la página **sólo** publica el desglose —que es este caso—, la clasificación se **reconstruye
   sumando casa + fuera** y tomando los **puntos PUBLICADOS** (no calculados). Eso no es inventar: es la suma de
   lo que la federación publica, y la coherencia se comprueba sola (`jugados = G+E+P` en cada mitad).
5. Prueba nueva en `packages/ingesta/test/clasificacion.test.ts` con un fragmento real de Galicia, y medición
   con `pnpm importar:clasificaciones --federacion galicia` y `--federacion rioja` (línea base: 25 y 187 dan
   filas; no dan filas 1.267 y 596).

**HECHO el 26/09/2026, y tres cosas sólo se vieron mirando el fichero de verdad:**

- **el descifrador necesita la tabla del `eval` de la página, y dada DENTRO de un `<script>`**: con la celda
  sola tira de la clase (el propio módulo avisa de que puede ser el señuelo) y con la tabla como texto plano sus
  dígitos se concatenan con los de la celda (medido: salía `2,59e+44`);
- **el decimal se devuelve tal cual, no sus dígitos**: `content:"2,8158"` como `28158` entraría en la racha de
  números y desplazaría todas las columnas —los puntos acabarían en «jugados»—;
- **y el valor puede venir partido**: cogiendo sólo el primer pseudo-elemento, la columna de ganados salía 3 en
  vez de 35 (la otra cifra era texto visible) y se perdían 11 de 20 equipos. Lo resuelve `numeroOfuscadoHtml`,
  que recorre el DOM y junta las piezas en orden; aquí estuve a punto de escribirlo a mano y habría escrito un
  dato falso.

**Y un guardián que hizo falta para no escribir otro**: un decimal delante de los números puede ser dos cosas.
En Galicia es `Pts/PJ` —una columna legítima que hay que saltarse—, pero en Murcia (grupo 24024914) el líder
publica sus PUNTOS con decimal (`4,25`): saltárselo lo dejaría con 0 puntos, que es un dato falso y no una
ausencia. Los distingue la aritmética de la propia fuente —el cociente tiene que valer `Pts/J` (107/38 =
2,8158)— y si no cuadra no se sintetiza nada: la tabla se queda sin leer, como estaba.

**Resultado medido:** Galicia pasa de 25 a **1.027** clasificaciones legibles (de 1.292) y Ríoja de 187 a
**515** (de 783), con **cero pérdidas** en el resto de federaciones (`pnpm importar:compara-lectores`: «el lector
nuevo LEE donde el viejo no: 2.712 · NO LEE donde el viejo sí: 0»). En los dos ficheros de referencia el lector
saca **20 filas y las 20 cuadran** (`jugados = ganados + empatados + perdidos`), que es la prueba más fuerte que
se puede pedir a una tabla de 38 jornadas.

**Cataluña NO pide captura nueva, y esto se midió el 26/09/2026 antes de tocar el recolector.** Su caso no es
el que decía este documento. Cataluña archiva **las dos cosas**: el `clasificacion.html` crudo de la FCF y un
`clasificacion.json`. El HTML es el que no da filas (1.551 de 1.551 con el lector PNFG) **pero da igual**: el
lector del importador usa el JSON, y el JSON está bien. Comprobado fichero a fichero:

- `cataluna t21 c54322932 g54322933/clasificacion.json`: 16 filas, posiciones 1..16, y el grupo está
  **importado** con sus 16 filas oficiales dentro (`fuente=json`). No hay nada que arreglar;
- `cataluna t21 c57984880 g57984888/clasificacion.json`: 4 filas, `6 = 6+0+0` jugados, 18 puntos = 6 victorias.
  El JSON también es correcto.

Lo que bloquea a los grupos catalanes **rechazados** es otra cosa: su **calendario está casi vacío**. Medido en
57984888 y 57943883: el canónico tiene **2 inscripciones y 1 partido**, y la tabla publica 4 equipos, así que
«4 de 4 sin resolver» —el catálogo se monta con los equipos que han jugado—. En la cola de 57984888 hay **una
sola fila de `partidos`**, y sus nombres vienen **del acta, sin la letra de equipo** («GURB, U.E.»,
«CALLDETENES, C.F.») mientras la tabla oficial la publica con ella («GURB, U.E. B», «CALLDETENES, C.F. A»). Es
la vía del club de `resuelveEquipoOficial` la que tiene que salvar esa diferencia, y como el aviso de rechazo es
**anterior** a que el partido entrara, puede que ya esté resuelta: hay que reimportar esos grupos y volver a
mirar antes de dar por hecho que fallan.

**Conclusión del punto (3) entero:** el recolector **no se toca**. De los tres casos que este documento mandaba
arreglar archivando el DOM pintado, dos (Galicia y Ríoja) eran del LECTOR y están arreglados, y el tercero
(Cataluña) no es de captura sino de calendario recogido a medias. Cambiar el recolector habría costado días de
flota y no habría arreglado ninguno de los tres.

**La línea base, medida el 26/09/2026** con `pnpm importar:clasificaciones` (el lector del importador, el de
verdad): **11.787 clasificaciones HTML archivadas · 5.977 dan filas · 5.810 no dan ni una**. Por federación, las
que no dan ninguna: cataluna 1.532 (de 1.532), **galicia 1.267** (de 1.292), euskadi 624, **rioja 596** (de 783),
andalucia 477, aragon 252, extremadura 215, baleares 136, castilla-la-mancha 129, castilla-leon 111, navarra 105,
asturias 92, murcia 90, cantabria 77, ceuta 45, canarias 34, melilla 28. (Madrid y Valencia no archivan HTML:
sólo JSON, y ahí hay 585 y 769 con el JSON «malo».) Guardado en
`pruebas/reconstruccion/_clasificaciones-antes-del-lector.txt`.

O sea: el plan hablaba de «1.380 + 676» y el agujero real, con el lector de hoy, es de **5.810**. De ésas, las
1.863 de Galicia y Ríoja tienen el valor en el fichero y se recuperan enseñando al lector a descifrarlo. Las
demás habrá que mirarlas una a una antes de decidir: algunas son páginas que legítimamente no traen tabla (la de
Galicia `t10-2014-15 c2338382 g2338407` es una **eliminatoria de ascenso a doble partido**, no una liga: ese
fichero no trae clasificación y descargarlo otra vez no cambiaría nada).

**El orden, entonces:** (1) enseñar al lector de HTML a descifrar la celda cuando su texto no es un número
—con el guardián del coeficiente— y volver a medir con `pnpm importar:clasificaciones --federacion galicia` y
`--federacion rioja`; (2) mirar un `clasificacion.json` de Cataluña antes de decidir si su caso pide captura
nueva; (3) sólo después, y sólo para lo que de verdad no esté en el archivo, cambiar el recolector.

### 4.4 · Volver a descargar lo que falte

**✅ EL CICLO DE CATALUÑA, EJECUTADO el 27/09/2026.** `pnpm ciclo:cataluna --aplicar`: **340 grupos importados ·
0 sin resumen** (de 708 reparables, 4.035 partidos de verdad). Y el efecto, medido con `pnpm importar:estado`:

| | antes | después |
|---|---:|---:|
| tablas oficiales dentro | 10.052 | **10.100** |
| `rechazada` | 719 | **996** |
| **partidos en el canónico** | 872.668 | **860.178** |
| actas · apariciones · personas | 432.401 · 11.896.229 · 1.202.266 | **434.071 · 11.905.695 · 1.213.588** |

**Los 12.490 partidos que BAJAN son una buena noticia y conviene entenderla:** es el calendario inventado que se
retira (el recolector viejo repetía una jornada en todas: 240 filas donde había 8 partidos reales), y a la vez
SUBN actas, apariciones y personas. Menos filas falsas, más contenido real. Que `rechazada` suba 277 también se
dice: tras reparar el calendario, esos grupos publican una tabla que el validador o el resolutor no aceptan, y
eso es un veredicto sobre su estado real, no un fallo del ciclo.

**Y una lección del propio ciclo, para no repetir la duda:** el simulacro decía «0 grupos a retirar» y parecía
que no haría nada. No era eso: el ciclo **repara primero y compara con su diario anterior**, así que en simulacro
todavía no hay reparaciones y la lista sale vacía (`ciclo-cataluna.mjs:135`). Aplicado, aparecieron los 340. Antes
de concluir «esta herramienta no hace nada», mira si su simulación mide algo que en simulación no puede existir.
Cada retirada queda en el diario y `pnpm importar --revertir <lote>` la deshace: no es irreversible.

**No hay prisa y no hay herramienta todavía, pero el mecanismo está identificado y tiene una trampa.**

Los 23.504 ficheros archivados que faltan (§4.1) se recuperan devolviendo el acta a la cola, que es lo que ya
hace `scripts/reparar-actas-html-perdido.mjs` para su incidente. Las tres sentencias que hacen falta, leídas de
ese fichero (líneas 105-110):

```sql
delete from archivos where ruta = ?;                                  -- la fila que miente
update actas set estado='pendiente', archivo=null, hash=null, ... ;  -- el acta vuelve a la cola
update trabajos set estado='pendiente', intentos=0, siguiente_intento=null, ... ;
```

**⚠ La trampa:** esa herramienta pone `datos=null` porque en SU incidente el análisis era basura. Aquí **no se
puede**: de las 23.504, hay **572 cuyo único sitio donde vive el análisis es `actas.datos`** (las otras 22.932 ya
están en el canónico). Borrarlo sería destruir la única copia del dato para «restaurar la evidencia». La
herramienta nueva (hermana, `pnpm cola:volver-a-pedir`, con la lista de
`pruebas/reconstruccion/archivos-que-faltan.json`, que ya trae acta, grupo y URL de petición) tiene que: **no
tocar `datos`**, empezar por esas 572, y ser simulacro por defecto (`--aplicar` para hacerlo).

**⚙ La herramienta existe y está PROBADA (26/09/2026): `pnpm cola:volver-a-pedir`**
(`scripts/cola-volver-a-pedir.mjs`). Es hermana de `reparar-actas-html-perdido.mjs`, con la misma mecánica y una
diferencia que importa: **no toca `datos`**. El simulacro lo confirmó y refuerza la decisión: **las 23.504 tienen
su análisis en la cola**, así que el `datos=null` de la herramienta hermana no habría destruido 572 análisis,
habría destruido **23.504**.

Probada de punta a punta con la porción más pequeña —`--federacion cataluna --aplicar`, **973 actas**— y
verificada después en la cola, no fiándose del informe: `estado=pendiente`, `archivo=NULL`, `hash=NULL`,
`version_parser=0`, `comprobada_en=NULL`, la incidencia anotada… y **`datos` con el análisis intacto**.

**✅ LA RECUPERACIÓN ESTÁ LANZADA Y YA NO ES UN PENDIENTE (27/09/2026).** Se devolvieron a la cola **las 23.504
actas** con el fichero archivado perdido: primero 973 de Cataluña (como prueba de punta a punta) y después las
**22.531** restantes —valencia 15.803 + madrid 6.728—, todas con su análisis conservado. Verificado en las colas,
no en el informe de la herramienta: en Madrid quedan `estado=pendiente`, `archivo=NULL` y **`datos` intacto**; en
Valencia (`acta-26434600`) ya está `hecha` otra vez con `comprobada_en` nuevo y `version_parser=4`, o sea que el
recolector la ha vuelto a bajar y analizar.

**⚠ Y CÓMO SE SIGUE EL PROGRESO, porque el número engaña.** Una vez devueltas, estas actas están `pendiente` y la
auditoría **ya no las ve** (sólo mira las `hecha`), así que `pnpm cola:archivos-que-faltan` dirá que faltan cero
aunque no se haya recuperado ninguna: es correcto y es engañoso a la vez. El marcador bueno es **cuántas actas
`hecha` hay** en cada federación, que tiene que volver a su nivel anterior:

| federación | `hecha` antes de devolverlas | hay que verlo volver a | medido el 27/09 |
|---|---:|---:|---:|
| cataluna | 13.741 | 13.741 | 13.118 |
| valencia | 54.346 | 54.346 | **38.624** (81 recuperadas ya) |
| madrid | 33.367 | 33.367 | sin medir todavía |

Las cifras de la última columna son medidas, no deducidas (la primera medición de Valencia dio 38.624 donde la
resta decía 38.543: las 81 de diferencia son actas que el recolector ya había vuelto a bajar). Se recuperan a
180-300 s por petición y worker, así que esto es cosa de **semanas**: no es un fallo que el número suba despacio.

**⚠ Y una trampa del instrumento que ya ha mordido una vez:** `archivos-que-faltan.json` es la ENTRADA de
`pnpm cola:volver-a-pedir`, así que **no se puede medir una sola federación con `--federacion` sin más**, o el
fichero se queda con esa federación y la recuperación se corta sola. Ya está arreglado en el código (con filtro
no sobreescribe), pero conviene saberlo: la lista completa se genera **sin** `--federacion`.

Nadie acelera los recolectores por esto: sólo se les devuelve trabajo y lo hacen a su paso.

Cataluña es donde más queda de recolección normal: `pnpm ciclo:cataluna --aplicar` (repara el calendario desde
las actas, retira lo inventado y reimporta) y su recolector sigue bajando actas.

### 4.5 · Fallos conocidos que se quedan como están (documentados, con motivo)

- **741 grupos de Cataluña** con calendario imposible: el recolector antiguo repetía una jornada en todas. Se
  saltan a propósito (`calendarios-imposibles.json`) y vuelven solos si la cola cambia.
- **8 grupos** con un acta que no casa con su fila de calendario; **2 de Madrid** con un equipo sin nombre
  publicado (código 17145319, 12 partidos, el nombre no está en ninguna parte del canónico).
- **3.355 actas `sin_datos`** (la federación publica la ficha vacía) y **863 `ausente_web`** (publicada y luego
  retirada).
- **26.777 grupos de categorías de menores** cuyas actas **no se recogen a propósito** (24.192 sin ninguna acta:
  64.521 partidos con resultado que nunca tendrán acta). Está en la bitácora del recolector, no en la tabla de
  actas: quien no lea la bitácora, no lo ve.
- **736 grupos** que la federación lista sin publicar jornadas: no hay nada que recolectar.
- **4.400 actas descargadas sin informe** en el canónico, y **0 sin explicación**: 4.373 las ve el plan, 26 son
  informes sin `archivo_ruta`, 1 es un duplicado con el mismo hash bajo otro código.

## 5 · Lo que se arregló en esta sesión (para no repetirlo)

1. **Plan del importador por causa**, no por resta: pendientes, crecidos (más actas / más partidos con resultado /
   más actas y resultados) y «vuelven sólo por su tabla oficial». Terminó dos bucles: 1.394 grupos que volvían en
   cada pasada y ~2.567 que no podían traer nada.
2. **Estado de la tabla oficial en la cobertura** (`ops.coverage_checkpoint.tabla_oficial_estado`: `importada`,
   `rechazada`, `sin_archivar`, `sin_filas`, `ilegible`, `sin_corte`) + `tabla_oficial_archivo_en` (la fecha del
   archivo con el que se decidió, para no volver a pedir lo mismo y para que un veredicto viejo caduque cuando el
   lector mejora). Un veredicto es de un LECTOR: al mejorar el lector, se borra la fecha y el grupo vuelve al plan.
3. **El lector de clasificaciones**: de 4.595 a **5.977** clasificaciones archivadas legibles, con **cero
   pérdidas** verificadas fichero a fichero (`pnpm importar:compara-lectores`). Se le enseñó: cabeceras en euskera
   («Ptak», «I», «B», «Zigorra») y Baleares («Descuento»); la columna de más «Pts/PJ» (antes `entero("4,2500")`
   escribía **425 puntos**); la pretemporada sin «últimos resultados»; y las tablas que no cuadran consigo mismas
   pero sí con su desglose casa/fuera. Ahora las celdas se buscan **por anclas** (el equipo es la celda con el
   enlace de código, los números son la racha que le sigue), no por índices fijos.
4. **`sin_filas` frente a `ilegible`**: hay archivos que no traen clasificación ninguna (sólo resultados). Se
   decide con `cuentaTablasDeClasificacion`, no con «¿tiene alguna `<table>`?».

## 6 · Invariantes que esta tarea rompe si se olvidan

- **Tres ausencias distintas**: no publicado · no recolectado · **no se recoge a propósito** (esto último sólo
  está en la bitácora del recolector).
- **Nunca escribir media tabla ni inventar valores**; los puntos publicados se guardan como se publican (con el
  ajuste registrado), y una tabla ilegible se trata como ausente, no como catástrofe.
- **`.gz`**: leer siempre con `leeArchivo`; nunca `readFileSync` sobre una ruta guardada.
- **Medir antes de optimizar y sospechar del instrumento**: en esta tarea, cuatro «hallazgos» resultaron ser
  instrumento (el guardián de abreviaturas que partía identidades, las señales de crecimiento con descansos y
  jornadas, los ENOENT de Asturias, y los 24.524 «ficheros que faltan» de la auditoría, que eran rutas de
  contenedor). Antes de escribir un número, mira un caso a mano: en §4.1 eso cambió la conclusión entera.
- **Las rutas de los recolectores en Docker son las del contenedor** (`/app/descargas-…`, v.
  `docker/compose.yml`): valencia, madrid, cataluna y prueba-10gb guardan esas. Cualquier herramienta que mire
  el disco tiene que traducir el prefijo —`rutaEnEsteDisco` en `scripts/mide-archivos-que-faltan.mjs`— o se
  inventa una pérdida de datos.
- **Antes de cambiar el recolector, mira el fichero con el lector delante.** En §4.3 el plan era volver a
  descargar 1.863 clasificaciones (días de flota) y resultó que el valor estaba en el archivo y lo que fallaba
  era el lector: `numeroOfuscadoHtml` ya sabía descifrarlo. Y al implementarlo, coger el primer
  pseudo-elemento CSS escribía **3 ganados donde la fuente publica 35** —el número viene partido— y sumar el
  desglose de una fila con los puntos en decimal escribía **0 puntos donde la fuente publica 4,25**. Las dos
  cosas se ven mirando un fichero de verdad y ninguna se ve leyendo código.
- **Un dato dudoso no se cambia por otro**: si no se puede comprobar de dónde sale un número, se deja la tabla
  sin leer (v. el guardián del cociente `Pts/PJ` en `clasificacion.ts`).
- **Al agregar, siempre por `team_entry_id`**; la identidad externa es federación + contexto; club ≠ equipo-temporada
  ≠ inscripción.
- **Roles**: `DATABASE_URL_LECTOR` (sólo lectura; no ve el esquema `source`, `ops.batch` ni
  `ops.normalizacion_error`), `DATABASE_URL_PUBLICADOR` (escribe; no puede `setval`), `DATABASE_URL_MIGRACION`
  (= `facylf_admin`, dueño).
- **Utillaje**: nada de `node -e` (escribir el script a un fichero); `pg` y `node:sqlite` se resuelven con
  `createRequire(join(RAIZ,'packages','canonico','package.json'))`; sin comillas invertidas dentro de literales
  que contengan SQL; nunca `*/` dentro de un comentario; `.ps1` en ASCII puro; no pasar UTF-8 por
  `Get-Content`/`Set-Content` de PowerShell.

## 7 · Primeros pasos sugeridos

1. Leer esto, `docs/informes/GUIA-INFORMES-EQUIPO.md` (§3.31–3.35, §5.1, §5.5) y la sección de clasificación
   oficial de `docs/plataforma-web/IMPORTADOR-SQLITE.md`.
2. Sacar la línea base: `pnpm importar:estado`, `pnpm importar:todo --plan`, `pnpm cola:bitacora`,
   `pnpm importar:actas-sin-informe`.
3. ~~Auditar los archivos que faltan~~ **HECHO el 26/09/2026 (§4.1): 23.504 ficheros archivados no están en
   disco y CERO son irrecoverables.** Queda sólo volver a pedirlos para restaurar la evidencia, sin prisa y al
   ritmo de la flota (§4.4). No es un bloqueo para nada de lo que sigue.
4. ~~Arreglar el resolutor de la tabla oficial~~ **HECHO el 26/09/2026 (§4.2): arreglado, con prueba, y la
   pasada real hecha.** Su efecto medido es pequeño (4 grupos, 6 filas) porque el bloqueo dominante de la tabla
   oficial es otro: **`sin_corte`, 1.404 grupos**, que es una DECISIÓN de producto y no la toma un agente solo.
5. ~~El lector de clasificaciones de Galicia y Ríoja~~ **HECHO el 26/09/2026 (§4.3): Galicia pasa de 25 a
   1.027 clasificaciones legibles y Ríoja de 187 a 515, con cero pérdidas en el resto.** El total sube de 5.977
   a **7.307** de 11.814 archivadas. **No ha hecho falta volver a descargar nada, NI cambiar el recolector:**
   Cataluña tampoco lo pide (§4.3), porque su `clasificacion.json` es correcto y lo que le falta es calendario.
6. **Decidir `sin_corte`** (§4.2) y, con la decisión tomada, importar esos 1.404 grupos. Es el mayor volumen de
   datos en juego de todo el documento, y lo decide una persona.
7. **Reimportar los grupos de Cataluña, Galicia y Ríoja** cuya tabla oficial está archivada y sin importar: el
   veredicto es de un LECTOR y de un catálogo, así que hay que borrar `tabla_oficial_archivo_en` de esos grupos
   para que vuelvan al plan (v. §5, punto 2), y después `pnpm importar:todo`. En Cataluña, además, el aviso de
   rechazo puede ser anterior a que el grupo tuviera partidos: reimportar y volver a mirar antes de dar por
   hecho que falla.

Si algo de esto no cuadra con lo que hay en el repositorio, manda lo medido: en este proyecto una medición nueva
vale más que un documento viejo.
