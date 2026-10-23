# Encargo para DeepSeek — revisar, rematar y dejar listo todo lo de Claude (23/10/2026)

> **David, 23/10, 09:07:** «que DeepSeek revise todas las rondas, revise todos los códigos, comitee y lo ponga
> todo listo; y lo que esté sin hacer, que lo haga si lo considera necesario».
>
> Esto es el **punto de entrada** para la revisión, los commits y la **plataforma** (base de datos, web, usuarios,
> panel). Dice qué hizo Claude entre el 21 y el 23/10, cómo revisarlo, qué riesgos conoce y no pudo comprobar,
> cómo hacer los commits sin subir nada que no deba, y qué queda por hacer con su criterio de «terminado».
>
> Hay **dos documentos de traspaso del 23/10**, de dos sesiones de Claude, y se leen los dos:
> - **este** (plataforma, revisión de todo el código y commits);
> - [`TRASPASO-DEEPSEEK-2026-10-23.md`](TRASPASO-DEEPSEEK-2026-10-23.md) (ingesta: recolectores, vigía, Cataluña,
>   Madrid, Valencia, despliegue al servidor, canal de avisos, reimportaciones).
> Donde aquel dice «sin commits», manda la petición nueva de David: **sí hay commits** (§3). Donde dice
> «migraciones 0023-0042», ahora son **0023-0045**.
>
> El detalle de cada paso de ejecución de la plataforma sigue en [`PLAN-DEEPSEEK.md`](PLAN-DEEPSEEK.md)
> (fases A-E); aquí no se repite, se enlaza.

## 0. Antes de empezar

**Orden de lectura** (1 hora; no te saltes ninguno):
1. Este documento entero.
2. [`AGENTS.md`](../../AGENTS.md) y `CLAUDE.md` — reglas de todo el repositorio.
3. [`PLAN-DEEPSEEK.md`](PLAN-DEEPSEEK.md) — qué ejecutar y en qué orden (§1 tiene la lista de ficheros).
4. [`RENDIMIENTO-BASE.md`](RENDIMIENTO-BASE.md) §3 — las 11 reglas para que una consulta sea rápida.
5. [`GOAL-CLAUDE-2026-10-22.md`](GOAL-CLAUDE-2026-10-22.md) — la lista de lo hecho, bloque a bloque.
6. Por encima: `PLATAFORMA-NACIONAL.md`, `CASUISTICAS.md`, `COBERTURA-FEDERACIONES.md`, `ADMINISTRACION.md`,
   `PUBLICIDAD.md`, `ESTADOS-VACIOS.md`, `GRAFICOS.md`, `INGRESOS.md`, `DESPLIEGUE-CONTINUO.md`.

**Reglas que no cambian** (si una tarea de aquí choca con una, gana la regla y lo anotas):
- El PC y el servidor **no se sobrecargan**: un proceso pesado cada vez; parar si hay menos de 3 GiB libres,
  más de 1 GiB de swap o carga > 14. Lo nuestro espera a la recolección.
- No se baja ninguna pausa de recolector ni se esquiva ningún bloqueo.
- **Copia antes de tocar datos** (`node scripts/copia-seguridad.mjs`).
- **Migraciones:** una migración YA APLICADA en la base real no se edita nunca; se corrige con otra nueva. Las
  0023-0045 **aún no se han aplicado** en la base real (compruébalo con `pnpm db:estado`): mientras no lo
  estén, si encuentras un fallo puedes corregir el propio fichero, volver a pasar sus pruebas y anotarlo. En
  cuanto una esté aplicada, sólo migración nueva.
- **Menores:** nada con nombres de menores sale del PC. **Un `git push` a GitHub ES sacarlo del PC** (§3).
- No se inventa ningún dato; desconocido ≠ 0.
- Docker: nada de `docker cp` de código ni `docker compose up -d` sin lista de servicios; no tocar
  `infra/docker-compose.yml` sin David.
- La publicidad se queda **apagada**.

## 1. Qué hizo Claude (21-23/10), por rondas

Todo está en el PC (`F:\EspacioCodigo\facylf`), **sin commit**. Probado en PostgreSQL embebido (PGlite 0.5) con
285 comprobaciones y un banco de volumen inventado (33.000 partidos y 685.000 apariciones; y otro de 2 millones
de personas para el buscador). **No se ha probado contra el PostgreSQL 18 real** (Claude no llega a Docker):
eso es lo primero que tienes que hacer tú (§2, R2).

### 1.1 Migraciones (en orden; todas aditivas y repetibles)

| Migración | Qué hace | Prueba |
|---|---|---|
| 0016-0022 | clave de aparición con condición, escudos, plantillas publicadas, estados y corte de la tabla oficial (rondas anteriores) | `pnpm test` |
| 0023 | modelo de lectura `analytics.*` (fichas instantáneas) | m29 |
| 0024 | identidad de jugadores entre federaciones (candidatos, decisiones) | m29 |
| 0025 | división de la competición (escalón, provincia) | m29 |
| 0026 | evolución de equipos y zonas de la clasificación | m29 |
| 0027 | usuarios, roles, paquetes (esencial/ojeador/analista), `app.puede` | m31 |
| 0028 | capa de análisis | m29 |
| 0029 | minutos v2, sanciones inferidas, posiciones, árbitros, base del ojeo; `version_metricas` = 2 | m29 |
| 0030 | observabilidad: eventos, tiempos, web vitals, copias, chequeos, alertas, purga | m30 |
| 0031 | registro con invitación/aprobación, favoritos (el equipo como *línea*), avisos | m31 |
| 0032 | capacidad de datos por edición, minutos nulos sin cambios, casos de datos; `version_metricas` = 3 | m32 |
| 0033 | huecos de publicidad (apagados), campañas directas | m33 |
| 0034 | auditoría de administración (autor, antes, después) | m34 |
| 0035 | vigilancia de la plataforma; **arregla 0030** (`pg_stat_statements` sin precargar tumbaba todos los chequeos) | m35 |
| 0036 | **rapidez**: ojeo precalculado (93 s → 0,05 s), proyección ×4, capacidad ×10, temporadas ×8; caché por etiquetas (`ops.invalidacion`) | m36 + rendimiento |
| 0037 | Mi cuenta: perfil, preferencias, favoritos sin duplicados (**arregla 0031**), exportar datos, baja | m37 |
| 0038 | perfil de las 24 fuentes + `analytics.avisos_de_datos` (la web no lleva `if` por federación) | m38 |
| 0039 | métricas de uso propias | m39 |
| 0040 | tanda de penaltis, ganador de eliminatoria, caso P4 | m40 |
| 0041 | buscador por palabras (`analytics.search_palabra`): «garcía» 6,6 s → 0,9 s con 2 M de personas | m41 |
| 0042 | publicidad medida: servidas / vistas / clics validados, reparto de campañas, interruptor, informe | m42 |
| 0043 | ciclo de cuentas: invitaciones personales y anulables, rechazo y bloqueo con motivo, caducidad, `app.estado_acceso`, freno por contraseñas fallidas, administradores sin 2FA | m43 |
| 0044 | estados de página: sin calendario / empieza el… / pendiente / no publicado | m44 |
| 0045 | buscador por pares de palabras («hugo garcía» completo y en 0,4-0,5 s) | m45 |

### 1.2 Web (consultas listas; pantallas en la fase C)

- `apps/web/src/consultas/`: `entidades.ts` (buscador nuevo), `ojeo.ts`, `identidad.ts`, `paneles.ts`,
  `analisis.ts`, `usuario.ts`, `admin.ts` (19 consultas del panel + la lista de escrituras en el comentario
  final), `federaciones.ts` (avisos, ficha, estados de sección). **66 consultas** (con la variante nacional del ojeo), todas dentro de
  presupuesto en el banco de volumen (mediana 7 ms).
- `apps/web/src/lib/observabilidad.ts`, `lib/federaciones-excluidas.ts`.
- `docs/plataforma-web/codigo/` — código de la fase C que **aún no compila** porque `better-auth` no está
  instalado (por eso vive fuera de `apps/web`): `auth.ts`, `acceso.ts`, `acciones-usuario.ts`,
  `acciones-admin.ts`, `anuncio.tsx`, `estado-seccion.tsx`, `cache.ts`, `proxy.ts`, `sw.js`,
  `push-cliente.ts`, `e2e/usuarios.spec.ts` y `github-workflows/*.yml`.

### 1.3 Scripts

`proyectar-lectura.mjs` (capas 0029-0040, ojeo, invalidación de caché, casos), `vigilancia-plataforma.mjs`,
`copia-seguridad.mjs`, `mantenimiento-bd.mjs`, `notificaciones.mjs` (+ correos de cuenta y avisos de caducidad,
23/10), `planes.mjs` (todas las consultas), `despliega-plataforma.mjs` (azul/verde con vuelta atrás, probado en un
repositorio de prueba), `registrar-tareas-plataforma.ps1`, `rellena-posiciones.mjs`,
`consolida-clubes-comillas.mjs`, `reclasifica-ediciones.mts`.

### 1.4 Pruebas y documentos

- `pruebas/sql/m29…m45.mjs` + `analisis.mjs` (285 comprobaciones), `volumen.mjs` (base inventada a escala) y
  `rendimiento.mjs` (EXPLAIN de las 66 consultas; sale con error si hay un recorrido completo de una tabla grande).
  Cómo ejecutarlas: `pruebas/sql/README.md`.
- Documentos nuevos en `docs/plataforma-web/` (todos enlazados desde AGENTS.md o desde PLAN-DEEPSEEK).
- Prototipo de diseño (artefacto privado de David «Plataforma de fútbol federado — prototipo», 22 tableros,
  **datos inventados**): es la referencia visual de la fase C.

## 2. La revisión (hazla antes de ningún commit)

Anota cada punto en `ESTADO-DEEPSEEK.md` con ✓ / ✗ y la salida pegada.

**R1 · Pruebas de siempre.** `pnpm test`, `pnpm lint`, `node --test scripts/lib/*.test.mjs`. Esperado: verde
(`scripts/lib`: 219 pruebas, 218 bien y una omitida a propósito, según TRASPASO T1). Lo que falle, ¿es de esta entrega o ya fallaba? Míralo con
`git stash` sólo si hace falta y sin perder nada.

**R2 · Migraciones en un PostgreSQL 18 LIMPIO, dos veces.** Nunca contra la base de verdad para esto. Crea una
base de prueba vacía en el mismo contenedor (`create database facylf_prueba`) y aplica 0001-0045 dos veces
(es lo que hace el trabajo «migraciones» de `github-workflows/test.yml`). Esperado: la segunda pasada no da
error (todas son repetibles). Cuidado con:
- 0030/0035: `pg_stat_statements` y `pg_monitor`.
- 0043: funciones `security definer`: el dueño debe ser el rol que migra (`facylf_admin`); y el `delete from
  auth.session where "userId" = …` sólo se ejecuta si existe la tabla de Better Auth (el nombre de la columna
  hay que confirmarlo con la versión que instales en la fase C).
- 0041/0045: el relleno inicial de los índices del buscador tarda ~1,5 min por cada 2 millones de nombres.
Si algo falla: corrige el fichero (aún no aplicado), repite R2 y las pruebas de §R3, y anótalo.

**R3 · Pruebas SQL.** `pruebas/sql/README.md`: instala `@electric-sql/pglite@0.5` en una carpeta fuera del
repositorio si npm no deja, y pasa `m29 … m45` y `analisis`. Esperado: todas «TODO OK», 285 ✓. Después, el banco:
`node pruebas/sql/volumen.mjs <carpeta> 14` (≈ 6 min, ~1 GB) y
`node --experimental-strip-types pruebas/sql/rendimiento.mjs <carpeta>` → «66 consultas · 0 a revisar».

**R4 · Lectura del código, migración a migración.** Lee 0023-0045 en orden con estas preguntas, y apunta lo que
no te cuadre (no hace falta que lo arregles todo: lo que sea dudoso, a la lista de §4):
- ¿Cada consulta o función cumple las 11 reglas de `RENDIMIENTO-BASE.md` §3? (nada de `x in (select … from cte)`
  sobre tablas de hechos, nada de `like` con patrón calculado, totales con tope, paginación por clave…)
- ¿Algún nombre de menor puede salir sin el permiso `ver_menores_nombres`?
- ¿Algún `0` que en realidad significa «no se sabe»?
- ¿Los `grant` dejan a `facylf_app` sólo lo justo? (la web nunca escribe en `core`)
- **Plantillas de JS:** ninguna consulta de `apps/web/src/consultas/*.ts` puede llevar una barra invertida dentro
  de `sql: \`…\`` (se pierde: `'\s+'` llegaba como `'s+'` y partía los nombres por cada «s»; ya arreglado).
  Comprobación: `grep -n '\\' apps/web/src/consultas/*.ts` → nada dentro del SQL.

**R5 · Scripts.** `node --check` de cada script de §1.3. Lee `notificaciones.mjs` (lo último que tocó Claude:
`correosDeCuenta` y la llamada a `app.avisa_caducidades`, que sólo se ejecuta si existe la función) y
`proyectar-lectura.mjs` (los interruptores `hay0036`, `hayCache`, `hay0040` para no romper con una base sin migrar).

**R6 · Código de la fase C** (`docs/plataforma-web/codigo/`). No compila todavía; léelo contra las versiones
reales que vayas a instalar: rutas de import de `better-auth` (`createAuthMiddleware`, `APIError`, plugins
`twoFactor`, `magicLink`), `unstable_cache`/`revalidateTag` de Next 16, `after()`. Anota lo que cambie.

**R7 · Ficheros de CI.** Copia `docs/plataforma-web/codigo/github-workflows/test.yml` y `rendimiento.yml` a
`.github/workflows/` (comprueba antes qué hay allí: `test.yml` e `ingesta.yml` salen modificados en `git status`;
no pises nada sin mirar la diferencia). El de pruebas tiene cuatro trabajos: test, sql (m29-m45 + análisis), migraciones (PG 18,
dos pasadas) y rendimiento semanal.

## 3. Los commits

David ha pedido que hagas los commits. El árbol tiene **mucho** sin guardar (≈ 970 ficheros modificados de
verdad —además, muchos salen como modificados sólo por los finales de línea— y cientos sin seguimiento), así
que se hace por partes y con cuidado.

**3.1 Antes del primer commit**
1. `.gitignore`: las carpetas `descargas-*` del PC son enlaces (uniones de Windows) a la unidad del servidor y
   la regla `descargas-*/` (con barra) **no las cubre**: añade `descargas-*` sin barra. Añade también `_traspaso/`,
   `_to_delete/`, `.tmp-srv/`, `output/`, `tmp/` y `packages/canonico/.tmp-*` (material de trabajo, no fuente).
2. Finales de línea: mira `git diff --stat` frente a `git diff --ignore-cr-at-eol --stat`. Los ficheros que sólo
   cambian por CRLF **no se suben** (`git checkout -- <fichero>` sólo si de verdad no hay más cambio; si dudas,
   déjalos). No cambies `core.autocrlf` del PC (es un ajuste del PC de David).
3. **Datos de personas:** antes de añadir nada de `pruebas/reconstruccion/` o `perfiles/`, ábrelo. Si trae
   nombres de jugadores (y no sabes si son menores), **no va al commit**: añádelo al `.gitignore` y anótalo.
   Lo mismo cualquier `.json`/`.txt`/`.log` de salidas. El código, las migraciones, las pruebas inventadas y los
   documentos sí.
4. Nunca `.env`, claves, tokens ni copias de la base.

**3.2 Commits propuestos** (cada uno con `pnpm test` en verde; mensaje en castellano, como los anteriores,
explicando el porqué):
1. `.gitignore` (lo de 3.1).
2. Migraciones 0016-0022 (las de rondas anteriores) con sus pruebas de `packages/canonico/test/`.
3. Migraciones 0023-0045 + `pruebas/sql/` («Plataforma nacional: modelo de lectura, usuarios, vigilancia,
   rapidez, buscador, publicidad apagada, ciclo de cuentas, estados de página»).
4. `apps/web/src/consultas/*`, `apps/web/src/lib/*`, `apps/web/src/componentes/*`, `apps/web/src/app/error.tsx`.
5. Scripts de la plataforma (§1.3) + `scripts/planes.mjs`.
6. Recolectores, ingesta y canónico (`packages/*`, `scripts/lib`, `scripts/servidor`, `scripts/recolector-*`):
   son de rondas de operación; repasa sus pruebas (`node --test scripts/lib/*.test.mjs`) y júntalos por tema si se
   puede (Cataluña, Madrid/Valencia, flota y vigía…).
7. Documentación: `docs/plataforma-web/**` (incluido `codigo/`), `AGENTS.md`, `DESIGN.md`, `docs/*.md`.
8. `.github/workflows/` (R7).

**3.3 Push.** Haz los commits en local. Antes de `git push`: (a) R1-R3 en verde, (b) repasa
`git log -p origin/main..` buscando nombres de personas o secretos, (c) **pregunta a David** con el resumen de
commits (el push sube el código a GitHub y lanza la integración continua). Si David dice que sí: push, y mira
que los cuatro trabajos de CI salen en verde.

## 4. Lo que queda por hacer (con su «terminado»)

Haz lo que puedas en este orden; lo que no, déjalo especificado en ESTADO-DEEPSEEK con el porqué.

| # | Tarea | Dónde está el detalle | Terminado cuando |
|---|---|---|---|
| T1 | Revisión R1-R7 | §2 | todo ✓ o anotado |
| T2 | Commits | §3 | árbol limpio salvo lo ignorado a propósito; push sólo con permiso |
| T3 | Fase A: aplicar 0023-0045, unir clubes por letra de filial (autorizado), reclasificar, posiciones, proyección completa de noche, comprobaciones de datos, `pnpm planes --guardar` | PLAN §2 | `lectura:estado` sin pendientes; 6 comprobaciones pegadas; planes guardados |
| T4 | Fase B: canal de avisos al móvil, primera pasada, tareas programadas, capacidad y casos, rapidez en la base real | PLAN §3 (B1-B7) | aviso de prueba recibido; parte de las 8:05 llega solo; copia y restauración de prueba en `ops.copia`; todas las consultas en presupuesto en `planes.mjs` |
| T5 | Ingesta: comprobaciones, despliegue al servidor, canal de avisos, reimportar Cataluña/Madrid/Valencia **después de T3**, historia de Cataluña, tareas viejas | `TRASPASO-DEEPSEEK-2026-10-23.md` §2 (T1-T7 de allí) | lo que diga cada tarea de allí |
| T6 | Perfil de las 8 federaciones medidas el 23/10 (Aragón, Asturias, Baleares, Cantabria, Castilla-La Mancha, Extremadura, Galicia, Murcia): en 0038 tienen los rasgos a NULL («sin medir»), así que la web enseña «Aún no se ha medido…». **Migración nueva** (0046) con un `update core.federacion_perfil set … , medido_en = '2026-10-23'` por cada una, sacando los rasgos de COBERTURA §2 y sus notas (p. ej. `codigo_jugador = false` en Extremadura y Murcia, que sólo enlazan a ~4 de cada 10; Galicia ~3 de 4: true con nota). Prueba en `pruebas/sql/m38.mjs` o un `m46.mjs` | COBERTURA §2; 0038 | `select * from analytics.avisos_de_datos('<fed>', null)` ya no da `sin_medir` para esas 8 |
| T7 | Fase C — la web nueva: pantallas del prototipo con las consultas, usuarios con Better Auth (`codigo/auth.ts`, `acceso.ts`, `acciones-*.ts`), caché por etiquetas, métricas de uso, estados de sección (`estado-seccion.tsx`), E2E (`codigo/e2e/usuarios.spec.ts`, 12 recorridos) | PLAN §4; ESTADOS-VACIOS.md; prototipo | las pantallas con datos reales; E2E y axe en verde; p95 en presupuesto en `ops.consulta_minuto` |
| T8 | Importador: tanda de penaltis, código de árbitro y de campo (Madrid y Valencia) | PLAN §5.5 | un acta de copa con tanda de cada federación la tiene; los casos P4 se cierran solos |
| T9 | Importador: posición y capitán para lo nuevo | PLAN §5.1 | un acta nueva de Valencia llega con posición, capitán y sistema |
| T10 | Cataluña en la plataforma: el lector ya lee tarjetas, cambios y código de jugador (22/10). Tras la reimportación (TRASPASO T5), migración nueva que actualice su fila de `core.federacion_perfil` (hoy dice «sin código» con nota) según lo que salga en `analytics.edicion_capacidad` | ESTADO-DEEPSEEK bloque 22/10 17:00; COBERTURA | capacidad de Cataluña con cambios y tarjetas > 0 en las competiciones que los apuntan, y su aviso de identidad sólo donde de verdad falte el código |
| T11 | Árbitros separados y con código | PLAN §5.3 | `match_official` con su rol; ningún «A / B» como una sola persona |
| T12 | Informes PDF con la misma regla de minutos que la web | PLAN §5.4 (opción b) | el PDF y la web dan los mismos minutos para 5 jugadores de muestra |
| T13 | Afinados (fotos para identidad, edad femenina, línea renombrada, reglamentos, exportación) | PLAN §6 | uno a uno, cuando A-D estén cerradas |
| T14 | Personas huérfanas tras reimportar Cataluña (las identidades «sin código» viejas quedan sin apariciones y pueden salir en el buscador; TRASPASO §6.1). **Primero medir** (`select count(*) from core.person p where not exists (select 1 from core.appearance a where a.person_id = p.id) and not exists (select 1 from core.match_official o where o.person_id = p.id)`) y pegar la cifra; luego, con permiso de David, migración nueva que las quite de `analytics.search_entity` (el disparador de 0041/0045 limpia solo `search_palabra` y `search_par`). Nunca borrar personas de `core` sin David | TRASPASO §6.1 | el buscador no devuelve personas sin ningún partido |

**Estado el 23/10 a las 12:10 (DeepSeek; detalle y salidas en `ESTADO-DEEPSEEK.md`, bloque del 23/10 12:10):**

| # | Estado | Qué falta o dónde está |
|---|---|---|
| T1 | **✓ hecha** | R2 en PostgreSQL 18.6 real (0001-0045 desde cero, 0 errores; 0035-0045 reaplicadas sin error; 0024/0029 no son repetibles por `select s.*` y no se tocan: el runner nunca reaplica). R3: 285 ✓ de m29-m45+análisis, m46 41 ✓, banco 32.760 partidos/685.440 apariciones, «66 consultas · 0 a revisar». R1: `pnpm test` 630 bien / 3 mal **por tiempo** (1 es el recuento de `/canonico` que arregla la 0047 en curso; 2 son hooks de 90 s de `retirada.test.ts`), `scripts/lib` 219 ✓, lint y tsc de la web ✓. R5/R7 ✓. R4: sin barras invertidas en el SQL, permisos de `facylf_app` revisados |
| T2 | **✓ trece commits locales** | Sin `push` (lo decide David). La 0047 y `m47.mjs` entraron al final, ya aplicadas y comprobadas. Fuera a propósito: la evidencia `.txt/.json/.log/.html/.pdf` y los fixtures de `scripts/multideporte` |
| T3 | **en marcha por otra sesión** | 0023-0046 **ya aplicadas a la base real, y la 0047 tambi�n**. Faltan unir clubes, reclasificar, posiciones, proyección nocturna, las 6 comprobaciones y `planes --guardar` |
| T4 | pendiente | Necesita T3 |
| T5 | parcial | Despliegue al servidor ✓; reimportar Cataluña/Madrid/Valencia **después de T3**; historia de Cataluña |
| T6 | **✓ hecha** | `0046-perfil-de-las-ocho-del-servidor.sql` + `pruebas/sql/m46.mjs` (41 ✓); en la base real, `avisos_de_datos('extremadura')` ya da `identidad_por_nombre` y **0 federaciones sin medir** |
| T7-T14 | pendientes | Van detrás de T3/T4 (fase C, importador, árbitros, PDF, personas huérfanas) |

**Si al revisar ves que falta algo que no está en esta tabla**, añádelo como T15, T16… con el mismo formato
(qué, dónde, cuándo está terminado). Si es código de Claude claramente roto, arréglalo con sus pruebas; si es
una decisión de producto, pregunta a David.

## 5. Riesgos que Claude conoce y no pudo comprobar

1. **Nada se ha ejecutado contra el PostgreSQL 18 real** (sólo PGlite, PostgreSQL en WebAssembly, que además
   ignora `statement_timeout`). R2 lo cubre.
2. Los tiempos del banco de volumen son de PGlite (un hilo, ×2-4 más lento que PostgreSQL nativo): sirven para
   comparar, no son los de producción. Los de verdad salen de `planes.mjs` en la base real (B7).
3. El buscador con dos palabras muy comunes y separadas en el nombre («hugo [garcía] lópez» cuando las dos
   pasan de 5.000) sigue mirando sólo las 5.000 más activas de una de ellas. Es un límite aceptado y anotado.
4. `docs/plataforma-web/codigo/*` no compila hasta instalar sus dependencias: puede haber rutas de import que
   cambien con la versión (R6).
5. `scripts/notificaciones.mjs` se editó en el PC el 23/10 y pasó `node --check`, pero no se ha ejecutado contra
   la base (no había `auth."user"`).
6. En el banco pequeño (30.000 nombres) el buscador elige recorrer `search_entity` entera (149 ms, dentro de
   presupuesto) porque le sale más barato; con 2 millones usa los índices. En la base real, mira su plan con
   `planes.mjs`: si sale «Seq Scan» sobre `search_entity` con muchas filas, avísalo (RENDIMIENTO-BASE regla 10).
7. Los porcentajes del prototipo de «qué datos publica cada federación» son medidos; todo lo demás del prototipo
   es inventado.

## 6. Cómo dejar constancia

Al empezar, al terminar cada tarea y al bloquearte: un bloque arriba del todo en `ESTADO-DEEPSEEK.md` con fecha
y hora, tarea, salidas pegadas, decisiones y por qué, y lo que queda. Si algo de aquí no se pudo hacer, dilo y
por qué; no lo des por hecho. Al cerrar el encargo, actualiza la tabla de §4 de este documento con el estado de
cada fila.
