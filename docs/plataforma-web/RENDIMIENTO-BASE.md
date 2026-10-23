# Rapidez de la base de datos — medida, arreglos y reglas

> Claude, 22/10/2026. David: «es crucial que todas estas consultas estén optimizadas… es la parte vital».
> Todo lo de aquí está medido, no supuesto. Migración: `0036-rendimiento-ojeo-y-lecturas.sql`.

## 1. Cómo se mide (y cómo repetirlo)

```bash
# 1) base de volumen inventada: 3 federaciones (una sin cambios ni tarjetas, como Cataluña), 2 temporadas,
#    32.760 partidos, 685.440 apariciones, 210.031 eventos, 33.060 personas, proyectada como en producción
node pruebas/sql/volumen.mjs /tmp/facylf-volumen 14          # ~6 min
# 2) EXPLAIN ANALYZE de las 53 consultas de la web (apps/web/src/consultas/*.ts)
node --experimental-strip-types pruebas/sql/rendimiento.mjs /tmp/facylf-volumen
```
Por cada consulta: tiempo (mediana de 3 tras calentar), presupuesto, recorridos completos (Seq Scan) de tablas
grandes y — clave — si **existe camino por índice** (se repite el plan con `enable_seqscan = off`: si el Seq
Scan sigue, falta un índice). Con poco volumen PostgreSQL prefiere recorrer tablas pequeñas aunque haya
índice; eso no es un problema, la falta de índice sí. PGlite (PostgreSQL en WebAssembly) es ≈ ×2-4 más lento
que el nativo: los tiempos valen para comparar.

En la base real, la misma regla con `node scripts/planes.mjs` (ya existía; ahora incluye usuario y admin).

## 2. Lo que se encontró y cómo quedó

| Qué | Antes | Después | Causa | Arreglo |
|---|---|---|---|---|
| **Ojeo (buscador de talento)**, una federación | **93.336 ms** | **44 ms** | la vista recalculaba a todo el país en cada búsqueda y, por cada jugador, volvía a recorrer todas las temporadas de todos (coste cuadrático) | tabla `analytics.ojeo_jugador` precalculada por el proyector, sólo para las personas tocadas; temporadas previas con ventanas |
| Ojeo, toda España | 652 ms (y crece con el volumen) | **48 ms** (no crece) | percentiles calculados sobre todos los filtrados | puntuación precalculada por quinta (temporada + año de nacimiento) en toda España; la búsqueda lee en orden por índice y se para en 50 |
| Chequeos de salud en vivo (panel) | 1.432 ms | 141 ms | leían la vista del ojeo | ídem |
| Proyección de un grupo | 871 ms | 207 ms | `match_id in (select … from partidos)` con CTE: el planificador recorría los 210.000 eventos | partidos y equipos en arrays (`= any(v_ids)`) → índice |
| Capacidad de una edición (0032) | 718 ms | ≈ 60 ms | mismo patrón: recorría las 685.000 apariciones | ídem |
| Temporadas por persona (2.000) | 9.494 ms | 1.209 ms | subconsultas correlacionadas sobre CTE + cruce de todos con todos por estimación ciega | agregaciones en una pasada + tabla temporal con estadísticas |
| **Buscador por nombre** con 2 millones de personas («garcía») | **6.643 ms** (y sin acabar con la primera versión nueva) | **≈ 0,9 s en PGlite** (un hilo; en PostgreSQL bastante menos) | `like '%texto%'` con trigramas: 462.555 coincidencias ordenadas y contadas enteras | 0041: índice de palabras `analytics.search_palabra`; se empieza por la palabra escrita con menos coincidencias (contadas con tope) y se toman las 5.000 más populares; total acotado «más de 5.000» |
| Buscador, nombre y apellido comunes («hugo garcía», «garcía lópez») | 0,8 s y **resultados incompletos** (sólo entre los 5.000 más populares de una palabra) | **0,4-0,5 s y completos** | las dos palabras pasaban del tope de 5.000 | 0045: índice de pares de palabras seguidas `analytics.search_par`; se parte del par cuando todas las palabras solas pasan del tope |

Resultado: **53 consultas, todas dentro de presupuesto, mediana 7 ms**; las más lentas son de administración
(resumen del canónico 144 ms, casos 103 ms). Cada arreglo se comprobó **fila a fila** contra el cálculo
anterior (0 diferencias en 40.320 filas jugador-equipo, 27.090 jugador-temporada, 90 ediciones).

## 3. Reglas para cualquier consulta o función nueva (DeepSeek: cúmplelas)

1. **Nunca `x in (select … from cte)` sobre una tabla de hechos** (match, appearance, match_event,
   match_official, match_report). En funciones: guardar los ids en un array (`select array_agg(id) into v_ids`)
   y filtrar con `= any(v_ids)`. En consultas de la web: filtrar por la columna indexada directamente.
2. **Nunca una subconsulta correlacionada sobre un CTE** (`(select sum(…) from cte x where x.id = f.id)`):
   agregar una vez con `group by` y unir.
3. **Si una función reutiliza un conjunto intermedio grande varias veces**, tabla temporal + `analyze`
   (el planificador sabe cuántas filas hay). Un CTE usado varias veces se materializa sin estadísticas.
4. **Una vista que agrega todo el país no se consulta desde la web.** Se precalcula en `analytics.*` y la
   rellena el proyector de forma incremental (por grupo o por persona tocada).
5. **Ordenar + limitar sobre conjuntos grandes = índice en el orden** (como `ojeo_puntuacion_idx`).
   Los percentiles y rankings se precalculan; la web no ordena cientos de miles de filas.
6. **Totales acotados**: `(select count(*) from (select 1 … limit 1001) z)` y «más de 1.000» en pantalla.
7. **Cada consulta nueva**: presupuesto, plan `indexado`/`agregado`, parámetros de ejemplo, y pasar
   `rendimiento.mjs` (volumen) y `planes.mjs` (base real) antes de darla por buena.
8. **Paginación por clave**, no `offset` grande, en listados que puedan pasar de 10 páginas
   (`where (fecha, id) < ($ultima_fecha, $ultimo_id) order by fecha desc, id desc limit 50`).
9. **`like` con un patrón que no es constante no usa un índice `text_pattern_ops`.** Prefijo calculado →
   rango: `palabra ~>=~ w and palabra ~<~ (w || '{')` (los nombres normalizados sólo llevan `[a-z0-9 ]`).
10. **Cuando el planificador cree que sale 1 fila** (CTE con `distinct on`, anti-join…) un `left join` a una
    tabla grande puede acabar en recorrido completo POR CADA fila real. Uniones por clave a tablas grandes
    tras un CTE así: `left join lateral (select … where id = c.id limit 1) x on true` (no se aplana y va por la
    clave). Fue lo que colgaba el buscador: 5.000 candidatos × 2 millones de personas.
11. **Sin barras invertidas dentro del SQL de una plantilla de JS** (`sql: \`…\``): `'\s+'` llega a PostgreSQL
    como `'s+'` (0041 partía los nombres por cada «s»). Clases POSIX (`[[:space:]]`) o `E'…'` fuera de la plantilla;
    m45 lo comprueba evaluando la consulta como lo hace la web.

## 4. Caché de la web (código en `docs/plataforma-web/codigo/cache.ts`)

- Lo público (fichas, clasificaciones, actas, rankings) se cachea **por etiqueta y sin caducidad**:
  `grupo:12`, `grupo-externo:cyl:11379752`, `equipo:345`, `club:6`, `persona:789`, `edicion:3`,
  `federacion:cyl`, `rankings`, `ojeo`.
- El proyector, al proyectar un grupo, apunta sus etiquetas en `ops.invalidacion` (`ops.invalida_grupo`) y
  avisa a la web (`POST /api/revalidar`); la web llama a `revalidateTag`. Si estaba parada, las recoge al
  arrancar y cada minuto. Vigilancia: chequeo `cache_sin_refrescar` (0035).
- Lo del usuario (Mi panel, avisos) y lo que depende de permisos (nombres de menores) **no** se comparte
  en caché. `/admin` sin caché.
- Efecto: la base sólo trabaja cuando hay datos nuevos; una ficha visitada mil veces se calcula una vez.

## 5. PostgreSQL del PC (`infra/docker-compose.yml`)

Lo actual es razonable (shared_buffers 1 GB, work_mem 32 MB, effective_cache_size 3 GB, random_page_cost 1.1,
pg_stat_statements, log de sentencias > 500 ms). Cuando la base nacional esté cargada, ajustar según la RAM
**que se le pueda dar al contenedor** sin pasar las guardias del PC (memoria libre ≥ 3 GiB siempre):

| RAM para PostgreSQL | shared_buffers | effective_cache_size | work_mem | maintenance_work_mem |
|---|---|---|---|---|
| 4 GB | 1 GB | 3 GB | 32 MB | 512 MB |
| 8 GB | 2 GB | 6 GB | 48 MB | 1 GB |
| 16 GB | 4 GB | 12 GB | 64 MB | 2 GB |

Además, sin coste: `jit = off` (consultas cortas: el JIT añade 50-200 ms y no compensa),
`max_parallel_workers_per_gather = 2`, `autovacuum_vacuum_scale_factor = 0.05` y
`autovacuum_analyze_scale_factor = 0.02` en las tablas grandes (`alter table … set (…)`: con 50 M de filas, el
20 % por defecto es esperar a 10 M de cambios), y `log_min_duration_statement = 300` cuando la web esté en
marcha. **No cambiarlo sin decírselo a David** (reiniciar el contenedor corta los recolectores del PC).

Conexiones: la web con un `Pool` de 10 como mucho (rol facylf_app, `statement_timeout = 5s`); el proyector y
los scripts, una conexión cada uno. `max_connections = 50` sobra. Si algún día hay muchas visitas, PgBouncer
en modo transacción delante.

## 6. Qué queda por medir en la base real (DeepSeek)

1. Tras aplicar 0036 y proyectar: `node scripts/planes.mjs` → pegar la tabla en ESTADO-DEEPSEEK.
2. `select query, calls, mean_exec_time, rows from pg_stat_statements order by total_exec_time desc limit 20;`
   tras un día de uso: lo que salga arriba es lo siguiente a mirar.
3. Tamaño de `analytics.ojeo_jugador` y tiempo de `analytics.puntua_ojeo` de la temporada en curso (la tarea
   horaria «FACyLF ojeo»): si pasa de 60 s, avisar.
