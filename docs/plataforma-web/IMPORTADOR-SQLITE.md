# Importador: de la cola SQLite al canónico

Estado: contrato de implementación, 14 de septiembre de 2026. Prerrequisito del importador de la
fase 1 de [PLAN-DESARROLLO.md](PLAN-DESARROLLO.md).

Los vocabularios de este documento **no están deducidos del código del recolector**: están medidos
sobre la cola real de Canarias el 14/09/2026 (1.858 actas, 60.217 participaciones, 41.614 eventos).
Cualquier valor nuevo que aparezca en otra federación se añade aquí con su medición antes de que el
importador lo acepte; un valor desconocido **detiene el lote**, no se convierte en `otro`.

## 1. Esquema de origen

Las dieciocho colas comparten esquema (`scripts/lib/recolector-local.mjs`, `version_esquema = 4`).
Tablas relevantes: `temporadas`, `competiciones`, `grupos`, `jornadas`, `equipos`, `partidos`,
`actas`, `participaciones`, `eventos_acta`, `tecnicos_acta`, `personas`, `archivos`.

Sus claves primarias son compuestas y textuales
(`temporada, competicion, grupo, jornada, acta, …`). Esa tupla completa es el `context_key` de
`source.external_ref`; nunca se hace `JOIN` por una parte suelta de ella.

## 2. Vocabularios medidos

### `participaciones.condicion` → `core.appearance.condition`

| Origen | Canónico | Nota |
|---|---|---|
| `titulares` | `starter` | |
| `suplentes` | `substitute` | |
| `convocados` | `called_up_unknown` | no aparece en Canarias; sí en fuentes que no separan |

En Canarias el 100 % de las participaciones trae `jugador_codigo`. No se asume para el resto.

### `eventos_acta.tipo` → `core.match_event.event_type`

| Origen | `event_type` | `subtipo` |
|---|---|---|
| `gol` | `gol` | según `eventos_acta.subtipo` |
| `amarilla` | `tarjeta_amarilla` | — |
| `roja` | `tarjeta_roja` | — |
| `doble-amarilla` | `tarjeta_roja` | `doble_amarilla` |
| `entra` | `entra` | — |
| `sale` | `sale` | — |

`eventos_acta.subtipo`: `normal` → `normal`, `penalti` → `penalti`,
**`propia-puerta` → `propia_puerta`** (guion a guion bajo). `NULL` en todo lo que no es gol.

`lado_beneficiado` ya viene resuelto en origen y con el rival correcto en las propias puertas: se
copia, no se recalcula.

### `eventos_acta.sujeto_tipo` → `core.match_event.sujeto_tipo`

`jugador`, `tecnico`, `desconocido` se copian tal cual. Un evento `desconocido` **no se atribuye a
ninguna persona** (`person_id` nulo); la restricción `event_sujeto_resuelto_check` lo impide.

### `actas.estado` y `actas.calidad` → `core.match_report`

| `estado` | `calidad` | `match_report` |
|---|---|---|
| `hecha` | `correcta` | `quality = 'correct'` |
| `hecha` | `revisar` | `quality = 'review'` |
| `hecha` | `administrativa` | `quality = 'administrative'` |
| `ausente_web` | — | `quality = 'unavailable'` (se comprobó que la fuente no la ofrece) |
| `sin_datos` | — | `quality = 'partial'` (la fuente publica la ficha sin alineaciones ni cuerpo técnico) |
| `pendiente` | `NULL` | **no se crea fila**: es cobertura pendiente, no un acta no disponible |

`unavailable` se reserva para cuando se ha comprobado que la fuente no la ofrece. No se deduce de un
`pendiente`. En Canarias hay más actas `revisar` (1.024) que `correcta` (787): la calidad no es un
caso raro, es la mitad del catálogo, y la interfaz debe tratarla como normal.

`ausente_web` y `sin_datos` son estados posteriores a la primera redacción de este contrato: los
introdujo el recolector el 13-14/09/2026 para que una ficha que la fuente no publica (o publica
vacía) no bloqueara a su grupo para siempre. Medido al escribirlos aquí: `ausente_web` en 1.526
fichas (Asturias 1.475, Aragón 39, Ceuta 5, Canarias 7) y `sin_datos` en 405 (Navarra 327, Euskadi
83, Ceuta 3, Aragón 2, Cantabria 1, Rioja 1). Ni una ni otra crean `match_report.quality = 'correct'`:
son cobertura parcial o ausencia declarada, y la web debe enseñarlas como tales.

### `actas.incidencias`

Array JSON de cadenas, con parámetros pegados tras `:` —
`["sin_alineaciones", "descuadre_goles:1/0"]`. El importador las convierte a objetos
`{ "codigo": "descuadre_goles", "parametros": "1/0" }` en `core.match_report.incidencias`. Es una
transformación de forma, no una reinterpretación: el texto original se conserva íntegro en el campo
`parametros`.

El importador **añade** además incidencias propias cuando encuentra algo que la fuente no declara:
`EQUIPOS_ACTA_NO_CUADRA` y `EQUIPOS_ACTA_SIN_RESOLVER`. Son códigos estructurados con parámetros, no
texto libre, y se explican en «La pareja de equipos: el calendario manda en la programación, el acta en
quién jugó».

## 3. Reglas de mapeo que no son mecánicas

### Temporada

`temporadas.codigo` es un código interno de la federación (`21` = `2025-26` en Canarias) y **no es
comparable entre federaciones**. La temporada canónica se resuelve por `etiqueta`; el código va a
`source.external_ref`.

### Club y equipo

La cola sólo conoce `equipos(temporada, codigo, nombre)`, con nombres como `S.D. SAN JOSE "A"`. La
categoría **no está en el nombre**: viene de la competición en la que juega.

Regla, aplicable sólo a las fuentes PNFG y declarada como reversible:

1. `team_season.nombre` = el literal completo de la fuente;
2. `club.nombre_canonico` = ese literal sin el sufijo de letra entrecomillada final (`"A"`, `"B"`…),
   y **sin ninguna otra transformación**;
3. cada literal visto se guarda además como `team_alias`.

Nada más se infiere. Consolidar dos clubes con denominaciones distintas es una decisión curada, del
mismo tipo que unir dos personas, y no la hace el importador.

### Personas sin código

Técnicos y árbitros llegan como texto libre y sin código: 594 y 235 distintos en Canarias. Su
`person_source_identity` va con `codigo_externo` nulo y un `context_key` de formato fijo, que la
migración 0008 verifica y rechaza si está mal construido:

```text
rol=<rol normalizado>;temporada=<AAAA-AA>;ambito=<edicion|equipo>:<id>;nombre=<normalizado>
```

- árbitros → `ambito=edicion:<competition_edition_id>`;
- cuerpo técnico → `ambito=equipo:<team_season_id>`;
- `rol` y `nombre` se normalizan con `core.normaliza_nombre`; el literal se conserva en
  `core.match_staff.rol` y en `core.person_name`. Los roles de la fuente son texto libre con 17
  variantes sólo en Canarias (`DEL. Equipo`, `2ºEntrenador`, `FISIOTERAPEUTA / A.T.S.`…), así que
  normalizar es obligatorio;
- **nunca** `ambito=partido` ni `ambito=acta`: multiplica personas fantasma por tres o por diez.

Toda persona creada sin código lleva `core.person.identidad_nominal = true`. Ver
[ADR-0011](decisiones/0011-identidad-sin-codigo-federativo.md).

**Jugadores sin `jugador_codigo`** (medido: Cataluña 255.701 de 255.701 participaciones, Navarra
286.064 de 422.475, Extremadura 27.772 de 465.139, Castilla y León 17.596 de 644.336, Murcia 16.775,
Galicia 8.644, Baleares 7.962, Euskadi 5.718, Aragón 107). Se resuelven igual que el cuerpo técnico:
identidad **nominal** con `ambito=equipo:<team_entry_id>` y `rol=jugador`. Está prohibido inventarles
un código con el nombre (`nominal:<NOMBRE>`): eso no es un código, es un nombre, y une a todos los que
se llaman igual en toda la federación y en todas las temporadas. Lo mismo para el autor de un evento
sin código: si su equipo se puede resolver, se le da identidad nominal; si no, el evento se queda sin
persona, que es la verdad.

Que dos personas compartan nombre normalizado no las une automáticamente. El enlazado histórico
genera candidatos por nombre y pondera, en orden, provincia, club y equipo; una unión confirmada se
registra como `identity_decision`. Ante duda se conservan separadas: una fragmentación se puede
reparar, mientras una fusión falsa contamina perfiles, sanciones y rankings.

### Roles del cuerpo técnico

El rol llega como texto libre y **no son 17 variantes: son 130 literales distintos** en cinco lenguas,
medidos sobre las 18 colas:

| literal | filas | rol canónico |
|---|---|---|
| `Entrenador`, `ENTRENADOR`, `Entrenatzailea`, `ENTRENADOR TITULAR` | 364.943 | `entrenador` |
| `DEL. Equipo`, `delegado`, `DELEGAT EQUIP`, `Taldeko Delegatua`, `DELEGADO EQUIPO` | 325.686 | `delegado` |
| `DEL. Campo`, `delegado-campo`, `DELEGAT CAMP`, `Zelaiko Delegatua`, `DELEGADO DE CAMPO` | 158.806 | `delegado de campo` |
| `2ºEntrenador`, `2º`, `segundo-entrenador`, `2ºEntrenatzailea` | 91.394 | `segundo entrenador` |
| `ENCARGADO MATERIAL`, `ENC. MATERIAL`, `ENCARREGAT MATERIAL`, `ENCGDO. MATERIAL`, `ENCGDO. MATERIAL SALA` | 23.000+ | `encargado de material` |
| `A.T.S.`, `ATS o FTP`, `ATS / S.U.T.`, `FISIOTERAPEUTA`, `ats-o-fisioterapeuta` | 21.000+ | `fisioterapeuta` |
| `PREPARADOR FISICO`, `Preparador Físic`, `preparador-fisico`, `Prestatzaile Fisikoa` | 14.000+ | `preparador fisico` |
| `Especialista de Porteros`, `ENTRENADOR PORTEROS`, `ENTRENADOR PORTERS`, `ATEZAINEN ENTRENATZAILEA` | 3.100+ | `entrenador de porteros` |
| `Auxiliar`, `AU`, `AUXILIAR / LAGUNTZAILEA` | 9.800+ | `auxiliar` |
| `ayudante-sanitario`, `AYUDANTE TECNICO SANITARIO` | 4.200+ | `ayudante sanitario` |
| `ENTRENADOR AUXILIAR`, `entrenador-auxiliar` | 2.100+ | `entrenador auxiliar` |
| `ENTRENADOR EN PRACTICAS`, `Entrenador Prácticas`, `ENTRENADOR PRACTICAS SALA` | 1.400+ | `entrenador en practicas` |
| `Médico`, `MÉDICO / MEDIKUA`, `METGE` | 340+ | `medico` |
| `MONITOR`, `MONITOR SALA` | 350+ | `monitor` |
| `COORDINADOR/A`, `coordinador`, `COORDINADOR DEPORTIVO` | 60+ | `coordinador` |
| `Graduado en Enfermería`, `enfermero` | 5 | `enfermero` |
| `OFICIAL DIRECTIVO` | 3 | `oficial directivo` |

Reglas de la normalización (viven en `packages/canonico/src/resolucion/roles.ts`):

1. el literal se normaliza antes de comparar: minúsculas, sin tildes, sin signos (`2ºEntrenador` →
   `2 entrenador`, `A.T.S.` → `a t s`);
2. **lo específico se comprueba antes que lo general**: `ENTRENADOR PORTEROS` es de porteros y no
   `entrenador`; `ENTRENADOR AUXILIAR` es auxiliar; `AYUDANTE TECNICO SANITARIO` es ayudante sanitario
   y no cae en `ats`. Las dos primeras versiones de esta regla fallaban justo ahí: `2ºEntrenador`
   (76.509 filas) acababa como `entrenador`;
3. **el literal nunca se pierde**: se conserva íntegro en `core.match_staff.rol` y en
   `core.person_name`. La normalización sólo decide el `rol` del `context_key`;
4. un literal que no encaja en ninguna regla **no se convierte en `otro` ni se descarta**: pasa
   normalizado y el importador lo registra una vez por lote en `ops.normalizacion_error` con
   `codigo = 'rol_tecnico_sin_medir'`. Para medir qué falta y cuánto pesa:

```sql
select parametros->>'literal' as literal, count(*) as lotes
  from ops.normalizacion_error
 where codigo = 'rol_tecnico_sin_medir'
 group by 1 order by 2 desc;
```

Medido en el corpus actual, los que quedan sin regla son etiquetas opacas y rarísimas (`epr`, `M`,
`NO`, `ALTRES`): 915 filas de 1,8 millones.

### Ficha de cuerpo técnico: lo que el lote no confirma, no se queda

`core.match_staff` se indexa por `(partido, persona, rol)`. Si una reimportación resuelve la misma
ficha a otra persona —porque se ha corregido una regla de identidad, por ejemplo— la fila vieja no se
pisaba y quedaban **dos fichas donde la fuente trae una**. Medido en el grupo de Cataluña: 2.552 filas
de origen acabaron siendo 4.475 en el canónico. Ahora, al cerrar el lote, se retiran de SUS partidos
las fichas que el lote no ha confirmado (medido: 1.923 retiradas; el lote lo anota en
`ops.batch.validacion->>'staff_obsoleto_retirado'`).

Y la validación cuenta también **técnicos y árbitros**, no sólo partidos, actas, participaciones y
eventos: sin esas dos cuentas, el problema anterior pasaba con un «cuadran» tranquilizador.

### Clasificación: reconstruida ahora, oficial cuando se importe

`core.standing_snapshot` guarda las dos, y la columna `origen` (`oficial` | `reconstruida`) dice cuál es
cuál. El importador escribe **`reconstruida`**: la suma de los resultados del propio grupo.

- Las reglas de puntos y desempate **no se reinventan** aquí: viven en `packages/dominio`
  (`calculaClasificacion`), donde están probadas —victoria 3, empate 1, derrota 0; desempate por
  enfrentamiento directo sólo cuando los empatados ya se han enfrentado todos entre sí, después
  diferencia de goles, después goles a favor, y si sigue el empate se marca **sorteo pendiente** en vez
  de ordenar a dedo—.
- La tabla se calcula **hasta la última jornada completa**. Una tabla a mitad de jornada no es la tabla
  de ninguna jornada. Si la primera jornada ya está incompleta, no se escribe ninguna tabla.
- Si algún equipo de la tabla no se puede resolver a una inscripción del canónico, **no se escribe media
  tabla**: una clasificación a la que le falta un equipo está mal.
- Una corrección a la baja de los datos retira la tabla de jornadas posteriores que ya no se sostienen.
- **No incluye sanciones ni ajustes de la federación**, así que puede diferir de la oficial. Cuando se
  importe la oficial, se guardará con `origen = 'oficial'` y la web enseñará ésa.

Comprobación medida sobre el grupo completo de Tercera Federación (342 partidos, 19 equipos):

| invariante | valor |
|---|---|
| suma de partidos jugados | 684 = 2 × 342 ✓ |
| suma de puntos | 920 = 3 × 236 victorias + 2 × 106 empates ✓ |
| suma de goles a favor = suma de goles en contra | 813 = 813 ✓ |
| equipos cuyo `jugados` no cuadra con sus partidos reales | 0 |
| filas con `ganados + empatados + perdidos ≠ jugados` o `puntos ≠ 3·ganados + empatados` | 0 |

Ese grupo tiene equipos con 35, 36 y 37 partidos jugados → **y eso NO está bien**. La corrección llegó al
importar la clasificación oficial: con 19 equipos, cada uno juega 18 rivales dos veces = **36 partidos,
siempre**. La tabla oficial da 36 a los diecinueve. La reconstruida daba 35 a cinco equipos y 37 a otros
cinco. Comparado con la oficial: **7 de 19 equipos difieren**, y las diferencias son siempre en
victorias/derrotas (nunca en empates), compensándose entre sí (la suma de puntos, de partidos jugados y
de victorias coincide en las dos tablas: 684 partidos, 920 puntos, 236 victorias). Es decir: los
resultados existen, pero algunos estaban colgados del equipo que no es.

**Dónde estaba el error (corregido el 15/09/2026).** En la **fila de la cola**, no en la fuente: el HTML
archivado de las siete jornadas describe el calendario correcto y el extractor de la cola lo leyó mal.
La causa completa, el mecanismo y la regla que lo evita están en «La pareja de equipos: el calendario
manda en la programación, el acta en quién jugó», más abajo. Reparado el grupo, **los 19 equipos de la
tabla reconstruida coinciden con los de la oficial**: ya no difiere ninguno.

### Clasificación oficial: dos maquetas, dos lectores, ninguna excepción escondida

La tabla oficial se archiva de dos maneras según el portal, y **ninguna es un plan B de la otra**:

| federaciones | archivo | lector |
|---|---|---|
| las PNFG (Castilla y León, Asturias, Aragón, Canarias…) | `clasificacion.html[.gz]` | `parseaClasificacionHtml` de `@facylf/ingesta` |
| Cataluña (adaptador propio), **Madrid** y **Valencia** (iSquad) | `clasificacion.json` | `packages/canonico/src/clasificacion-oficial-json.ts` |

Medido el 15/09/2026: hay **1.595 `clasificacion.json`** (Cataluña 282, Madrid 656, Valencia 657) y
**Cataluña es la única federación donde coexisten los dos** (282 de 283 grupos). En esos 282, el parser
PNFG lee **0 filas** del HTML: la maqueta es otra. En Madrid y Valencia **no hay ningún
`clasificacion.html`**, así que el JSON es la única fuente posible de su tabla oficial.

Cuando las dos maquetas del mismo grupo producen filas, **se comparan**; si dicen cosas distintas, no
se elige ninguna y el lote se detiene. Y si el HTML da filas, manda el HTML: el JSON entra cuando el
HTML no las da.

#### Vocabulario medido del `clasificacion.json`

Diez claves, siempre las diez, siempre presentes, sin variantes: `posicion`, `equipoCodigo`, `equipo`,
`puntos`, `jugados`, `ganados`, `empatados`, `perdidos`, `ultimos`, `sancion`.

- `equipoCodigo`: `null` en 3.909 filas (toda Cataluña) y string **numérico** en 7.768 (Madrid y
  Valencia). Cuando hay código se usa, y se resuelve contra el catálogo del grupo.
- `ultimos`: array de `P|G|E`. **No se persiste**: no hay columna y no se convierte en nada.
- No hay goles a favor ni en contra: se guardan a 0 y la web no los enseña cuando el origen es
  `oficial`, igual que con la vista resumida PNFG.
- `sancion ≠ 0` en 38 filas y **`puntos` admite negativos** (7 filas medidas, todas con
  `puntos = 3·G + E − sanción`): un `check` de no negatividad habría rechazado datos legítimos.
- `puntos` por debajo de `3·G + E` en 212 filas, y **no todas son sanciones declaradas**: en el grupo
  54322935 la tabla publica 40 puntos donde el registro da 41 y `sancion` es 0. Se guarda el valor
  publicado y el ajuste queda registrado con `codigo = 'clasificacion_oficial_con_ajuste'`.

#### Reglas de integridad (medidas sobre las 11.677 filas, no supuestas)

| regla | qué exige | qué pasa de verdad en el corpus |
|---|---|---|
| R1 | `posicion` entero, ≥1, ≤ nº de filas, ≤ su índice+1 y no decreciente | 212 ficheros de la temporada en curso publican `posicion: 0` → rechazados |
| R2 | `equipo` no vacío y sin duplicados | 0 duplicados |
| R3 | `jugados = ganados + empatados + perdidos` | se cumple en las 11.677 filas |
| R4 | `puntos ≤ 3·ganados + empatados` | 1 fichero lo incumple → rechazado |
| R5 | no todas las filas con 0 puntos habiendo victorias o empates | 31 ficheros con la columna de puntos vacía → rechazados |
| R6 | puntos negativos sólo si `puntos = 3·G + E − sancion` con `sancion > 0` | los 7 negativos lo cumplen |
| R7 | los seis numéricos son enteros | 5 ficheros publican `puntos: 0.25` → rechazados: redondear sería inventar |

Resultado medido del validador: **768 ficheros pasan · 251 se rechazan · 576 son arrays vacíos** (la
fuente aún no publica tabla). Un fichero que no pasa **detiene el lote**: no se escribe media tabla.

#### Resolución del equipo publicado: tres vías, ninguna por parecido

1. **Código federativo**, cuando la fuente lo trae. Identidad fuerte dentro de su federación y ámbito.
2. **Literal exacto**, normalizado con el MISMO `core.normaliza_nombre` que usa la base.
3. **Nombre de club, sin la letra de equipo final**, y sólo si es inequívoco dentro del grupo.

La tercera parece un parecido y no lo es, y por eso está medida: en el grupo 54322933 la tabla publica
«ARGENTONA, C.F. A» donde el calendario dice «ARGENTONA, C.F. B», y **las 16 filas coinciden
exactamente** con la clasificación reconstruida —mismo registro y mismos puntos— bajo esa
correspondencia, que además es biyectiva (cada club aparece una sola vez en cada lado). En ese grupo
resuelven 7 filas por club, 9 por nombre y ninguna por código; en el 54322935, 6 por club y 10 por
nombre. Si un club tuviera DOS equipos en el mismo grupo, su nombre de club queda fuera del mapa y la
fila no se resuelve: entonces el lote se detiene, que es lo que pasó antes de corregir la
normalización.

#### Procedencia y qué queda anotado

Cada importación deja un registro en `ops.normalizacion_error` con
`codigo = 'clasificacion_oficial_importada'` y, como parámetros, la federación, la temporada, la
competición, el grupo, **la fuente** (`json` o `pnfg-html`), la ruta del fichero, la ruta de la otra
maqueta si existía, si se pudo cotejar con ella, cuántas filas se resolvieron por cada vía, la jornada
de corte y si se contrastó con la reconstruida. Además:

- `clasificacion_oficial_con_ajuste` — un registro por equipo con puntuación publicada por debajo de
  sus resultados (sanción o ajuste), con los tres valores.
- `clasificacion_oficial_sin_jornada_de_corte` — la fuente publica tabla pero el canónico no tiene
  ninguna jornada completa a la que colgarla. **No se cuelga de una jornada cualquiera**: hacerlo
  presentaría como «la tabla de J30» la foto de otro día. Medido: el grupo catalán 58315186 (2026-27,
  sin resultados todavía) tiene 20 filas oficiales válidas y no se escriben.
- `clasificacion_oficial_vs_reconstruida` — un registro por equipo cuya puntuación oficial no coincide
  con la reconstruida.

La oficial **nunca** se sobrescribe con la reconstruida: `origen` (`oficial` / `reconstruida`) forma
parte de la clave primaria de `core.standing_snapshot` y cada lector escribe su fila.

### Clasificación oficial: el contraste que destapa errores del calendario

La oficial se lee del HTML que el recolector ya tiene archivado (`clasificacion.html.gz` junto al
grupo) con el parser probado de `@facylf/ingesta`, y se guarda con `origen = 'oficial'`. La web enseña
la oficial cuando existe y la reconstruida como respaldo.

Cuando las dos no cuadran, **la diferencia se registra** en `ops.normalizacion_error` con
`codigo = 'clasificacion_oficial_vs_reconstruida'` (un registro por equipo, con los dos valores) y sale
en la consola del importador. No se elige en silencio:

```text
clasificación oficial: 19 filas archivadas · 7 equipos difieren de la reconstruida
  · Atlético Tordesillas: oficial 72 pts, reconstruida 69
  · Burgos C.F. Promesas: oficial 60 pts, reconstruida 56
```

(Ésa fue la lectura del 14/09/2026, **antes** de reparar el emparejamiento. Después de repararlo, la
misma comparación da `0 equipos difieren`: la reconstruida y la oficial dicen lo mismo.)

Dos detalles del esquema que obligan a hacerlo así: la vista resumen que se archiva **no trae goles a
favor y en contra** (se guardan a 0 y la web no los enseña cuando la tabla es la oficial, porque
inventarlos sumando el calendario sería mezclar las dos), y la puntuación oficial **ya lleva la sanción
descontada**.

### Cuadre del calendario: todos los equipos juegan lo mismo

En una liga regular **todos los equipos juegan el mismo número de partidos**. Parece obvio, y es la
comprobación que destapó lo anterior: en el grupo de Tercera Federación 2024-25, diez de los diecinueve
equipos juegan 35 o 37 partidos cuando la tabla oficial da 36 a los diecinueve. Ningún equipo aparece
dos veces en la misma jornada, así que el fallo está en el **emparejamiento** de unos cuantos partidos
(uno juega un partido de más y otro uno de menos), no en el reparto de jornadas.

**Son SIETE partidos con el equipo mal asignado, no cinco.** El recuento por equipo sólo delata cinco
arriba y cinco abajo porque dos de los siete se compensan entre sí: `C.D. Mirandés S.A.D. "B"` y
`Júpiter Leonés` aparecen los dos en un partido que les quita un enfrentamiento y en otro que se lo da,
así que acaban con 36 como si no hubiera pasado nada. El recuento por equipo no basta para contarlos.

Al cerrar cada lote se comprueba y, si hay desviaciones, se registra en `ops.normalizacion_error` con
`codigo = 'calendario_no_cuadra'` (equipos, jornadas, partidos habituales y la lista de desviados, con
sus jornadas sin jugar):

```text
⚠ calendario: 10 de 19 equipos juegan un número de partidos distinto del habitual (36 en 9 equipos)…
  · C.D. Almazán: 37 partidos · 1 jornada sin jugar
```

Para verlo todo de golpe:

```sql
select parametros->>'grupo' as grupo, parametros->>'partidos_habitual' as habitual,
       jsonb_array_length(parametros->'desviados') as equipos_desviados
  from ops.normalizacion_error where codigo = 'calendario_no_cuadra';
```

### Emparejamiento: la comprobación que ve lo que el recuento compensa

Independiente del recuento por equipo, y sin depender del formato de la competición, se comprueban dos
cosas que son imposibles en cualquier liga o eliminatoria a doble partido:

1. **más de dos enfrentamientos** entre los mismos dos equipos;
2. **dos enfrentamientos en el mismo campo**, cuando lo que corresponde es uno en cada uno.

Medido: el calendario de la cola del grupo 11379752 tenía 14 parejas con recuento distinto de 2 (siete
con tres enfrentamientos y siete con uno), y el recuento por equipo sólo veía diez equipos desviados.
El emparejamiento los delata a los siete. Se registra en `ops.normalizacion_error` con
`codigo = 'calendario_emparejamiento_no_cuadra'`:

```sql
select parametros->>'grupo' as grupo, jsonb_array_length(parametros->'anomalias') as parejas_imposibles
  from ops.normalizacion_error where codigo = 'calendario_emparejamiento_no_cuadra';
```

### La pareja de equipos: el calendario manda en la programación, el acta en quién jugó

De dónde salieron los siete. En una liga de número impar de equipos cada jornada deja a uno
descansando, y la página de la jornada publica esa fila como un bloque propio (el nombre del equipo y
la palabra «Descansa»). En **siete de las treinta y ocho jornadas** ese bloque aparece **justo antes
del primer partido**, y la lectura posicional de la cola tomó el equipo que descansaba como `local` de
ese primer partido: el `local` verdadero pasó a `visitante` y el `visitante` verdadero se perdió. El
`codigo_acta` siguió colgado de la fila, así que las alineaciones, los goles, las tarjetas y el cuerpo
técnico del acta quedaron atribuidos a **dos equipos que no jugaron ese partido**.

La prueba de que el mecanismo es exactamente ése: el conjunto de jornadas en las que la fila «Descansa»
precede al primer partido es `{8, 9, 23, 33, 34, 36, 37}`, y coincide **al 100 %** con el conjunto de
jornadas cuyo calendario está mal. El calendario reconstruido **desde el HTML archivado** con el
extractor actual es un round-robin perfecto (19 equipos, 342 partidos, 0 equipos con ≠36 partidos, 0
parejas irregulares): el HTML estaba bien y lo que estaba mal era la fila de la cola.

**No es un caso de Castilla y León.** Medido sobre las 18 colas el 15/09/2026: 181 partidos con esta
misma forma (Castilla y León 78, Asturias 48, Aragón 34, Cantabria 10, Castilla-La Mancha 6, La Rioja
5), más 2 con el campo invertido (Canarias) y 242 que no comparten ningún equipo. De los 22 grupos ya
importados, sólo estaba afectado el grupo 11379752, con siete partidos.

**Regla del importador** (`packages/canonico/src/resolucion/equipos-acta.ts`). El acta es el documento
del partido: nombra a los dos equipos y todo su contenido es relativo a esa pareja. Cuando el
calendario y el acta se contradicen sobre quién jugó, manda el acta, y **sólo se corrige cuando la
contradicción es demostrable**:

- **invertido**: el calendario trae la misma pareja con los campos cambiados;
- **fuga**: el calendario trae el `local` verdadero como `visitante` delante de un equipo que **no juega
  ningún otro partido de esa jornada** (el que descansaba). Sin esa comprobación no se corrige.

Cualquier otro desacuerdo (**otro**, ni siquiera comparten un equipo) no se puede resolver aquí: no se
toca nada y **el lote se detiene**, porque elegir mal contamina dos equipos a la vez y no se nota. Los
dos equipos del partido se resuelven **siempre** contra el catálogo del propio grupo, y el lote falla
si un código resuelto no está inscrito en él: un partido nunca cruza dos grupos.

Tres cosas más, en el mismo lote y por este orden, para que el canónico no quede a medias:

1. **la clasificación reconstruida usa la pareja efectiva**, no la del calendario. Si no, la fila del
   partido diría «Burgos C.F. Promesas vs C.D. Villaralbo» y la tabla seguiría dándole los puntos a
   Almazán. Medido: con la pareja efectiva, los 19 equipos de la tabla reconstruida **coinciden con la
   oficial**;
2. **las apariciones obsoletas se retiran** de los partidos reparados. `core.appearance` se indexa por
   `(match_id, team_entry_id, person_id, orden)`, así que cambiar el equipo **no pisa** la fila vieja:
   la duplica. Medido en el grupo: 250 apariciones retiradas (la suma exacta de las siete actas:
   36 + 35 + 36 + 36 + 36 + 36 + 35 = 250);
3. **la contradicción queda registrada siempre**, se corrija o no:
   - `core.match_report.incidencias` con `EQUIPOS_ACTA_NO_CUADRA` y las dos parejas enteras en
     `parametros` (`forma=…;calendario=…/…;acta=…/…`), o `EQUIPOS_ACTA_SIN_RESOLVER` cuando el acta
     nombra equipos que el grupo no resuelve;
   - `ops.normalizacion_error` con `partido_equipo_no_cuadra_con_acta` (un registro por partido) o
     `partido_equipo_de_acta_sin_resolver`.

```sql
select parametros->>'jornada' as jornada, parametros->>'orden' as orden,
       parametros->>'codigo_acta' as acta, parametros->>'forma' as forma,
       parametros->>'calendario' as decia_el_calendario, parametros->>'acta' as decia_el_acta
  from ops.normalizacion_error where codigo = 'partido_equipo_no_cuadra_con_acta'
 order by 1, 2;
```

Un nombre de equipo que resuelve a **dos** equipos distintos del grupo queda fuera del mapa de
resolución: elegir uno sería inventar y contaminaría dos plantillas, así que cuenta como «acta sin
resolver» y se registra. Nunca se une por parecido.

### Los 249 casos que siguen deteniendo su lote

Además de las fugas y los campos invertidos hay **249 partidos en los que el calendario y el acta no
comparten NINGÚN equipo**. El importador los detiene —no elige— y aquí está su causa medida con
`scripts/_diag-causa-partidos-incompatibles.mjs`. **Son dos clases, y ninguna es del importador**: las
dos son contenido de la cola.

**Clase A · 174 casos, todos de Euskadi: un marcador de estado dentro del nombre.** La maqueta «nova»
publica el estado del equipo dentro del propio nombre —`(Sailkatua)` (= clasificado) en 163 casos,
`(P)` en 24, `(Irabazlea)` (= ganador) en 11, `(Juv.)` en 4— y **el acta publica el nombre limpio**. Al
quitar el marcador de los dos lados, **las dos parejas quedan idénticas en los 174 casos**
(`scripts/_diag-marcadores-euskadi.mjs`). No es una avería por caso: es una regla de la fuente.

> **Corrección del 15/09/2026 — `(P)` ya no es una incógnita, y ya no detiene nada.** La medición de arriba
> dejaba `(P)` fuera de la lista de marcadores porque no se sabía qué era, y por eso sus casos seguían
> deteniendo su lote. La fuente lo dice: la maqueta nova envuelve cada marcador en un `<span>`, y el de
> `(P)` lleva `title="Ganador del partido en Penaltis"` — **35 de 35 apariciones**, medido sobre 110
> jornadas archivadas con `scripts/_diag-glosario-marcadores.mjs`. `(P)` es, por tanto, un estado de la
> competición como `(Sailkatua)` y ya se separa del nombre.
>
> Efecto medido sobre la copia de Euskadi: las filas incompatibles bajan de 199 a **0**, las ambiguas del
> manifiesto de 23 a **10** (y ninguna por contradicción del acta: las 10 son filas **sin acta** con la que
> comprobar la pareja), las correcciones deterministas suben de 170 a **199**, y los grupos con bloqueo de
> importación pasan de **16 a 0**: los **875** grupos de Euskadi con partidos son importables. Barrido en
> seco de comprobación: 40/40 grupos con marcador y 8/8 de temporada completa, sin una pega.
>
> Detalle, evidencia y las dos cautelas que NO salieron a favor (la concordancia con el marcador es débil, y
> el desempate por penaltis no está en ninguna columna): [RECONSTRUCCION-AMBIGUEDADES.md](RECONSTRUCCION-AMBIGUEDADES.md).
>
> Quedan fuera de esta corrección `(RET)`, `(Juv.)`, `(3)` y `(1)`, que la fuente publica como **texto
> suelto, sin `<span>`**, es decir sin marcarlos como estados.

Y hay algo más grave detrás, medido en `scripts/_diag-equipos-con-marcador.mjs` y en el recuento de
códigos: **Euskadi trae 28.833 de 32.877 partidos (88 %) sin código de equipo en ninguno de los dos
lados**, porque el extractor de esa maqueta sólo saca los códigos del enlace de comparativa
(`equipo1=`/`equipo2=`) y la mayoría de las filas no lo traen. Sin código, el importador no crea
inscripción para esos equipos, así que sus partidos quedarían sin equipos y las apariciones del acta se
rechazarían por «participación sin equipo resoluble». **Ésa es la razón de que Euskadi no esté en el
canónico**, y arreglarla es trabajo del extractor, no de la regla de resolución.

> **Resuelto el 15/09/2026.** Esos equipos ya tienen inscripción: se identifican por **referencia
> contextual** (`federación | temporada | competición | grupo | nombre_normalizado`), con
> `codigo_externo` nulo y la referencia registrada en `source.external_ref`. Se descubren citados por
> nombre en las representaciones del propio grupo —calendario, actas, clasificación y catálogo— y se
> resuelven por el orden de evidencia, sin fabricar códigos y sin parecido difuso. Migraciones 0012, 0013
> y 0014; diseño en [`resolucion/inscripcion.ts`](../../packages/canonico/src/resolucion/inscripcion.ts) y
> pruebas en `packages/canonico/test/inscripcion-sin-codigo.test.ts`. Medido: los 34.358 partidos de
> Euskadi, de los que 30.314 no traen ningún código, importan con las dos inscripciones de cada partido
> resueltas.

**Clase B · 75 casos: la fila de la cola no es la que dice su propio HTML archivado.** Reparto:
Castilla y León 62, Aragón 5, Castilla-La Mancha 3, La Rioja 3, Ceuta 2. Anatomía de un caso, con la
evidencia archivada delante (`scripts/_diag-caso-incompatible.mjs`,
`scripts/_diag-desfase-jornada.mjs`):

```text
grupo 22395204 (Aragón, Juvenil Preferente, J1)
  la cola dice    fila 0: TELEVOX-F.C. "A" vs CELLA C.F.   · acta 894798 · 2-2 · campo CALANDA
  el HTML dice    fila 1: CALANDA-C.D. vs CALAMOCHA-C.F.   · acta 894798
  el acta dice            CALANDA-C.D. vs CALAMOCHA-C.F.   (J1, 18-10-2025)
  y esa pareja es OTRO partido del mismo grupo: J14 ord 5
  sha256 del HTML en disco == jornadas.hash == archivos.hash  → la fila salió de ESTE HTML
```

Es decir: la fila 0 de la cola lleva la **fecha, la hora, el campo y el marcador** del partido del
acta, pero los **equipos** de otro partido, y el partido verdadero no está en la cola. Igual que las
siete fugas del grupo 11379752, el HTML está bien y la fila no: la cola se escribió con una versión
anterior del extractor y no se ha reconstruido desde el archivo.

**Por qué no se implementa todavía una reconciliación para ninguna de las dos.** La regla del encargo
es que una reconciliación nueva sólo entra si es determinista, demostrable con la fuente archivada,
generalizable, idempotente, está protegida por pruebas y es incapaz de corregir en silencio un caso
ambiguo. Las dos clases son deterministas y demostrables, pero:

- la **clase A** no se arregla en la reconciliación del acta: el marcador está en `team_season.nombre`
  (30 equipos de las 18 colas lo llevan) y, sobre todo, esos equipos **no tienen inscripción** porque
  no tienen código. Corregir sólo la pareja dejaría el nombre contaminado y los equipos sin resolver:
  es un arreglo a medias, y el sitio es la resolución del nombre y el extractor;
- la **clase B** pide **reconstruir la cola desde el HTML archivado**, que es una operación del
  recolector. Hacerlo dentro del importador convertiría al importador en la fuente del calendario, que
  es justo lo contrario del diseño.

Las dos quedan, por tanto, como incidencia abierta con su medición, y el lote sigue deteniéndose.



### Campos

`partidos.campo` es texto y `campo_codigo` falta en la mayoría de los partidos (658 de 2.725 en
Canarias tienen código). El `venue` se resuelve por código cuando existe y por nombre normalizado
dentro de la federación cuando no. Un campo sin nombre no crea fila.

### Resultado ausente

`partidos.goles_local` nulo son 532 de 2.725 en Canarias: partidos por jugar o sin resultado
publicado. Se copian como `NULL`. `official_status` se deduce de la fecha y del marcador, nunca se
inventa un `0-0`.

## 4. Idempotencia

El importador se ejecuta por grupo y es reanudable:

1. abre la SQLite **en sólo lectura**, sin tocar su WAL — los recolectores siguen escribiendo;
2. resuelve el catálogo antes que los hechos, y los hechos antes que los agregados;
3. escribe con `insert … on conflict … do update` sobre las claves naturales del canónico;
4. registra en `ops.batch` el cursor, los recuentos y el resultado de validación;
5. no borra nada que la fuente haya dejado de publicar: lo marca. Retirar del canónico lo que la fuente ya no
   publica —por ejemplo una inscripción que era el bloque de descanso— es una **retirada con diario**, aparte
   y reversible: ver §6.1;
6. recalcula `ops.coverage_checkpoint` y los agregados **sólo** de las entidades del lote.

La prueba de idempotencia es la de [CALIDAD-PRUEBAS.md](CALIDAD-PRUEBAS.md) §2: de cero, dos veces, y
por mitades tienen que dar el mismo estado canónico.

## 5. Orden dentro de un lote

```text
temporada → competición/edición → grupo → jornada → equipos (club, team_season, team_entry)
         → campos → partidos → actas (match_report) → personas
         → participaciones → eventos → técnicos → árbitros
         → clasificación oficial → cobertura → agregados
```

Un fallo en cualquier punto revierte el lote entero. Un lote a medias es peor que ningún lote,
porque parece cobertura.

## 6. Diario de lote y reversión

Cada lote guarda en `ops.batch_cambio` la clave y el estado anterior de cada fila que escribe. Eso es
lo que permite que `--revertir <lote>` deje la base exactamente como estaba: borra lo insertado,
restaura lo actualizado y **conserva** lo que necesita otro lote (una fila compartida no se borra).
Medido en el grupo 11379752: 25.881 filas restauradas y ninguna conservada.

El diario sólo tiene sentido mientras su lote sea el último de su ámbito, porque el estado anterior
que guarda describe hechos que ya ha sustituido el lote siguiente. Al confirmar un lote nuevo del
mismo grupo, el importador borra el diario de los anteriores y lo informa por consola:

```text
diario: 18.776 filas del diario anterior de este mismo grupo borradas (ese lote ya no era reversible; éste sí)
```

De los lotes viejos queda su fila en `ops.batch` (recuentos, validación, cobertura). `--revertir` de
un lote ya podado se niega con un mensaje explícito en vez de deshacer a medias. El espacio liberado
queda reutilizable, pero el fichero no se encoge: es VACUUM normal, no `VACUUM FULL`.

Medido: el diario de un grupo completo (28.909 filas) así ocupa 4,8 MB, más que sus partidos y actas
juntos (2,4 MB de filas). Por eso se poda en vez de acumularse. El detalle está en
[IMPORTADOR-INFORME.md](IMPORTADOR-INFORME.md) §3.

### 6.1 La tercera acción: `borrado` (17/09/2026)

El diario sabía deshacer dos cosas: lo que el lote **insertó** (se borra) y lo que **actualizó** (se
restaura). No sabía deshacer un **borrado**, así que un lote que retirara filas era irreversible —y no por
un descuido: no existía la acción. Se añadió con la migración **0015**:

| acción | qué significa | qué hace la reversión |
|---|---|---|
| `insert` | el lote creó la fila | la borra |
| `update` | el lote cambió la fila | restaura `anterior` |
| **`borrado`** | el lote **retiró** la fila | **la vuelve a insertar** desde `anterior`, entera y con su `id` |

La retirada vive en `packages/canonico/src/retirada.ts` y se invoca desde la CLI:

```bash
pnpm importar --retirar <lote.json>            # informa del plan y NO escribe
pnpm importar --retirar <lote.json> --aplicar  # retira con diario
pnpm importar --revertir <batch_id>            # lo repone
```

Tres garantías, y son las que la separan de un `delete`:

1. **No decide qué se retira**: las filas vienen de un lote preparado y revisado (hoy,
   `scripts/preparar-lote-canonico-descansos.mjs`, que sólo lee).
2. **No borra a ciegas**: relee cada fila y **se detiene** si cambió desde que se preparó el lote. El
   mensaje dice qué columna cambió.
3. **No toca nada fuera de sus claves**: cada `delete` va por la clave primaria **real**, leída del
   catálogo —no la que diga el fichero—, y tiene que afectar exactamente a una fila. Si afecta a cero, la
   transacción entera se deshace.

El orden importa y lo lleva `reversion.ts`: se borra de hijos a padres (`ORDEN_DE_BORRADO`) y se reinscribe
de padres a hijos (`ORDEN_DE_ESCRITURA`), porque una clave foránea impide lo contrario. Las columnas
GENERADAS (las `_norm`) se excluyen al reponer: las recalcula PostgreSQL. Pruebas:
`packages/canonico/test/retirada.test.ts` (6), con la reversión comparada por **huella lógica** del ámbito.

