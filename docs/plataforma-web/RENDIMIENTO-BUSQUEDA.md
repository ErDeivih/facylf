# Rendimiento, consultas, búsqueda y caché

## 1. Regla general

No optimizar por intuición ni añadir índices “por si acaso”. Cada recorrido importante mantiene:

- consulta representativa con volumen parecido al objetivo;
- presupuesto p50/p95;
- `EXPLAIN (ANALYZE, BUFFERS)` en un entorno no productivo;
- prueba que evita N+1 y resultados sin límite;
- métrica en `pg_stat_statements` cuando haya servidor.

### Cómo se comprueba aquí (14/9/2026)

Toda consulta de la web declara en su catálogo —`apps/web/src/consultas/`— tres cosas: `presupuestoMs`,
`plan` (`indexado` o `agregado`) y las columnas que promete. Con eso:

```bash
pnpm planes            # mide con EXPLAIN (ANALYZE, BUFFERS) y compara con lo guardado
pnpm planes --guardar  # vuelve a guardar los planes (después de mirar por qué cambiaron)
```

- **Presupuesto**: si una consulta tarda más que su presupuesto, `pnpm planes` falla.
- **Recorrido**: una consulta marcada `indexado` (las que filtran por federación y grupo, que son las
  que ve el visitante en una ficha) **no puede** acabar en un `Seq Scan` sobre una tabla de hechos
  (partidos, participaciones, eventos, fichas, actas, árbitros). Las `agregado` (recuentos globales y
  cobertura por federación) recorren tablas enteras porque es lo que piden, y sólo las usa la página de
  diagnóstico.
- **Forma del plan**: se guarda en `pruebas/planes/<consulta>.json`. Si cambia, `pnpm planes` falla con
  el antes y el después, para que alguien mire por qué en vez de actualizar el fichero sin pensar.
- En `pnpm test` se defiende lo que no necesita PostgreSQL: que toda consulta declara presupuesto, tipo
  y columnas, que ninguna se queda sin `LIMIT`, que los planes guardados existen y que ninguna consulta
  indexada tiene un recorrido completo guardado.

Medido el 14/9/2026 con 22 grupos, 6.483 partidos, 160.450 participaciones y 106.037 eventos:

| consulta | tiempo | presupuesto |
|---|---|---|
| `resumen-canónico` (agregada, diagnóstico) | 48 ms | 2.000 ms |
| `cobertura-por-federación` | 0,3 ms | 800 ms |
| `cobertura-por-grupo` | 0,4 ms | 800 ms |
| `grupos-del-canónico` | 0,2 ms | 300 ms |
| `partidos-de-grupo` | 5,1 ms | 800 ms |
| `goles-de-partidos` | 8,3 ms | 800 ms |
| `grupo-del-canónico` | 0,2 ms | 300 ms |
| `clasificación-del-grupo` | 0,4 ms | 500 ms |

Todas dentro de presupuesto y ninguna indexada recorriendo tablas de hechos. Las cifras son de esta
máquina (la que también recolecta, así que son pesimistas): lo que prohíbe la skill aquí es Lighthouse,
Playwright y las pruebas de carga, no unos cuantos `EXPLAIN` de milisegundos.

PostgreSQL recuerda que los índices aceleran lecturas pero añaden coste de escritura y espacio; los
multicolumna son más eficaces cuando sus columnas iniciales coinciden con filtros reales. Véanse
[índices](https://www.postgresql.org/docs/18/indexes.html) e
[índices multicolumna](https://www.postgresql.org/docs/18/indexes-multicolumn.html).

## 2. Formas de consulta principales

| Recorrido | Filtros/orden dominantes |
|---|---|
| competición | federación, temporada, ámbito, provincia, categoría, nombre |
| jornadas | `phase_group_id`, número |
| partidos | grupo + jornada; equipo + fecha descendente |
| acta | `match_id` o referencia externa completa |
| plantilla | `team_entry_id`, persona |
| trayectoria | `person_id`, temporada descendente, equipo |
| rankings | edición/grupo, métrica y mínimo de cobertura |
| búsqueda | nombre normalizado + tipo + facetas |

Los índices se diseñan para estas formas, no para cada columna aislada.

## 3. Índices iniciales

DDL orientativo; los nombres finales dependen de la migración:

```sql
create unique index external_ref_scope_uq
  on source.external_ref(federation_id, entity_type, external_id, context_key);

create index edition_filters_idx
  on core.competition_edition(federation_id, season_id, scope, category_id);

create index group_edition_idx
  on core.phase_group(competition_edition_id, sort_order, id);

create unique index match_group_matchday_order_uq
  on core.match(phase_group_id, matchday_id, source_order);

create index match_team_date_idx
  on core.match(home_team_entry_id, played_at desc, id);
create index match_away_team_date_idx
  on core.match(away_team_entry_id, played_at desc, id);

create index appearance_person_season_idx
  on core.appearance(person_id, season_id desc, team_entry_id);
create index appearance_team_match_idx
  on core.appearance(team_entry_id, match_id, condition);

create index event_person_type_idx
  on core.match_event(person_id, event_type, match_id);
create index event_match_minute_idx
  on core.match_event(match_id, minute_base, minute_added, source_order);

create index standings_group_day_idx
  on core.standing_snapshot(phase_group_id, matchday_id, position);

create unique index coverage_group_uq
  on ops.coverage_checkpoint(phase_group_id);
```

Los listados por local y visitante suelen funcionar mejor con dos índices y `UNION ALL` que con una
condición `home_id = ? OR away_id = ?`. Se verifica con el plan real.

Índices parciales útiles sólo cuando su subconjunto se consulta mucho:

```sql
create index match_pending_idx on core.match(played_at, id)
  where official_status in ('scheduled','postponed');
create index reports_review_idx on core.match_report(updated_at desc, match_id)
  where quality = 'review';
```

## 4. Búsqueda de nombres

Crear `analytics.search_entity` como proyección compacta:

```text
entity_type, entity_id, display_name, normalized_name,
federation_id, season_from, season_to, province_id,
club_id, team_context, popularity, visibility, updated_at
```

Normalización determinista:

- Unicode NFKD y eliminación de diacríticos para la clave auxiliar;
- minúsculas y espacios/puntuación normalizados;
- conservar siempre el literal original para mostrar;
- alias como filas separadas que apuntan a la misma entidad;
- no eliminar sufijos B/C ni categorías del contexto del equipo.

Índices:

```sql
create extension if not exists pg_trgm;
create index search_name_trgm_idx
  on analytics.search_entity using gin (normalized_name gin_trgm_ops);
create index search_facets_idx
  on analytics.search_entity(entity_type, federation_id, season_to desc);
```

`pg_trgm` soporta similitud y búsquedas `LIKE`/`ILIKE` indexadas, apropiadas para errores cortos y
nombres sin tildes. La búsqueda textual GIN se reserva para documentos con varias palabras o notas;
no sustituye la similitud de nombres. Fuentes:
[pg_trgm](https://www.postgresql.org/docs/18/pgtrgm.html) y
[Full Text Search](https://www.postgresql.org/docs/18/textsearch.html).

### Ranking de resultados

Orden recomendado:

1. igualdad de nombre normalizado;
2. prefijo de palabra;
3. similitud trigram;
4. coincidencia de alias;
5. contexto de federación/temporada seleccionado;
6. actividad reciente y popularidad limitada;

Nunca elevar popularidad por encima de una coincidencia nominal claramente mejor. Para consultas de
uno o dos caracteres se exige prefijo y un límite pequeño; no se ejecuta similitud sobre todo el
índice.

## 5. Agregados

No calcular una carrera o clasificación histórica leyendo todos los eventos en cada visita.

Dos estrategias válidas:

- tablas agregadas incrementales: preferidas cuando cada lote conoce las entidades cambiadas;
- vistas materializadas: útiles para agregados globales que pueden refrescarse por lotes.

Las vistas materializadas guardan físicamente el resultado y pueden refrescarse; PostgreSQL las
documenta en [Materialized Views](https://www.postgresql.org/docs/18/rules-materializedviews.html).
Para este proyecto, las tablas incrementales permiten actualizar sólo un grupo/equipo/persona y
evitan refrescar millones de filas por cada acta.

Cada agregado tiene clave única por su grano. Ejemplo:

```text
player_team_season_summary(
  person_id, season_id, team_entry_id, competition_edition_id,
  callups, appearances_confirmed, starts, minutes_exact,
  minutes_estimated, goals, penalties, own_goals, yellows, reds,
  eligible_matches, covered_matches, metric_version, source_data_version
)
```

## 6. Paginación y exportación

- Cursor estable (`sort_value`, `id`) para partidos, jugadores y resultados de búsqueda.
- `OFFSET` sólo para listas pequeñas o navegación a pocas páginas.
- límites máximos en servidor, aunque el cliente envíe otro valor.
- orden total y determinista para evitar duplicados entre páginas.
- exportaciones CSV/JSON grandes como trabajo en segundo plano, con archivo temporal y caducidad.

## 7. Caché de Next.js

Situación actual: `repositorio-local.ts` llama `noStore()` y abre SQLite; por ello `revalidate = 60`
en las páginas no aporta la caché esperada. Es correcto mientras cambia la ingesta local, pero no
para el servidor final.

Objetivo:

- deduplicación por render con `cache()` de React;
- caché persistente de consultas públicas/privadas no personalizadas;
- etiquetas `federation:{id}`, `edition:{id}`, `team:{id}`, `person:{id}`;
- invalidación del publicador sólo tras confirmar el lote canónico;
- `stale-while-revalidate` para históricos;
- TTL corto o etiqueta de jornada para competiciones activas;
- datos personalizados de scouting fuera de cachés compartidas.

La API exacta depende de la versión de Next. La aplicación está en Next 15: no copiar ejemplos de
Next 16 (`use cache`/Cache Components) sin hacer primero una migración controlada. Documentación:
[modelo de caché anterior](https://nextjs.org/docs/app/guides/caching-without-cache-components) y
[revalidación actual](https://nextjs.org/docs/app/getting-started/revalidating).

En despliegues con varias instancias, las etiquetas necesitan caché compartida o coordinación; la
[guía de self-hosting](https://nextjs.org/docs/app/guides/self-hosting) lo exige para evitar que una
instancia siga sirviendo datos obsoletos.

## 8. API/BFF

Las páginas llaman funciones de servidor tipadas. Sólo se exponen endpoints para autocompletado,
comparación dinámica o clientes futuros. Reglas:

- esquemas de entrada y allowlists para filtros/orden;
- consultas parametrizadas;
- no aceptar fragmentos SQL, nombres de columna arbitrarios ni rutas de archivo;
- respuesta con `data`, `pageInfo`, `coverage` y `sourceVersion`;
- cancelación/timeout de consulta;
- rate limit para búsquedas anónimas si la instancia se expone;
- errores con código estable, sin SQL, rutas o trazas.

## 9. Particionado

No particionar desde el día uno. Considerarlo cuando una tabla concreta supere decenas de millones
de filas, el mantenimiento lo justifique y las consultas siempre incluyan la clave de partición.
Posible clave: temporada o federación + temporada para eventos/participaciones. Antes se mide:

- tamaño e índices por tabla;
- porcentaje de consultas que filtra la clave;
- tiempo de vacuum y creación de índices;
- coste de consultas que cruzan temporadas.

Particionar mal multiplica índices y complica claves únicas sin acelerar las consultas globales.

## 10. Observabilidad y límites

- habilitar `pg_stat_statements` para tiempo total, media, p95 aproximado y llamadas;
- registrar duración, filas y nombre lógico de consulta, nunca el nombre buscado si es dato personal;
- trazas de publicador → invalidación → consulta con identificador de lote;
- alertar por p95, errores, conexiones agotadas y retraso del publicador;
- `EXPLAIN` y `ANALYZE` después de grandes importaciones para estadísticas del planificador.

Fuentes: [`pg_stat_statements`](https://www.postgresql.org/docs/18/pgstatstatements.html),
[`EXPLAIN`](https://www.postgresql.org/docs/18/sql-explain.html) y
[OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/).

## 11. Pruebas de carga mínimas

Con una copia anonimizada o local:

- 50 búsquedas concurrentes de nombres comunes;
- abrir una competición con 30 jornadas y rankings;
- perfil de jugador con 10 temporadas y varios equipos;
- listado global con todas las facetas;
- actualización de un lote mientras se leen páginas;
- consulta sin resultados y texto de 2/100 caracteres;
- regresión del plan: ningún `Seq Scan` masivo inesperado en recorridos críticos.

Los objetivos de experiencia se miden también en campo con LCP, INP y CLS; no basta Lighthouse.
