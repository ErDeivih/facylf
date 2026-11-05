# API pública v1

Estado: **implementada el 05/11/2026 y ampliada el 05/11/2026 con estadísticas, historiales y fichas de
oficiales; pendiente de validación del Lead** (WALL objetivo 6). Código:
`apps/web/src/app/api/v1/`, piezas comunes en `apps/web/src/lib/api.ts`,
`apps/web/src/lib/api-datos.ts`, `apps/web/src/lib/cache.ts` y `apps/web/src/lib/limite-api.ts`.
Pruebas: `apps/web/test/api-v1.test.ts` (26) y `apps/web/test/api-v1-ampliacion.test.ts` (12).

La API **reutiliza las consultas del catálogo** (`apps/web/src/consultas/*.ts`, contrato `Consulta`) y
las pantallas de la web. No hay una segunda copia del SQL: si la consulta de una ficha cambia, la API
cambia con ella.

## 1. Reglas generales

- Base: `/api/v1`. La versión va en la ruta y dentro de cada respuesta (`api.version = "v1"`). Un cambio
  incompatible estrena `/api/v2`; no se cambia el significado de un campo de `v1`.
- Todas las respuestas son `application/json; charset=utf-8`, con `X-Content-Type-Options: nosniff`.
- Los nombres de campo son **los del canónico** (`snake_case`), documentados por endpoint. Los
  identificadores que PostgreSQL devuelve como texto (`bigint`) se normalizan a número; una fecha o un
  código nunca se convierten.
- No se leen cookies ni consultas de cuenta: la API pública no devuelve datos de usuario, favoritos,
  avisos ni sesión.
- Sin CORS abierto: es una instancia privada y la API se consume desde el mismo origen o desde un
  cliente con acceso a la red. Abrirla a otros orígenes es una decisión aparte.

### Sobre de una respuesta correcta

```json
{
  "api": { "version": "v1", "recurso": "acta" },
  "datos": { "...": "recurso" },
  "enlaces": { "web": "/explorar/acta/94040" }
}
```

Los listados añaden `filtros` y `paginacion`:

```json
{
  "api": { "version": "v1", "recurso": "calendario" },
  "filtros": { "federacion": "castilla-leon", "temporada": "2026-27" },
  "paginacion": { "pagina": 1, "porPagina": 60, "hayMas": true },
  "datos": [ ... ]
}
```

### Sobre de un error

```json
{ "api": { "version": "v1" }, "error": { "codigo": "no_encontrado", "mensaje": "..." } }
```

Los errores van con `Cache-Control: no-store` (un 404 de hoy puede ser un 200 mañana) y **nunca**
incluyen SQL, trazas ni rutas internas. `detalles` puede traer el parámetro culpable.

| Código HTTP | `error.codigo` | Cuándo |
|---|---|---|
| 400 | `id_invalido` | el id de la ruta no es un entero positivo |
| 400 | `parametro_invalido` | un filtro o la paginación no cumplen el formato (lleva `detalles.parametro`) |
| 401 | `no_autorizado` | `POST /api/revalidar` sin el `Bearer` correcto |
| 404 | `no_encontrado` | el recurso no existe (o el partido no tiene acta publicada) |
| 429 | `demasiadas_peticiones` | más de 300 peticiones por IP y minuto; lleva `Retry-After` |
| 500 | `error_interno` | fallo inesperado; el detalle va al registro del servidor |
| 503 | `canonico_no_disponible` | la base canónica no responde o faltan credenciales; lleva `Retry-After: 30` |
| 503 | `sin_configurar` | falta el secreto de revalidación en este servidor |

### Caché HTTP y ETag

- Un 200 público: `Cache-Control: public, max-age=60, stale-while-revalidate=300`.
- El índice: `public, max-age=3600, stale-while-revalidate=86400`.
- `ETag` fuerte (sha-256 del cuerpo). Si el cliente manda `If-None-Match` con el ETag vigente:
  **304** sin cuerpo, con el mismo `ETag`, `Cache-Control` y `X-Cache`.
- `X-Cache: HIT` cuando la respuesta salió de la caché por etiquetas de Next; `MISS` cuando se calculó
  (consulta a PostgreSQL incluida). Es la cabecera que permite medir aciertos sin mirar dentro del
  servidor. `X-API-Version: v1` en todas las respuestas.
- `POST /api/revalidar` y todos los errores: `no-store`.

### Límite de peticiones

**300 peticiones por IP y minuto**, por proceso. Al superarlo: `429` con `Retry-After` (segundos).
Es un cortafuegos para un script descontrolado, **no** una defensa contra un ataque distribuido: la
instancia es una sola, no hay proxy delante y la cabecera `X-Forwarded-For` es la que dice la IP. Si
algún día la API se abre de verdad, el límite tiene que vivir en el proxy.

## 2. Endpoints

| Método | Ruta | Recurso |
|---|---|---|
| GET | `/api/v1` | índice de la API y estado de cada endpoint |
| GET | `/api/v1/competiciones/{id}` | contexto y cobertura de un grupo |
| GET | `/api/v1/acta/{id}` | acta completa de un partido |
| GET | `/api/v1/calendario` | partidos con filtros y paginación |
| GET | `/api/v1/ficha/equipo/{id}` | ficha de una inscripción de equipo |
| GET | `/api/v1/ficha/jugador/{id}` | ficha de una persona |
| GET | `/api/v1/ficha/club/{id}` | ficha de un club |
| GET | `/api/v1/estadisticas/competicion/{id}` | resumen, eventos y goleadores de un grupo |
| GET | `/api/v1/ficha/jugador/{id}/historial` | apariciones reales de una persona, para construir sus tramos |
| GET | `/api/v1/ficha/equipo/{id}/historial` | temporadas de la línea de un equipo |
| GET | `/api/v1/ficha/club/{id}/historial` | equipos de un club, temporada a temporada |
| GET | `/api/v1/oficiales/arbitro/{id}` | ficha de un árbitro principal |
| GET | `/api/v1/oficiales/entrenador/{id}` | ficha de un entrenador |
| GET | `/api/v1/oficiales/delegado/{id}` | ficha de un delegado de equipo |
| POST | `/api/revalidar` | operación de servicio: consume invalidaciones (secreto) |

### `GET /api/v1/competiciones/{id}`

`id` = `core.phase_group.id` (el de la pantalla `/explorar/competicion/[id]`). Reutiliza
`grupo-por-id`. Devuelve federación, temporada, edición, grupo, categoría/división/modalidad/ámbito,
equipos, jornadas previstas, jornada actual, **cobertura** (`visibility_state`,
`partidos_conocidos`, `partidos_con_resultado`, `complete_through_matchday`, `calculado_en`), fechas
del calendario y enlaces a clasificación/jornadas/calendario.

```bash
curl -s http://localhost:3000/api/v1/competiciones/3769
```

404 si el id no existe o la federación está excluida de la web.

### `GET /api/v1/acta/{id}`

`id` = `core.match.id`. Reutiliza `acta-del-partido` y conserva su regla: **un partido sin informe de
acta, o con calidad `unavailable`, es un 404** (no hay acta que enseñar). El resto
(`correct`, `review`, `partial`, `administrative`) se sirve entero: contexto, marcador, `calidad_acta`,
`eventos[]`, `alineaciones[]`, `oficiales[]`, `cuerpo_tecnico[]` y `enfrentamientos[]`. Las reglas de
presentación (propia puerta al lado que suma, cambios `entra`/`sale`, nombres de menores publicados,
sin fotos) están en `apps/web/src/lib/acta.ts`.

```bash
curl -s http://localhost:3000/api/v1/acta/94040
```

### `GET /api/v1/calendario`

Parámetros (todos opcionales; se validan y un valor mal formado es **400**):

| Parámetro | Formato | Por defecto |
|---|---|---|
| `federacion` | código, p. ej. `castilla-leon` | sin filtro |
| `temporada` | `AAAA-AA`, p. ej. `2026-27` | sin filtro |
| `jornada` | entero 1–500 | sin filtro |
| `desde`, `hasta` | fecha real `AAAA-MM-DD`; `desde <= hasta` | sin filtro |
| `texto` | texto de hasta 80 caracteres (equipo/competición) | sin filtro |
| `pagina` | entero 1–10000 | 1 |
| `porPagina` | entero 1–100 | 60 |

Devuelve `datos[]` con los campos de `partidos-del-calendario` y
`paginacion.hayMas` calculado pidiendo una fila de más (no recorre la tabla para contar).

```bash
curl -s 'http://localhost:3000/api/v1/calendario?federacion=castilla-leon&temporada=2026-27&porPagina=5'
```

### Fichas

- `GET /api/v1/ficha/equipo/{id}`: `id` = `core.team_entry.id`. Reutiliza `equipo-por-id` y, en una foto,
  `escudo-del-club`, `plantilla-del-equipo`, `partidos-del-equipo` y `goles-por-tramo`. Respuesta:
  `{ equipo, escudo, plantilla[], partidos[], goles_por_tramo[] }`.
- `GET /api/v1/ficha/jugador/{id}`: `id` = `core.person.id`. `persona-por-id` +
  (`trayectoria-de-persona`, `partidos-de-persona`). Respuesta: `{ persona, trayectoria[], partidos[] }`.
- `GET /api/v1/ficha/club/{id}`: `id` = `core.club.id`. `club-por-id` +
  (`equipos-del-club`, `escudo-del-club`). Respuesta: `{ club, escudo, equipos[] }`.

### `GET /api/v1/estadisticas/competicion/{id}`

`id` = `core.phase_group.id`. Reutiliza las mismas consultas que la página de estadísticas del grupo:
`grupo-por-id` (para validar y situar la competición), `partidos-de-grupo`, `eventos-del-grupo` y
`goleadores-de-estadísticas` (top 10 con al menos un partido). El resumen de partidos se agrega con la
misma función pura que la pantalla (`agregaResumenDePartidos`). No hay una consulta por equipo ni por
jornada.

```json
{
  "api": { "version": "v1", "recurso": "estadisticas-competicion" },
  "datos": {
    "competicion": { "id": 3769, "federacion": "castilla-leon", "temporada": "2026-27", "edicion": "Liga Nacional Juvenil", "grupo": "Primera - III", "categoria": "juvenil", "division": "liga-nacional", "modalidad": "desconocida", "ambito": "nacional", "jornada_actual": 4 },
    "resumen": { "partidos": 32, "con_resultado": 32, "goles": 135, "local": 16, "empate": 7, "visitante": 9, "con_cero": 3, "actas": 32, "actas_correctas": 32 },
    "eventos": { "tramos": [ { "orden": 3, "goles": 21 } ], "tarjetas": [ { "equipo_id": 17609, "equipo": "C.D. INTERNACIONAL VISTA ALEGRE", "amarillas": 4, "rojas": 0 } ] },
    "goleadores": [ { "persona_id": 12345, "nombre": "APELLIDO, NOMBRE", "es_menor": true, "goles": 8, "goles_penalti": 1, "partidos": 9, "equipo": "EQUIPO", "club_id": 6, "tiene_escudo": true } ]
  },
  "enlaces": { "web": "/explorar/competicion/3769/estadisticas", "api": "/api/v1/estadisticas/competicion/3769" }
}
```

La temporada no es un parámetro: la fija la edición del grupo pedido (un grupo es de una temporada). Un
id no numérico es **400**; un grupo inexistente, **404**. Si el grupo existe pero no tiene partidos
publicados, se responde 200 con el resumen a cero y las listas vacías: es un grupo sin datos, no un
recurso que no exista.

```bash
curl -s http://localhost:3000/api/v1/estadisticas/competicion/3769
```

### Historiales

Los tres endpoints devuelven **los datos tal como los usa la pantalla**, sin agrupar de otra forma: el
cliente que quiera tramos o cambios a mitad de temporada aplica las reglas puras documentadas en
`apps/web/src/lib/historial-jugador.ts` (un tramo por inscripción de equipo y temporada; dos tramos con
fechas solapadas son «dos equipos a la vez», no un cambio).

- `GET /api/v1/ficha/jugador/{id}/historial`: `id` = `core.person.id`. Reutiliza `historial-de-jugador`
  (una sola consulta: persona + apariciones en JSON). Respuesta:
  `{ persona_id, nombre_mostrado, es_menor, identidad_nominal, apariciones[] }`; cada aparición lleva
  `match_id`, `team_entry_id`, `condicion` (`starter`/`substitute`/`called_up_unknown`), `fecha`,
  `temporada`, `equipo`, `club_id`, `club`, `edicion`, `grupo_id`, `grupo`, `federacion`,
  `federacion_nombre`, `goles`, `goles_penalti`, `propias`, `amarillas`, `rojas`, `minutos_exactos`,
  `minutos_estimados` y `minutos_fiables`. Los minutos **sólo** son utilizables si `minutos_fiables` es
  `true`; un `null` es «sin dato», no 0. 404 si la persona no existe.
- `GET /api/v1/ficha/equipo/{id}/historial`: `id` = `core.team_entry.id` (inscripción). Reutiliza
  `historial-del-equipo`: una fila por temporada de la **línea** del equipo (club, categoría y letra),
  con competición, grupo, puesto, movimiento, balance, racha y enlaces a jornada y acta. Respuesta:
  `datos[]` (array de filas). 404 si el equipo no existe o su federación está excluida.
- `GET /api/v1/ficha/club/{id}/historial`: `id` = `core.club.id`. Reutiliza `historial-del-club` con la
  misma ventana que la pantalla (**500 inscripciones** como máximo). Devuelve una fila por inscripción,
  con el club repetido para que el cliente pinte la cabecera sin otra lectura. Un club que existe y no
  tiene equipos publicados devuelve 200 con una fila de club y los campos de equipo a `null`; un club
  que no existe es 404.

### `GET /api/v1/oficiales/arbitro/{id}`, `/entrenador/{id}` y `/delegado/{id}`

`id` = `core.person.id` en los tres. Reutilizan `arbitro-por-id`, `entrenador-por-id` y
`delegado-por-id`, con **la misma regla de rol que las pantallas** (árbitro principal; entrenador
normalizado, nunca preparador de porteros; delegado de equipo, sin delegados de campo/protección). La
ficha sólo existe si la persona tiene ese papel: **un jugador no es un árbitro, y eso es un 404**, no
una ficha vacía. La respuesta es la fila de la consulta (`partidos`, medias, `ultimos[]`…), más
`enlaces.web` a su ficha. No se expone ningún dato de cuenta.

### `POST /api/revalidar` (operación de servicio, no pública)

Consume las etiquetas pendientes de `ops.invalidacion` y refresca la caché por etiquetas. Requiere
`Authorization: Bearer <secreto>` con el mismo secreto del proyector (`REVALIDACION_SECRETO`; se admite
el nombre antiguo `REVALIDAR_SECRETO`). Sin secreto configurado: 503.

- `?maximo=N`: lote máximo, entero 0–10000 (por defecto 2000). `maximo=0` comprueba la operación sin
  consumir la cola (lo usan las pruebas).
- Respuesta: `{ "api": { "version": "v1" }, "refrescadas": N }`, donde N incluye las etiquetas de la
  cola más las derivadas (`acta`, `calendario`, `estadisticas`, `historiales`, `oficiales`).

## 3. Caché por etiquetas e invalidación

Diseño de `RENDIMIENTO-BASE.md` §4, implementado en `apps/web/src/lib/cache.ts`:

- Cada respuesta de recurso se guarda en `unstable_cache` con etiquetas: `grupo:12`, `equipo:345`,
  `persona:789`, `club:6`, `acta`, `calendario`, `estadisticas`, `historiales`, `oficiales`. Las
  etiquetas amplias son a propósito: el proyector apunta entidades (grupo, edición, federación, equipo,
  club, persona) y no una etiqueta por partido; cuando cambia cualquiera de esas entidades se refrescan
  **todas** las actas, el calendario, las estadísticas de grupo, los historiales y las fichas de
  oficiales (más trabajo de cálculo, nunca un dato viejo).
- Las etiquetas amplias nuevas son `estadisticas` (`grupo:*`), `historiales` (`persona:*`, `equipo:*`,
  `club:*`) y `oficiales` (`persona:*`). La derivación concreta está en `DERIVADAS` de
  `apps/web/src/lib/cache.ts` y se prueba en `api-v1-ampliacion.test.ts`: un cambio de grupo refresca
  estadísticas, historiales y oficiales; uno de equipo o club refresca historiales y oficiales.
- Caducidad de seguridad: 5 minutos. Es la única diferencia con el diseño del documento (que la dejaba
  sin caducidad): si la invalidación no llegara, la API no se queda congelada para siempre.
- `scripts/proyectar-lectura.mjs` ya apunta las etiquetas con `ops.invalida_grupo` al proyectar un
  grupo. La web las consume de dos formas:
  1. `POST /api/revalidar` (lo puede llamar el proyector al terminar);
  2. `apps/web/src/instrumentation.ts`, al arrancar y **cada minuto**, con el rol `facylf_app` (el rol de
     lectura público no puede leer `ops.invalidacion`).
- **Estado medido el 05/11/2026:** la cola tenía **1.735.716 filas, 1.717.716 pendientes** (una
  proyección histórica completa sin consumidor hasta ahora). A 2000 por minuto se vacía en unas 14
  horas; el temporizador la va consumiendo. Decisión para el Lead: dejarla vaciarse o hacer una pasada
  con `POST /api/revalidar?maximo=10000` repetido; **no se ha borrado nada**.
- No se cachean: `POST /api/revalidar`, los errores ni nada que dependa de una cuenta. Esta API no
  tiene rutas con sesión.

## 4. Rendimiento medido

Máquina compartida con los recolectores y **servidor de desarrollo** (`next dev`, no build de
producción): los números incluyen el coste de desarrollo y oscilan entre pasadas. Evidencia completa:
`tmp/api-mediciones.json` y `tmp/api-ampliacion-mediciones.json` (p50/p95 por recurso),
`tmp/api-curl.txt` y `tmp/api-curl-ampliacion.txt` (peticiones reales) y `tmp/api-explain.json` y
`tmp/api-ampliacion-explain.json` (EXPLAIN).

### Caché: cálculo (MISS) contra acierto (HIT) y 304

| Recurso | MISS p50 | MISS p95 | HIT p50 | HIT p95 | 304 p50 | Cuerpo |
|---|---:|---:|---:|---:|---:|---:|
| competición | 46,3 ms | 83,0 ms | 36,1 ms | 43,7 ms | 49,0 ms | 1.025 B |
| acta | 81,8 ms | 101,4 ms | 33,8 ms | 42,9 ms | 74,4 ms | 13.959 B |
| calendario (5 por página) | 59,7 ms | 94,2 ms | 31,1 ms | 44,3 ms | 49,0 ms | 4.028 B |
| ficha equipo | 62,8 ms | 84,9 ms | 34,7 ms | 64,7 ms | 70,2 ms | 11.495 B |
| ficha jugador | 81,1 ms | 128,4 ms | 32,3 ms | 38,2 ms | 103,1 ms | 8.481 B |
| ficha club | 83,6 ms | 154,8 ms | 38,4 ms | 67,0 ms | 81,7 ms | 217.695 B |
| estadísticas competición | 114,7 ms | 208,3 ms | 15,2 ms | 30,0 ms | 76,6 ms | 4.022 B |
| historial jugador | 71,8 ms | 130,9 ms | 31,3 ms | 37,3 ms | 44,5 ms | 72.202 B |
| historial equipo | 41,4 ms | 130,1 ms | 22,9 ms | 32,6 ms | 47,5 ms | 3.211 B |
| historial club | 120,2 ms | 182,3 ms | 33,2 ms | 52,1 ms | 62,7 ms | 269.214 B |
| árbitro | 28,9 ms | 73,4 ms | 18,7 ms | 31,4 ms | 30,2 ms | 8.520 B |
| entrenador | 30,7 ms | 42,6 ms | 16,7 ms | 33,7 ms | 32,5 ms | 8.901 B |
| delegado | 29,8 ms | 35,9 ms | 15,4 ms | 30,2 ms | 31,0 ms | 8.841 B |

MISS = primera petición de un recurso (consulta + montaje del JSON). HIT = misma URL desde la caché por
etiquetas. 304 = petición condicional con el ETag (sin cuerpo). Las seis primeras filas: 10 HIT, 12 MISS
y 8 condicionales por recurso, salvo el primer calentamiento. **La ampliación**: 8 HIT, 6 MISS y 5
condicionales por recurso (5/5 devolvieron 304). El historial de club es el cuerpo más grande (269 KB con
un club de 500 inscripciones): está dentro de lo asumible y queda la paginación como pendiente.

### Consultas (EXPLAIN ANALYZE, BUFFERS; mejor de dos pasadas)

| Consulta | ms | Presupuesto | Plan | `Seq Scan` en tabla de hechos |
|---|---:|---:|---|---|
| `grupo-por-id` | 4,2 | 300 | indexado | no (`federation_asset`, `season` son catálogo) |
| `acta-del-partido` | 7,9 | 500 | indexado | no (`appearance_detalle`, `season`) |
| `partidos-del-calendario` | 30,3 | 800 | indexado | no (`season`) |
| `opciones-del-calendario` | 0,4 | 300 | agregado | no |
| `equipo-por-id` | 0,4 | 200 | indexado | no |
| `plantilla-del-equipo` | 0,4 | 400 | indexado | no |
| `partidos-del-equipo` | 0,3 | 400 | indexado | no |
| `goles-por-tramo` | 0,4 | 300 | indexado | no (`federation`) |
| `escudo-del-club` | 0,1 | 100 | indexado | no |
| `persona-por-id` | 0,1 | 150 | indexado | no |
| `trayectoria-de-persona` | 0,8 | 300 | indexado | no (`federation`, `season`) |
| `partidos-de-persona` | 7,8 | 300 | indexado | no (`season`) |
| `club-por-id` | 0,6 | 100 | indexado | no |
| `equipos-del-club` | 9,4 | 300 | indexado | no |
| `partidos-de-grupo` | 3,3 | 800 | indexado | no (`federation`) |
| `eventos-del-grupo` | 0,7 | 300 | indexado | no |
| `goleadores-de-estadísticas` | 5,4 | 500 | indexado | no (`federation`, `season`) |
| `historial-de-jugador` | 6,2 | 400 | indexado | no (`season`) |
| `historial-del-equipo` | 2,1 | 250 | indexado | no |
| `historial-del-club` | 19,9 | 400 | indexado | no (`season`) |
| `arbitro-por-id` | 3,5 | 400 | indexado | no |
| `entrenador-por-id` | 2,6 | 400 | indexado | no |
| `delegado-por-id` | 1,9 | 400 | indexado | no |

**Conclusión de índices:** las 23 consultas que sirven la API están dentro de presupuesto y ninguna
recorre entera una tabla de hechos. **No se añade ningún índice y no hay migración nueva**; si el
volumen crece, el primer sitio donde mirar es `partidos-del-calendario` (30 ms con la primera página de
una federación; su presupuesto es 800) y el historial de club (20 ms con 500 inscripciones).

### Etag / 304 verificado con curl

- `304` con `If-None-Match` en acta, competición, calendario y las tres fichas (8/8 condicionales por
  recurso en la medición) y en las siete rutas nuevas (5/5 por recurso).
- `400` para id inválido, filtro mal formado y fecha imposible.
- `404` para competición inexistente, partido sin acta (940046), acta `unavailable` (453933), persona o
  equipo inexistente, y **un jugador en la ficha de árbitro** (1181455): no se inventa una ficha vacía.
- `401` en revalidar sin secreto; `200` con secreto y `maximo=0`.
- `429` con `Retry-After` tras 300 peticiones en el mismo minuto desde una IP simulada.

## 5. Pruebas

`apps/web/test/api-v1.test.ts` (26 pruebas):

- envoltorio, versión, ETag estable, 304, `If-None-Match` con listas y `W/`, errores con código;
- una fecha `timestamptz` se serializa igual venga de la caché o del cálculo (el ETag no cambia entre
  MISS y HIT: se detectó en la primera medición y está corregido);
- paginación y validación del calendario (parámetro culpable en el 400);
- etiquetas de caché y derivación (`grupo:*` → `acta`, `calendario`);
- contra el canónico (si está disponible): 200/400/404 de competición, acta, calendario y las tres
  fichas; 304 real; 401 de revalidar y 200 con `maximo=0` **sin consumir la cola real**; una respuesta
  pública no lleva campos de cuenta;
- límite por IP (300 permitidas, 429 con `Retry-After`) y `X-Forwarded-For`.

`apps/web/test/api-v1-ampliacion.test.ts` (12 pruebas):

- índice: las siete rutas nuevas están anunciadas como `disponible`;
- etiquetas nuevas (`grupo:* + estadisticas`, `persona|equipo|club:* + historiales`,
  `persona:* + oficiales`) y su derivación;
- contra el canónico: estadísticas de 3769 (32 partidos, 135 goles, goleadores), 304 real, 400 y 404;
- historial de jugador 1181455 (144 apariciones), historial de equipo 17609 y de club 1495; 400/404;
- oficiales: árbitro 657011, entrenador 1251791, delegado 1072476; 404 para un jugador en la ficha de
  árbitro y un id inexistente; 400 con id mal formado;
- ninguna respuesta nueva contiene campos de cuenta (usuario, favoritos, sesión, token).

Además: `pnpm exec vitest run apps/web/test` y `pnpm --filter @facylf/web exec tsc --noEmit`.

## 6. Pendientes y decisiones para el Lead

1. **Cola de invalidaciones con 1,7 M de pendientes** (ver §3). Se vacía sola; si se quiere acelerar,
   repetir `POST /api/revalidar?maximo=10000`. No se ha tocado ni borrado nada.
2. **Llamada del proyector al endpoint**: `scripts/proyectar-lectura.mjs` ya escribe las etiquetas, pero
   no llama a `POST /api/revalidar`; el temporizador de la web las recoge igualmente cada minuto. Si se
   quiere refresco inmediato, es una línea en ese script (fuera del alcance de esta tarea).
3. **Estadísticas, historiales y oficiales ya implementados** (ver §2). No queda contrato reservado en
   la API v1; lo que faltan son las decisiones de producto sobre qué más abrir.
4. **Tamaño del historial de club**: 269 KB con 500 inscripciones. Se sirve entero porque es el mismo
   dato que la pantalla; si se consume desde fuera con frecuencia, conviene paginar por temporada o por
   equipo (no se ha hecho porque cambiaría el contrato ya publicado y no hay necesidad medida).
5. **Invalidación amplia**: las rutas nuevas usan etiquetas derivadas (`estadisticas`, `historiales`,
   `oficiales`) que se refrescan con cualquier cambio de grupo/equipo/club/persona. Es más coste de
   cálculo y nunca un dato viejo; si el tráfico crece, se puede afinar por grupo en los historiales.
6. **Enlaces de navegación**: la API no toca pantallas; los enlaces `web` de cada recurso se pueden usar
   cuando el Lead integre fichas/acta.
7. **Apertura exterior / CORS**: hoy no hay CORS abierto; abrir la API a otros orígenes exige decidir
   antes el proxy y el límite real.
8. **Paginación**: el calendario usa `offset` (la consulta existente). Para más de ~10 páginas conviene
   migrarla a paginación por clave; queda anotado en `RENDIMIENTO-BASE.md` §3.8.
