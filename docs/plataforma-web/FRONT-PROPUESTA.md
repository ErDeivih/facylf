# Propuesta de estructura del front

Estado: **propuesta, pendiente de revisión del responsable**. 23 de septiembre de 2026. No es una
decisión: es lo que propongo construir, con los motivos medidos. Lo que salga de la revisión se
escribe como ADR si cambia algo ya aprobado.

Este documento no sustituye a [PRODUCTO-UX.md](PRODUCTO-UX.md) ni a
[SISTEMA-DISENO.md](SISTEMA-DISENO.md); los concreta. El aspecto lo fija
[`DESIGN.md`](../../DESIGN.md).

## 1. La idea: dos espinas que se tocan en un punto

Nuestros datos tienen **dos recorridos naturales** y no son el mismo. Confundirlos es lo que hace que
una web de federaciones se vuelva inusable.

```text
ESPINA A · por competición                ESPINA B · por entidad
(federación → … → partido)                (club y persona)

federación                                club
  └ temporada                               └ temporada
      └ competición (edición)                   └ equipo (team_entry)
          └ grupo                                   └ plantilla
              └ jornada                                 └ partidos
                  └ partido  ────────────┐
                      └ acta              │
                                          ▼
                                   team_entry
                          (el equipo dentro de un grupo)
```

**La espina A** es la de la federación: empiezas en una territorial y bajas hasta un partido. Responde
«¿qué se jugó, cómo va la clasificación, qué dice el acta».

**La espina B** es la del ojeador: empiezas en un club o en un nombre y subes por temporadas.
Responde «¿este club qué equipos tiene, quién jugaba aquí el año pasado, quién repite».

**Y se tocan en `team_entry`**, que es el equipo concreto dentro de un grupo. Ese es el único punto de
unión, y por eso es la pieza central del front.

## 2. La regla que ordena todo: se elige equipo por `team_entry`, nunca por `team_season`

Esto no es una preferencia de diseño, es una medición. Comprobado en el canónico local el 23/09/2026:

| Hecho | Dato |
|---|---|
| Club 16 «Ciudad Rodrigo C.F.» | temporada 2025-26 |
| Su equipo en «1ª División Provincial de Juveniles», grupo «Primera - Salamanca» | `team_entry` **2489** |
| Su equipo en «1ª División Regional de Aficionados» | `team_entry` **2517** |
| `team_season` de **ambos** | **2489**, el mismo, con `categoria = 'aficionados'` |

La clave única de `core.team_season` es `(club_id, season_id, nombre)`. Como la fuente publica el
mismo nombre para el juvenil y para el sénior, **los dos equipos colapsan en una sola fila**. Un
selector que ofrezca «Ciudad Rodrigo C.F. · 2025-26» estaría ofreciendo a la vez una plantilla juvenil
y una sénior, y cualquier recuento de esa pantalla sería falso.

Consecuencias que la estructura tiene que asumir:

1. **El selector de equipo ofrece `team_entry`**, y su etiqueta es la competición y el grupo, no sólo
   el nombre: «Ciudad Rodrigo C.F. — 1ª Provincial Juvenil, Primera - Salamanca».
2. **La categoría fiable es `competition_edition.categoria`**, no `team_season.categoria` (que aquí
   dice `aficionados` para un equipo juvenil).
3. **El club se presenta como suma de equipos, nunca como una plantilla.** Es exactamente el
   invariante que ya está escrito: club ≠ equipo-temporada ≠ inscripción.
4. Esto **corrige la ruta `/equipo/[teamSeasonSlug]` de PRODUCTO-UX.md §3**, que resuelve por
   `team_season` y por tanto no puede distinguir estos dos equipos. Propongo `/equipo/[entryId]`.
5. Queda pendiente decidir si esto se arregla también en el modelo (un `team_season` por
   categoría real) o sólo se rodea en la interfaz. **Rodearlo en la interfaz es lo correcto ahora**,
   porque el modelo no puede inventar una distinción que la fuente no publica sin una regla nueva y
   su ADR. Lo dejo señalado, no lo decido yo.

## 3. Mapa de rutas propuesto

Convención de URL: **el identificador canónico numérico resuelve; el nombre legible es decorativo y
no se usa para resolver** (`/club/16/ciudad-rodrigo-c-f`). Así un cambio de nombre en la fuente no
rompe ningún enlace y no hace falta una tabla de redirecciones.

El contexto global (federación y temporada) viaja siempre en `query`, como ya manda
`PRODUCTO-UX.md` §2.

### Espina A — competición

| Ruta | Responde | Estado |
|---|---|---|
| `/federaciones` | qué territoriales hay, qué se ha importado y cuánta cobertura | **ya lee el canónico** |
| `/federacion/[fed]` | temporadas y competiciones de una territorial | nuevo |
| `/competiciones?...` | catálogo con facetas: temporada, ámbito, categoría, modalidad, género, provincia, texto | existe pero lee el repositorio antiguo |
| `/competicion/[edicion]` | cabecera de la edición y sus grupos | existe, a migrar |
| `/competicion/[edicion]/grupo/[grupo]` | **el grupo como entidad de primera clase** | nuevo |
| `/competicion/[edicion]/grupo/[grupo]/jornada/[n]` | la jornada con sus partidos y la clasificación tras ella | existe, a migrar |
| `/partido/[partido]` | ficha del partido | existe, a migrar |
| `/acta/[acta]` | acta analizada | existe, a migrar |

**Por qué el grupo necesita ruta propia.** La unidad de publicación del proyecto **es el grupo**, no
la federación ni la edición: en cuanto un grupo tiene una jornada cerrada es navegable
([FEDERACIONES-MATRIZ.md](FEDERACIONES-MATRIZ.md) §5.1). Hoy el grupo es un `?` dentro de la edición
y eso obliga a resolverlo en cada página. Con ruta propia, la cobertura, el calendario, la
clasificación y los equipos cuelgan de donde de verdad viven.

### Espina B — entidad

| Ruta | Responde | Estado |
|---|---|---|
| `/club/[club]/[nombre]` | qué equipos tiene este club, temporada a temporada | existe, lee el repositorio antiguo |
| `/equipo/[entry]/[nombre]` | la plantilla y la temporada de **ese** equipo en **ese** grupo | existe, a rehacer |
| `/jugador/[persona]/[nombre]` | su carrera: temporada → equipo → partidos | existe, a migrar |

### Búsqueda

| Ruta | Responde |
|---|---|
| `/buscar?q=&tipo=&fed=&temp=` | por nombre, devolviendo **jugadores, clubes, equipos y competiciones**, con su contexto, y los homónimos **separados** |

Dos entradas al mismo sitio: el cuadro de la cabecera (sugerencias) y la página completa con facetas
y paginación por cursor.

## 3.bis. Estado real de la migración, medido el 24-sep-2026

Las columnas «Estado» de las tablas de arriba las escribí de memoria y **tienen al menos un error**.
Esto es lo comprobado, buscando quién importa `@/lib/repositorio-local` dentro de `apps/web/src/app`:

**Ya leen el canónico (8):** `/federaciones`, **`/competiciones`**, `/canonico`,
`/canonico/[federacion]/[grupo]`, `/club/[slug]`, `/equipo/[slug]`, `/jugador/[codigo]` y `/buscar`.

**Corrección:** la tabla de arriba dice que `/competiciones` «existe pero lee el repositorio antiguo».
**Es falso.** Ya lee el canónico —usa `LISTADO_DE_GRUPOS`, `FACETAS_DEL_CATALOGO` y
`FEDERACIONES_DEL_CANONICO`— y enlaza cada grupo a `/canonico/<federación>/<grupo>`. El catálogo de la
espina A, por tanto, **existe**; lo que le falta es el sistema de diseño, no los datos: todavía usa
colores literales (`bg-white`, `#D6D6D4`, `#5C646C`) que `SISTEMA-DISENO.md` §2 prohíbe. Y su
comentario de cabecera explica por qué **no** se puede construir el slug antiguo desde el canónico: el
código de temporada de la cola (21) no es el del canónico (3), así que fabricar esa URL daría un enlace
roto o, peor, a otra temporada. Eso confirma que los enlaces tienen que ir por identificador canónico y
no por slug heredado.

**Siguen leyendo el repositorio local (12 ficheros):**

| Ruta | Qué es |
|---|---|
| `api/buscar/route.ts` | **el endpoint de sugerencias** del cuadro de búsqueda de la cabecera: sigue recorriendo las colas |
| `/competicion/[slug]` | la ficha de edición o grupo |
| `/competicion/[slug]/jornada/[numero]` | la jornada |
| `/competicion/[slug]/calendario` | el calendario del grupo |
| `/competicion/[slug]/jugadores` | los jugadores de la competición |
| `/acta/[codigo]` | el acta |
| `/partidos` | el listado de partidos |
| `/equipos` | el listado de equipos |
| `/jugadores` | el listado de jugadores |
| `/tecnicos` | el listado de técnicos |
| `/arbitros-campos` | árbitros y campos |
| `/estadisticas` | estadísticas |

**Matiz que corrige el encabezado de esa lista, medido el 24-sep-2026:** `/competicion/[slug]` **no es
una página pendiente de migrar: es un híbrido deliberado.** Importa `grupoEnCanonico`
(`lib/canonico-grupos.ts`) y, cuando el grupo ya está importado, **lo dice y enlaza al canónico**;
mientras tanto sigue enseñando los datos de la cola para el grupo que todavía no lo está. Su propio
comentario lo explica: el visitante tiene que poder saber que esos datos están verificados, sin que la
página falle cuando el canónico no responde.

Consecuencia para el plan, y es incómoda: **sustituirla por una redirección sería quitar funcionalidad,
no migrarla.** Los grupos aún no importados perderían su página para quedarse en un 404 o en un aviso.
Lo que esa ruta necesita no es reemplazo sino **retirada**, cuando el canónico tenga los datos; hasta
entonces está bien como está.

Y el puente está **sólo** ahí: `grupoEnCanonico` no aparece en ninguna otra página. Así que el trabajo
que queda de verdad en la espina A son los tres hijos de esa ruta —`jornada/[numero]` (69 líneas),
`calendario` (58) y `jugadores` (77)—, más `/acta/[codigo]` (122), `/tecnicos`, `/arbitros-campos` y
`/estadisticas`. **No `/competicion/[slug]`.**

### 3.ter. De los tres hijos, dos migran y el tercero está bloqueado por `analytics`

Medido el 24-sep-2026, uno por uno y **antes de tocar ninguno**:

- **`calendario`** y **`jornada/[numero]`**: lectores puros de la cola, sin `grupoEnCanonico`. Se
  convierten en una redirección a la ficha canónica del grupo, resolviendo el slug heredado por sus dos
  códigos traducibles. **Hechos y verificados.** Pérdida asumida y escrita en el código: la ficha del
  grupo lista todos los partidos y no preselecciona la jornada; entre perder el grupo y perder la
  jornada se conserva el grupo.
- **`competicion/[slug]/jugadores`: NO se toca, y redirigir sería una regresión.** Su tabla tiene
  exactamente estas columnas: **convocatorias, partidos, titularidades, minutos estimados, goles y
  tarjetas**, por jugador y dentro del grupo. Son exactamente las columnas de
  `analytics.player_team_season_summary`, que está vacía y que ningún proceso escribe. Sus dos salidas
  serían malas: redirigir a la ficha del grupo pierde la tabla y sus órdenes por minutos y tarjetas, y
  calcularla aquí significa agregar `core.appearance` —253.095 filas— **en cada visita**, que es
  precisamente lo que esa capa existe para evitar. Se queda como está hasta que el agregado exista.

Así cierra (c), con un resultado desigual y honesto: **dos de tres migran, y el tercero no por falta de
trabajo sino porque le falta el dato.** Es el tercer sitio donde la capa `analytics` vacía decide el
resultado —tras el informe de Ciudad Rodrigo y el directorio de `/jugadores`— y el más claro de los
tres: aquí no hay interpretación posible, porque la página pide **literalmente** las columnas de esa
tabla. Cuando alguien discuta si merece la pena construirla, este es el argumento más corto.

### 3.quater. Recuento exacto y lo que de verdad queda (medido el 24-sep-2026)

Contado buscando quién importa `@/lib/repositorio-local` dentro de `apps/web/src/app`: quedan **6
ficheros**, no doce. Han salido de esa lista, por migración o retirada, **seis**: `api/buscar/route.ts`,
`layout.tsx` —ya no está en la lista porque dejó de importarlo—, `/equipos`, `/jugadores`, `/partidos`,
`competicion/[slug]/jornada/[numero]` y `competicion/[slug]/calendario`.

Y de los seis que quedan, **dos tienen un motivo medido para seguir ahí**:

| Fichero | Por qué sigue leyendo la cola |
|---|---|
| `competicion/[slug]` | **híbrido deliberado**: anuncia y enlaza el canónico cuando el grupo ya está importado (§3.bis). Se retira, no se reemplaza |
| `competicion/[slug]/jugadores` | **bloqueado**: su tabla es literalmente `analytics.player_team_season_summary` (§3.ter) |

**Los cuatro que quedan de verdad son `/acta/[codigo]`, `/tecnicos`, `/arbitros-campos` y
`/estadisticas`** — y hay que decir lo que tienen en común, porque decide el final de este trabajo:
**los cuatro necesitan un agregado que el canónico no tiene calculado.** Un acta necesita alineaciones y
eventos por partido (esos hechos **sí** existen: `appearance`, `match_event`, `match_staff`,
`match_official`); los otros tres necesitan recuentos por persona o por equipo. Ninguno se puede
resolver «migrando una página»: o se calcula el agregado, o se agrega `core` en cada visita.

Es decir: **lo que queda del front no es trabajo de front.** Es la misma decisión de datos de §5.1,
§3.ter y §5.2, que ya ha decidido el resultado de tres páginas y decide las cuatro últimas.

**Ya retirado de esa lista el 24-sep-2026:** `layout.tsx` usaba `FEDERACIONES_LOCALES` sólo para pintar
«{n} federaciones» en la cabecera. Ese número **no era el del canónico** —contaba las federaciones que
el repositorio local conoce, no las que tienen datos importados—, así que se ha quitado el número y el
enlace se llama «Federaciones». Quitar el número en vez de consultarlo tiene un motivo: una consulta en
el layout la pagaría **cada página del sitio**, y el recuento correcto ya se enseña en `/federaciones`.
La dependencia del cromo global con el repositorio local desaparece, y no se añade latencia.

Un aviso de método: la primera versión de este recuento salió mal porque busqué sólo `*.tsx` y
`api/buscar/route.ts` es `.ts`. Contar dependencias con un filtro de extensión es una forma fácil de
creerse una lista completa que no lo es.

**Lo que esto cambia del plan:** la espina A no hay que empezarla desde cero —el catálogo y la ficha
canónica de grupo ya están— sino **terminar de migrar** las cuatro páginas de `/competicion/[slug]/*`,
`/acta` y `/partidos`. Y hay una pieza pequeña con alcance grande que no había visto: **`layout.tsx`**.
Cambiar ahí la lista de federaciones por la del canónico toca todas las páginas a la vez y es el
cambio con mejor relación entre esfuerzo y efecto de toda la lista.

## 4. Qué pantalla hace qué

Para que se pueda corregir sin ambigüedad, esto es lo que propongo que conteste cada una.

**`/club/[club]`** — la espina B entera en una pantalla:
- identidad del club: nombre canónico, aliases publicados por cada fuente y su periodo;
- **selector de temporada** (sólo las temporadas con datos, nunca una lista completa con huecos);
- para la temporada elegida, **una fila por equipo**: competición, grupo, categoría de la edición,
  posición final, partidos y cobertura de ese grupo;
- aviso explícito cuando el club tiene **varios equipos con el mismo nombre publicado** en la misma
  temporada (el caso Ciudad Rodrigo): se muestran separados y se explica por qué;
- nunca una «plantilla del club»: no existe.

**`/equipo/[entry]`** — el equipo concreto:
- cabecera: club, nombre publicado, competición, grupo, categoría, temporada, cobertura del grupo;
- plantilla: una fila por jugador con convocatorias, partidos demostrados, titularidades, goles,
  tarjetas y **denominador** (`partidos_elegibles` / `partidos_cubiertos`);
- resultados jornada a jornada y racha;
- clasificación final oficial, con la reconstruida como contraste si discrepan;
- cuerpo técnico y árbitros de sus partidos, con `SinCapacidad` cuando la federación no los publica;
- **enlaces a la temporada anterior del mismo club** cuando existan.

**`/jugador/[persona]`** — la carrera:
- cabecera con cobertura e identidad: si la identidad es **nominal** (`identidad_nominal`), se dice;
- una línea por temporada y equipo, con el contexto completo (club, equipo, competición, categoría);
- partidos demostrados frente a convocatorias, con la distinción que ya manda la microcopia
  (`called_up_unknown` = «condición no publicada»);
- homónimos: si hay dos personas con el mismo nombre normalizado, **no se presenta ninguna como la
  misma** sin `identity_decision`.

**`/competiciones`** — el catálogo, con facetas encadenadas que muestran recuento y sólo ofrecen
combinaciones con datos. Orden y facetas viven en `searchParams`.

## 5. Orden de construcción que propongo

La tentación es empezar por las pantallas. El propio traspaso dice que el problema no es de estilos:
**la portada, `/federaciones` y `/competiciones` leían el repositorio antiguo y por eso salían a
cero** ([TRASPASO-AGENTE.md](TRASPASO-AGENTE.md) §4(D)). Empezar por el diseño sobre datos viejos
produce «ceros bonitos». Por eso:

| Fase | Qué | Por qué antes |
|---|---|---|
| **0** | **Capa de datos canónica**: contratos de lectura para las dos espinas y para la búsqueda, con el mismo formato que ya tiene `consultas/contratos.ts` (`presupuestoMs`, `plan`, `columnas`) | sin esto ninguna pantalla puede enseñar un número verdadero |
| **0b** | **Poblar y medir la búsqueda.** `analytics.search_entity` está **a 0 filas** hoy | la búsqueda por nombre no puede funcionar sin ella, o hay que consultar `core` directamente: **decisión pendiente** (§6) |
| **1** | **Componentes del inventario** de SISTEMA-DISENO.md §5, escritos primero en su estado vacío: `Tabla`, `TablaResponsiva`, `Chip`, `Faceta`, `Paginador`, `InsigniaCobertura`, `Procedencia`, `Vacio`, `Esqueleto`, `ErrorRecuperable`, `SinCapacidad`, `Marcador`, `Racha` | son las piezas que comparten las dos espinas |
| **2** | **Espina A**: `/federacion/[fed]`, `/competiciones`, la ruta del grupo, y la migración de edición, jornada, partido y acta | es el recorrido que ya conocemos y el que valida la capa de datos |
| **3** | **Espina B**: club con selector de temporada y equipo, y jugador | es la que responde la pregunta que hoy se contesta a mano |
| **4** | **Búsqueda** con facetas y homónimos | necesita 0b y los componentes de 1 |

En cada fase: la vista se escribe **vacía → parcial → completa**, y toda pantalla **declara qué
capacidades de fuente necesita** (sin esa declaración no está hecha).

### 5.1. El hallazgo que decide la fase 0: no existe la capa de agregados

Medido en el canónico local el 23/09/2026:

| Tabla | Filas |
|---|---|
| `analytics.player_team_season_summary` | **0** |
| `analytics.player_career_summary` | **0** |
| `analytics.team_edition_summary` | **0** |
| `analytics.search_entity` | **0** |
| `core.appearance` | 253.095 |
| `core.match_event` | 164.549 |
| `core.match_report` | 7.337 |
| `ops.coverage_checkpoint` | 39 |

Los hechos están; los resúmenes **no**. Y no es que estén a medio calcular: **no hay ningún código en
el repositorio que los escriba**. Se buscan las cuatro tablas en todo el árbol y sólo aparecen en las
migraciones que las crean, en la documentación, en `packages/canonico/src/mantenimiento.ts` —que las
**lee** para detectar huérfanos— y en los scripts de diagnóstico. El importador calcula
`ops.coverage_checkpoint`, que sí está poblada, pero nunca ha calculado las de `analytics`.

Esto ya estaba anotado en [RITMO-MEDIDO.md](RITMO-MEDIDO.md) y en
[REPARACION-DESCANSOS.md](REPARACION-DESCANSOS.md), así que no es un descubrimiento: es una deuda
conocida. Pero decide el orden de construcción del front, así que se dice aquí con los números.

Consecuencia directa, y es incómoda: **la espina B no se puede construir contra `analytics`**, porque
está vacía. Las cifras por jugador —convocatorias, titularidades, minutos, goles, tarjetas— y el
denominador `partidos_elegibles`/`partidos_cubiertos` que este proyecto exige para enseñar cualquier
media viven en tablas que nadie rellena. Hay dos caminos y hay que elegir uno **antes** de escribir la
primera pantalla de club o de jugador:

- **(a) Construir los agregados** según [MODELO-DATOS.md](MODELO-DATOS.md) §9, con `metric_version`,
  `computed_at` y `source_data_version`, y recalcular sólo las entidades afectadas por un lote. Es el
  diseño documentado y el que hace que el front sea simple y rápido. Es trabajo de datos, no de
  interfaz, y probablemente otro encargo.
- **(b) Derivar de los hechos en la consulta** (`core.appearance` + `core.match_event` + `core.match`)
  con agregación al vuelo. Funciona hoy y no depende de nadie, pero cada visita paga el recorrido y se
  aleja de los presupuestos de rendimiento en cuanto el canónico tenga millones de filas.

Mi recomendación: **(a)**, y mientras tanto que la espina A se construya entera —que sí tiene datos—
y que la ficha de equipo enseñe sólo lo que se puede demostrar con hechos y cobertura, con los huecos
rotulados como lo que son. Lo que **no** propongo es derivar en la consulta y luego rehacerlo.

Y una nota de privacidad que este hallazgo hace urgente: la plantilla de un equipo juvenil son
**menores**, y `core.person.es_menor` lo dice. Cualquier pantalla o informe que liste nombres de
menores se queda en la instancia privada: no se versiona fuera del repositorio ni se enseña a
Internet, y eso incluye los informes de datos que se generen para responder preguntas concretas.

### 5.2. La otra tabla que falta: `core.source_capability` (medido el 24-sep-2026)

```
select count(*) from core.source_capability;   -- 0 filas
```

La capacidad de fuente es el mecanismo **declarado** del proyecto para que «esta federación no publica
alineaciones» sea un hecho versionado y no una suposición: lo pide el invariante 11 de la skill, lo
define [FEDERACIONES-MATRIZ.md](FEDERACIONES-MATRIZ.md) §3 con su vocabulario cerrado, y el componente
`SinCapacidad` del inventario es **obligatorio** en cualquier vista que pueda quedarse sin métricas
individuales. La tabla está **vacía**, y como `analytics`, **tampoco la escribe ningún proceso**.

Consecuencia directa: **`SinCapacidad` no se puede conectar hoy**, y no por falta de querer. Una
pantalla que enseña una plantilla vacía **no puede saber** si la federación no publica alineaciones o
si esa acta aún no se ha importado — que son exactamente los dos estados que la doctrina del proyecto
existe para separar. Donde la web lo dice con precisión hoy (la nota sobre el portero en la ficha de
equipo) es porque el hecho se midió a mano y se escribió en el código, **no** porque el modelo lo
declare.

Quedan por tanto **dos** de las tablas en las que se apoya «ausente ≠ cero» sin rellenar: `analytics.*`
y `core.source_capability`. La doctrina está escrita, las consultas y los componentes existen, y los
datos que permitirían aplicarla no están. Rellenarlas es trabajo de datos y no de interfaz, y es la
misma decisión que §5.1(a): no se puede resolver desde el front.

## 6. Lo que necesito que corrijas

Son las cinco decisiones donde tu respuesta cambia lo que construyo:

1. **¿El grupo tiene ruta propia?** Propongo que sí (`/competicion/[edicion]/grupo/[grupo]`), porque
   es la unidad de publicación. La alternativa es dejarlo como filtro de la edición.
2. **¿Identificador numérico + nombre decorativo en la URL?** Propongo que sí. La alternativa son
   slugs resueltos por tabla con redirecciones al cambiar de nombre: más bonito y más trabajo.
3. **¿La búsqueda consulta `analytics.search_entity` o `core` directamente?** La proyección existe
   pero está vacía. Poblarla es trabajo del importador o de un agregado; consultar `core` funciona ya
   pero no escala a millones de filas. Mi recomendación: **`core` ahora** (con `pg_trgm`, que ya tiene
   índices) **y `search_entity` cuando el volumen lo pida**, con la misma forma de contrato para que
   la pantalla no cambie.
4. **`team_season`**: ¿rodeamos en la interfaz (mi propuesta) o abrimos un ADR para que el modelo
   distinga el juvenil del sénior? Rodear es inmediato y no inventa nada; arreglar el modelo es
   correcto a largo plazo pero es otro encargo.
5. **¿`/scouting` entra ahora o sigue fuera?** `PRODUCTO-UX.md` lo marca como privado y futuro.
   Propongo dejarlo fuera de esta tanda.

## 7. Lo que ya está bien y no propongo tocar

- La forma de leer del canónico con rol de sólo lectura, la degradación honesta cuando la base no
  responde (`SinCanonico`) y el contrato de consulta con presupuesto y plan.
- La página `/federaciones` actual es el patrón a imitar: enseña cobertura medida, no recuentos de
  cola que el esquema no guarda, y no convierte en cero lo que no sabe.
- La microcopia: los tres estados de ausencia ya están escritos y no se inventan redacciones nuevas.
- Los presupuestos: sugerencias 200 ms p95, competición 800 ms. Toda consulta nueva declara el suyo.
