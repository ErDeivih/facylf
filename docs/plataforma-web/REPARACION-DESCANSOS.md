# Plan de reparación de las filas de descanso

Estado: 16 de septiembre de 2026. Diez federaciones afectadas, **5.680 filas medidas** en las colas.
Inventario reproducible en `pruebas/reconstruccion/informes/descansos.inventario.json` y `.md`
(`scripts/inventario-descansos.mjs`). Taxonomía y evidencia en
[RECONSTRUCCION-AMBIGUEDADES.md](RECONSTRUCCION-AMBIGUEDADES.md) y en el propio código de los adaptadores.

> **Lo vigente está en [REPARACION-DESCANSOS-ESTADO.md](REPARACION-DESCANSOS-ESTADO.md)**, actualizado el
> 17/09/2026: el lote de Euskadi ya está aplicado y verificado, se corrigió un defecto de **alineación** que
> el propio lote destapó (54 «ambiguas» que eran artefacto) y el lote canónico de `Atsedena` está preparado y
> sin aplicar. Las cifras de este documento son las del 16/09 y se conservan con su fecha: las colas las
> siguen escribiendo los workers, así que una cifra sin su hora no es comparable con otra.

## 1. Qué pasó, en una frase

En una liga de número impar de equipos cada jornada deja a uno descansando, la fuente publica ese bloque
**con la misma forma que un partido**, y el recolector lo guardó como partido: con su fila en `partidos`,
ocupando un `orden`, y —en Madrid y Valencia— dando de alta en `equipos` un pseudo-equipo llamado
`Descansa` con código negativo.

## 2. Las dos mitades del problema, que se reparan en sitios distintos

| mitad | dónde vive | estado |
|---|---|---|
| el recolector lo **seguía haciendo** | `scripts/recolector-valencia.mjs` y los extractores de `lib/recolector-local.mjs` | **corregido**, con pruebas |
| las filas que **ya están** en las colas | `partidos` (y `equipos` en iSquad) | **pendiente**, es este plan |

La corrección del recolector evita que el defecto crezca. No borra nada de lo ya recolectado, y por eso
hace falta un lote de reparación.

## 3. Qué hay que reparar, medido

```text
5.680 filas de descanso guardadas como partido, en 10 federaciones
  A  descanso informativo puro .......................   165
  B  descanso unido a un equipo real .................  4.729
  C  partido desplazado (probable) ...................    699
  D  duplicado de lectura ............................      4
  E  marcador de estado pegado al descanso ...........     83
  F  legítimo o no explicado .........................      0
```

Y, sobre la copia de Euskadi, lo que la reconstrucción ya informa:

```text
filas fantasma en la cola ...........................    551  (539 sin acta + 12 con acta que nombra el descanso)
bloques de descanso QUE TRAEN ACTA ..................     13  (no se pueden descartar sin abrirla)
partidos que el HTML publica y la cola no tiene .....      0
filas que comparten acta con otra de su jornada .....      0
```

**No hay ningún partido recuperable ni ningún duplicado en Euskadi**, y no hay ningún desplazamiento
demostrado en ninguna federación: los 699 casos de clase C son «probables» y ninguno tiene un partido del
HTML ausente en la cola.

## 4. El plan, por lotes reversibles y en este orden

El encargo fija el orden de extensión, y es el correcto: empezar por lo más pequeño y más seguro.

### Lote 0 · ensayo sobre copia, sin tocar ninguna cola real

1. `node scripts/copiar-cola.mjs --federacion euskadi --destino pruebas/reconstruccion/ciclo`
2. `--simular` y comprobar los recuentos contra este documento.
3. `--aplicar`, `--verificar`, revertir y **comprobar la huella lógica** con
   `node scripts/comparar-cola.mjs`. Ya está hecho y sale igual: 199 filas, reversión exacta.

### Lote 1 · un grupo pequeño con filas fantasma puras

Un grupo que hoy tenga **sólo** descansos sin acta y ningún otro cambio: el lote más pequeño que se puede
revertir sin discusión. Objetivo: validar la maquinaria de **retirada** antes de usarla en algo grande.

### Lote 2 · el grupo 23233962 de Euskadi

Es el grupo donde se descubrió el defecto (`SESTAO F.S. vs Atsedena`, `ARTAROMO IFO vs Atsedena`). Tiene
25 partidos y 23 actas, así que se puede comprobar entero a mano.

### Lote 3 · un caso de partido desplazado

Requiere que exista uno **demostrado**. Hoy no hay ninguno: los 699 son probables. Este lote **no se
ejecuta** hasta que un caso cumpla «la pareja no está en el HTML» o «falta en la cola un partido que el
HTML publica». No se repara por sospecha.

### Lote 4 · el grupo 11379752 de Castilla y León

Es el grupo de las siete fugas históricas y el que ya tiene una muestra de oro
(`pruebas/oro/castilla-leon/11379752.json`). Sirve de control: sus recuentos esperados están escritos a
mano y cualquier reparación que los mueva se ve.

### Lote 5 · extensión progresiva por federación

Una federación por lote, y **no** la corrección masiva de las diez en un solo lote, como pide el encargo.
Orden propuesto, de menor a mayor riesgo: murcia (2), aragon (17), cantabria (21), ceuta (36),
castilla-la-mancha (43), navarra (293), euskadi (549), la rioja (647), valencia (686), madrid (3.386).

## 5. Qué falta construir en la herramienta

### Hecho: la retirada de filas fantasma

`--aplicar <id> --retirar-fantasma` retira las fantasma **sin acta** de `partidos`, dentro de la misma
transacción que las correcciones de la jornada, y su reversión **vuelve a insertarlas enteras**. Es un
`delete`, no un `update`, y por eso el diario guarda la fila completa en `antes` y la reversión inserta:
un `update` sobre una fila que ya no existe afectaría a cero filas y la perdería en silencio.

Sin la bandera no se retira nada, y el informe lo dice en voz alta —que no se retiren no es que no
existan—. Una fantasma **con acta** no entra nunca: queda declarada. La coherencia del manifiesto lo
comprueba (`retiradas ⊆ fantasma sin acta`, y la huella guardada tiene que ser la de la fila guardada).

Medido sobre la copia de Euskadi: **539 filas retiradas en 537 jornadas** (34.358 → 33.819 partidos),
verificación **539/539**, reversión con **huella lógica idéntica** al estado anterior, y una segunda
aplicación que informa de **0 filas nuevas**.

El manifiesto pasó a **esquema 6** al añadir `retiradas`, después la evidencia desfasada y después el
veredicto del acta de cada fantasma más los partidos desplazados; el **contrato** va por 5, porque además de
campos cambió una REGLA (qué autoriza a borrar una fila). Un manifiesto de otro esquema se rechaza aunque
su huella cuadre, porque los campos que se leerían no serían ésos.

**La retirada va en la MISMA invocación que las correcciones** (`--aplicar <id> --retirar-fantasma`).
Aplicar primero sin la bandera y luego pedir la retirada sobre el mismo manifiesto **no** la completa: esas
jornadas ya están marcadas como hechas, y lo que hace la herramienta es negarse diciendo qué falta —un
manifiesto nuevo, simulado después del lote ya aplicado—. Antes decía «la fila fantasma ya retirada sigue en
la cola», que era falso: no se había retirado nunca. Está probado en `herramienta.test.ts`.

Después de la retirada, la simulación de Euskadi sobre la copia da
`idénticas 33.809 + correcciones 0 + ambiguas 10 + fantasma 0 = 33.819`: ya no queda ninguna fantasma que
retirar.

Quedan **13 bloques de descanso que traen acta** (p. ej. `DANOK BAT CLUB` vs `DESCANSA`): no se retiran
—el acta es justo lo que hay que abrir para decidir— y quedan declarados en el informe de cada lote.

### Hecho después: se abrió el acta, y con eso se cierran 12 de los 13

La regla era «¿trae acta? entonces no se retira», un criterio sobre la **existencia** del acta. El acta se
puede abrir —está en la cola, en la tabla `actas`— y lo que hay que mirar es lo que **dice**. Medido en las
18 colas, contando las filas que tienen un lado exactamente en el vocabulario de descanso:

| qué dice el acta | filas | decisión |
|---|---|---|
| no hay acta | 1.594 | **se retira** |
| el acta nombra el descanso en un lado | 12 | **se retira** (nuevo) |
| el acta nombra DOS equipos reales | 18 | **no se retira nunca**: ahí hubo partido |
| el acta no demuestra nada (sin pareja, vacía, sin fila) | 4.888 | no se retira y no se decide |

**El número se mueve, y hay que decirlo**: a las 12:00 eran 14 y a las 13:00 son 18, en el MISMO grupo y
con el mismo patrón. La cola la siguen escribiendo los workers, así que estas cifras son de un instante: se
publican con la hora y se vuelven a medir antes de decidir nada, igual que la evidencia desfasada.

El inventario trae además el desglose **por extractor y maqueta**, que es lo que permite atribuir un cambio
de vocabulario a las filas que produjo — y ahí se ve de dónde sale el defecto: `isquad` 4.072 filas (Madrid
y Valencia, todas con acta), `pnfg-clasica` 1.059, `fcf` 829 (Cataluña, todas con acta vacía) y
`nova-widget` 552 (Euskadi, las únicas con filas cuyo acta nombra el descanso).

Está en `pruebas/reconstruccion/informes/descansos-acta.json` y `.md`, que genera
`scripts/inventario-acta-descansos.mjs --todas` (sólo lee). Las 12 son de Euskadi y todas tienen el acta de
la propia federación para el hueco (`DANOK BAT CLUB / DESCANSA`, `ARENAS CLUB / DESCANSA`…). Ninguna de
Euskadi nombra dos equipos reales. Las **14** que sí lo nombran son de **Valencia**, y son otra cosa: un
**partido desplazado**.

**Dos trampas que costaron una medición falsa cada una, y las dos quedan escritas:**

1. las 4.892 «no demuestra» de Madrid, Valencia y Cataluña no tienen el acta sin descargar, la tienen con
   la pareja **vacía** (`{"local":"","visitante":""}`, estado `pendiente`). En JavaScript una cadena vacía
   es falsa y el veredicto sale `no-demuestra`, que es lo correcto; en SQL, `'' is not null` es **cierto**, y
   un cruce mal escrito contaba 111 y 150 filas «con dos equipos reales» que no existen. El cruce
   (`scripts/_diag-cruce-acta.mjs`) se corrigió y ahora coincide con el inventario fila a fila;
2. un primer recuento hecho a mano dio **5** desplazados en vez de 14. La causa era una cadena de `if`
   propia del diagnóstico, no el clasificador probado: por eso el inventario usa
   `veredictoDelActaDeDescanso`, la MISMA función que usa la herramienta.

Medido sobre la copia de Euskadi, el efecto exacto: fantasma **539 → 551** (`idénticas` 33.526 → 33.514) y
retirables **539 → 551**, con la partición cerrando igual: `33.514 + 194 + 10 + 551 = 34.269` más 89 filas
no comparables = 34.358.

### Los partidos desplazados de Valencia (14 medidos a las 12:00 · 18 a las 13:00)

Grupo `904325856`, competición `29509571`, temporada 21, **jornadas 1 a 14 y siguientes**. En cada una la
cola pone `Descansa` y el acta de esa misma fila (estado `hecha`) nombra a **`Canals Promeses C.F. 'A'`**
contra el equipo que sí está:

```text
J1 ord 0  · cola «Descansa vs C.D. L'Alcúdia de Crespins 'A'»   · acta «Canals Promeses C.F. 'A' / C.D. L'Alcúdia…»
J2 ord 1  · cola «Ciutat de Xàtiva C.F.B. 'C' vs Descansa»      · acta «Ciutat de Xàtiva C.F.B. 'C' / Canals…»
J3 ord 1  · cola «Descansa vs C.F.B. Castelló de La Ribera 'A'» · acta «Canals Promeses C.F. 'A' / C.F.B. Castelló…»
J4 ord 2  · cola «Ciutat d'Alzira F.B. 'A' vs Descansa»         · acta «Ciutat d'Alzira F.B. 'A' / Canals…»
J5 ord 2  · cola «Descansa vs Inter Xàtiva C.F.B. 'B'»          · acta «Canals Promeses C.F. 'A' / Inter Xàtiva…»
… hasta J14 ord 7 · cola «U.E. L'Alcúdia 'A' vs Descansa»       · acta «U.E. L'Alcúdia 'A' / Canals Promeses C.F. 'A'»
```

El patrón es siempre el mismo: **un equipo de la liga se quedó sin calendario y su hueco lo ocupa la
palabra del descanso**. En J7 el acta llega a decir `Canals Promeses C.F. 'A' / Canals Promeses C.F. 'A'`
(el equipo contra sí mismo), que es lo que pasa cuando la fuente publica la jornada de un equipo que ya no
tiene rival. No se retira ninguna —borrarlas perdería los partidos— y la reparación no es borrar sino
recuperar, así que necesita su propio lote.

`reconstruir-cola` lo informa (`filas_desplazadas`, con el equipo que falta y si esa pareja ya está en la
jornada), pero **hoy sólo en las federaciones con adaptador declarado**, y Valencia no lo tiene: por eso
los desplazados salen del inventario y del cruce sobre la cola real, no del manifiesto. Declarar el adaptador de las
federaciones isquad es el paso que falta para verlos dentro del lote.

Y una comprobación que conviene no perder de vista: **ninguna de las 4.892 filas cuyo acta no demuestra
nada se puede retirar**. Son Madrid (3.386), Cataluña (829), Valencia (672), Aragón (4) y Euskadi (1), con
el código de acta en la fila y el acta vacía: ahí no hay decisión posible sin abrirla de verdad.

### HECHO: el adaptador isquad (Madrid y Valencia), 17/09/2026

Lo que sigue era el plan; **ya está hecho y medido**. Se conserva escrito porque explica por qué el
adaptador no se podía copiar de las PNFG:

1. **declarar el adaptador** en `packages/ingesta/src/reconstruccion-cola/adaptadores.ts` (`madrid` y
   `valencia`, maqueta `isquad`) y su catálogo en `catalogo.ts`, con la misma forma que las PNFG;
2. **la evidencia para descartar** es distinta a la de las otras maquetas y por eso el adaptador no puede
   copiarse: en isquad el descanso se reconoce por **código de equipo negativo** (`filas-descanso-isquad.mjs`,
   `-1` en la mayoría de los casos, biyección 3.386/3.386 en Madrid y 686/686 en Valencia), no por el
   literal. Un adaptador que mirase el nombre en vez del código trataría como descanso una fila cuyo equipo
   se llame parecido;
3. **las pruebas que tienen que fallar sin el adaptador**: una fila de descanso de isquad se informa y no se
   retira si su acta está vacía; se retira sólo si no hay acta; y una con acta de dos equipos reales se
   informa como desplazada y **nunca** se retira;
4. **los lotes, en este orden**: (a) retirada de las 1.606 filas retirables de todas las colas —1.594 sin
   acta + 12 cuyo acta nombra el descanso—, por federación y reversibles una a una; (b) el lote de los
   desplazados, que **no es una retirada** sino una recuperación, y que necesita decidir el `orden` y
   comprobar que la pareja del acta no esté ya en la jornada; (c) las 4.888 sin acta legible quedan fuera
   hasta que la recolección traiga esas actas.

Resultado medido (17/09/2026): Madrid `idénticas 49.681 + 0 + ambiguas 52 + fantasma 3.386 = 53.119` y
Valencia `idénticas 30.291 + 0 + ambiguas 0 + fantasma 686 = 30.977`, con **retirables 0** en las dos —sus
4.072 bloques traen acta y ninguna demuestra que no hubiera partido— y **51 desplazados localizados** en
Valencia (grupos `904325856` y `904326881`). El detalle está en
[REPARACION-DESCANSOS-ESTADO.md](REPARACION-DESCANSOS-ESTADO.md).


### Pendiente: la inserción de partidos recuperados
`--insertar-recuperados` no existe todavía, y no es lo mismo que lo anterior:

- hay que decidir el `orden` de un partido que se inserta, y comprobar que no choca con el de otra fila;
- el diario necesita el tipo de cambio inverso al de la retirada (insertar → borrar al revertir);
- y sobre todo: **sólo se puede insertar lo que el HTML publique y la cola no tenga**. En Euskadi eso son
  **cero** filas, así que la maquinaria no se puede validar con datos reales todavía; se hará cuando
  aparezca un caso, con su prueba.

Las dos cosas respetan que la reconstrucción **no es la fuente del calendario**: sólo puede retirar lo que
el HTML demuestre que no es un partido, y sólo puede insertar lo que el HTML publique y la cola no tenga.

## 6. El lado canónico: medido el 17/09/2026

**Ya está medido**, con PostgreSQL vivo, y lo mide `scripts/_diag-alcance-canonico-descansos.mjs` (sólo
`select`). El resultado es mucho más pequeño de lo que se temía:

| qué | cuánto |
|---|---|
| inscripciones canónicas cuyo nombre en la fuente es exactamente una palabra de descanso | **1** (`core.team_entry` 5344, «Atsedena», euskadi 2025-26, c23233882 g23233962) |
| partidos que cuelgan de ella | **2** (`core.match` 30746 y 30747) |
| apariciones (`core.appearance`) | **0** |
| eventos (`core.match_event`) | **0** |
| fichas de cuerpo técnico (`core.match_staff`) | **0** |
| filas de clasificación (`core.standing_snapshot`) | **0** |
| resúmenes de equipo (`analytics.team_edition_summary`, `analytics.player_team_season_summary`) | **0** |

El pseudo-equipo no llegó a generar hechos: se quedó en la inscripción y en dos partidos. **El defecto no se
propagó al lado canónico**, y eso reduce la Fase 5 a un solo grupo.

El lote está preparado y **no aplicado**: `pruebas/reconstruccion/canonico/descansos-canonicos-31144c63afd93f2d.{json,md}`,
generado por `scripts/preparar-lote-canonico-descansos.mjs`, que lee con el rol `DATABASE_URL_LECTOR` y no
escribe ni una fila. El lote **no se apoya en una lista de dependientes escrita a mano**: recorre las claves
foráneas reales de `pg_constraint` desde la inscripción hacia abajo, así que si mañana aparece una tabla que
apunte a esos partidos, el cierre la trae sola. Cierre medido: `core.team_entry` 1 + `core.match` 2 +
`core.match_source` 2. Y el cuadre cierra por los dos lados: el canónico tiene **25** partidos en el grupo y
la cola **23** filas, y el lote retira **2** — exactamente la diferencia.

**Todavía no se puede aplicar, y se dice por qué**: el diario canónico (`ops.batch_cambio`, migración 0009)
sólo admite `accion in ('insert','update')`, y `revierteLote` sólo sabe borrar lo insertado o restaurar lo
actualizado. Un lote que **borre** filas necesita una migración que amplíe ese `check` y una rama en
`reversion.ts` que reinserte en orden inverso al de borrado; hasta entonces sería irreversible. El diario del
lote que las creó tampoco sirve: la inscripción la creó el lote **1492**, cuyo `ops.batch_cambio` ya no
existe —lo sustituyó el 1493, del mismo ámbito—, y el 1493 sólo tiene entradas de **actualización** de esa
fila.

**No se borra ningún equipo canónico a mano.** El pseudo-equipo no se elimina por SQL: se retira con un lote
reversible y su diario, o se retira de la publicación por la vía que ya existe (el grupo deja de ser
coherente y se invalida su publicación mientras lo sea).

### Reparación canónica, por lotes reversibles

Para cada grupo afectado, en este orden y con el diario del importador:

1. **recolector corregido** → la siguiente recolección de esa jornada ya escribe sólo los partidos reales;
2. **reconstrucción desde el HTML** → retira las filas fantasma de la cola (cuando exista el tipo de
   cambio del §5), con su manifiesto y su copia previa;
3. **reimportación idempotente** del grupo → el importador escribe los hechos correctos; la segunda pasada
   tiene que insertar **cero** filas;
4. **retirada de relaciones obsoletas** → apariciones y eventos del pseudo-equipo, por la vía que ya usa
   el importador para las reparaciones de pareja (`core.appearance` se indexa por
   `(match_id, team_entry_id, person_id, orden)`, así que cambiar el equipo **no pisa** la fila vieja: la
   duplica; hay que retirarla explícitamente);
5. **regeneración de la clasificación** → la tabla se reconstruye desde los partidos, y la oficial se
   coteja aparte como siempre;
6. **invalidación de publicación mientras el grupo sea incoherente** → un grupo a medias publica cobertura
   falsa, y eso es peor que no publicarlo.

## 7. Controles que tiene que cumplir cada lote

- manifiesto vigente y **hashes** del HTML y de las filas anteriores y posteriores;
- **ninguna** jornada con un trabajo `en_curso` del worker;
- copia previa por la **API de backup** de SQLite, no copiando el fichero;
- una transacción por jornada, y el diario sólo con lo ya confirmado;
- reversión exacta comprobada por **contenido lógico**, no por tamaño ni fecha;
- segunda pasada con **cero** cambios;
- ninguna fila retirada sin que el HTML demuestre que no es un partido;
- ninguna fila retirada **con acta** sin abrir antes esa acta: son los 13 casos declarados.

## 8. Lo que no se toca

- El HTML archivado y los JSON de origen: son la evidencia.
- Las 13 filas con acta quedan **declaradas**, no reparadas, hasta decidir si el recolector abre esas
  actas concretas.
- Los 699 casos de clase C no se reparan por sospecha.
- Ningún equipo canónico se borra a mano.
