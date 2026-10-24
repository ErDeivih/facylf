# Plan de ejecución para DeepSeek — plataforma nacional (21/10/2026, Claude)

> **23/10: antes de esto, lee [`ENCARGO-DEEPSEEK-2026-10-23.md`](ENCARGO-DEEPSEEK-2026-10-23.md)** (revisión, commits,
> riesgos y tareas T1-T14; este plan es el detalle de las fases).
>
> Este documento es el **encargo completo**. Está pensado para ejecutarse de arriba abajo sin preguntar: cada
> paso dice qué hacer, qué tiene que salir, qué hacer si no sale y cuándo está terminado. El porqué de cada
> decisión está en [`PLATAFORMA-NACIONAL.md`](PLATAFORMA-NACIONAL.md) y cada caso raro de los datos en
> [`CASUISTICAS.md`](CASUISTICAS.md). El aspecto de las pantallas está en el prototipo v3 (artefacto de
> diseño «Plataforma de fútbol federado — prototipo», 12 pantallas con datos inventados).

## 0. Reglas que no se rompen (AGENTS.md + David)

1. **El servidor y el PC no se sobrecargan.** Un proceso pesado cada vez. Parar si hay menos de 3 GiB de
   memoria libre, más de 1 GiB de swap o carga > 14. No se lanza nada en paralelo con la recolección pesada.
2. **No se baja ninguna pausa de petición, no se rodea ningún bloqueo, no se cambia el ritmo de los
   recolectores.** Si algo de este plan pide volver a descargar actas (§5.2), va a la cola con prioridad baja
   y al ritmo actual.
3. **Migraciones sólo aditivas.** Nunca se edita una migración aplicada: se añade otra.
4. **Copia antes de tocar datos.** `node scripts/copia-seguridad.mjs` antes de cualquier `--aplicar`.
5. **Sin commits** salvo que David lo pida.
6. **Menores:** nada con nombres de menores sale del PC ni se publica. Las consultas nuevas ya devuelven
   `nombre = null` sin el permiso `ver_menores_nombres`.
7. **No se inventa ningún dato.** Lo que no se sabe se dice. Desconocido ≠ 0.
8. **Docker:** nada de `docker cp` de código ni `docker compose up -d` sin lista de servicios. La base se
   arranca con `docker compose -p facylf --env-file docker/.env -f infra/docker-compose.yml up -d postgres`.

**Decisiones de David ya tomadas (no hace falta volver a preguntar):**
- La unión de clubes por letra de filial **se aplica** (21/10, 23:06: «Aplícalo cuando quieras»), con copia antes.
- Unir jugadores entre federaciones y medir tiempos: **sí**.
- Observabilidad, mantenimiento, registros y avisos «para enterarme a tiempo»: **sí**.
- Paquetes de usuario (esencial / ojeador / analista) como están en la 0027: **valen**.
- Diseño: el del prototipo, mezclando lo mejor de Transfermarkt, FotMob, SofaScore, BeSoccer y La Preferente.

## 1. Ficheros nuevos o cambiados en esta entrega

| Fichero | Qué es |
|---|---|
| `infra/migraciones/0029-minutos-disciplina-arbitros-y-posiciones.sql` | minutos v2, sanciones inferidas, desglose por equipo, posiciones, escalón, árbitros, base del ojeo |
| `infra/migraciones/0030-observabilidad-y-mantenimiento.sql` | eventos, tiempos, web vitals, copias, chequeos, alertas, purga |
| `scripts/proyectar-lectura.mjs` | + sanciones por edición, temporadas por persona, árbitros, `--temporadas-todo`, `--sin-globales`, fallos a ops |
| `scripts/vigilancia-plataforma.mjs` | chequeos cada 15 min y avisos (Telegram / ntfy / webhook), parte diario |
| `scripts/copia-seguridad.mjs` | copia comprobada + rotación + restauración de prueba (sustituye a `copia-canonico.ps1`) |
| `scripts/mantenimiento-bd.mjs` | noche: purga, cálculos globales, analyze · semana: vacuum, reindex, top sentencias |
| `scripts/rellena-posiciones.mjs` | posición, capitán y sistema desde los JSON archivados (Valencia, Madrid) |
| `scripts/registrar-tareas-plataforma.ps1` | da de alta las 7 tareas programadas |
| `apps/web/src/consultas/ojeo.ts` | ojeo, minutos por equipo, sanciones, árbitros, uso de cantera |
| `apps/web/src/lib/observabilidad.ts` | tiempos de consultas, errores y web vitals de la web → ops |
| `pruebas/sql/m29.mjs`, `m30.mjs`, `README.md` | 61 comprobaciones sobre PostgreSQL embebido |
| `docs/plataforma-web/CASUISTICAS.md` | catálogo de casos de los datos |
| **Entrega del 22/10** | |
| `infra/migraciones/0031-registro-favoritos-y-notificaciones.sql` | alta con invitación/aprobación, favoritos (el equipo se guarda como *línea*: sigue de temporada en temporada), accesos rápidos, avisos |
| `infra/migraciones/0032-capacidad-de-datos-y-casos.sql` | qué datos tiene cada competición (`analytics.edicion_capacidad`), minutos nulos donde no se apuntan cambios, `version_metricas` = 3, casos de datos (`ops.caso_dato`) |
| `infra/migraciones/0033-espacios-publicitarios.sql` | huecos de anuncios **apagados**, campañas directas, recuento diario |
| `infra/migraciones/0034-auditoria-de-administracion.sql` | cada cambio de administración con autor, antes y después |
| `scripts/proyectar-lectura.mjs` | + mide la capacidad de cada edición antes de proyectarla y detecta casos al final |
| `scripts/notificaciones.mjs` | genera avisos y los manda por push (VAPID) y correo; `--resumen` = resumen diario |
| `scripts/planes.mjs` | + consultas de usuario |
| `apps/web/src/consultas/usuario.ts` | accesos rápidos y bandeja de avisos |
| `apps/web/src/consultas/ojeo.ts` | sin minutos (competición sin cambios) usa titularidades |
| `docs/plataforma-web/codigo/auth.ts` | esqueleto de Better Auth (va a `apps/web` en la fase C) |
| `pruebas/sql/m31-m34.mjs` | 39 comprobaciones más (100 en total) |
| `docs/plataforma-web/COBERTURA-FEDERACIONES.md` | qué datos da cada federación y cómo se muestran |
| `docs/plataforma-web/ADMINISTRACION.md` | panel de administración y observabilidad |
| `docs/plataforma-web/PUBLICIDAD.md` | cómo y dónde poner anuncios (AdSense, patrocinio directo), consentimiento, administración |
| **Entrega del 22/10, tarde** | |
| `infra/migraciones/0035-vigilancia-de-la-plataforma.sql` | chequeos de usuarios, avisos, push, correo, casos, capacidad, caché, publicidad; purga de lo nuevo; `ops.panel_resumen` |
| `infra/migraciones/0036-rendimiento-ojeo-y-lecturas.sql` | **rapidez**: ojeo precalculado (93 s → 0,05 s), proyección de grupo ×4, capacidad ×10, temporadas ×8, caché por etiquetas |
| `infra/migraciones/0037-perfil-de-usuario.sql` | Mi cuenta: perfil, preferencias validadas, favoritos SIN duplicados (arregla 0031), exportar mis datos, baja |
| `infra/migraciones/0038-perfil-de-federacion.sql` | rasgos de cada una de las 24 fuentes + `analytics.avisos_de_datos` (la web no lleva `if` por federación) |
| `apps/web/src/consultas/admin.ts`, `federaciones.ts` | 13 consultas del panel; avisos y ficha de federación |
| `docs/plataforma-web/codigo/*` | `auth.ts` (límites por ruta, rastro de entradas fallidas, freno por cuenta), `acciones-usuario.ts`, `acciones-admin.ts` (aprobar, rechazar, bloquear, invitaciones, modo de registro), `acceso.ts` (qué ve cada usuario según su estado), `anuncio.tsx`, `estado-seccion.tsx`, `proxy.ts`, `sw.js`, `push-cliente.ts`, `cache.ts` |
| `pruebas/sql/m35-m39`, `analisis.mjs`, `volumen.mjs`, `rendimiento.mjs` | 197 comprobaciones en total; banco de volumen y medida de las 60 consultas |
| `infra/migraciones/0039-metricas-de-uso.sql` | vistas por pantalla, usuarios activos, acierto de caché (propio, sin terceros) |
| `infra/migraciones/0040-tanda-de-penaltis.sql` | tanda de penaltis en eliminatorias, ganador de la eliminatoria, caso P4 |
| `infra/migraciones/0041-buscador-por-palabras.sql` | buscador rápido con nombres comunes: índice de palabras `analytics.search_palabra` que se mantiene solo con disparadores (la consulta `busqueda-por-nombre` de `entidades.ts` ya lo usa: no aplicar el .ts sin la 0041) |
| `infra/migraciones/0042-publicidad-medida.sql` | publicidad: impresiones vistas, eventos validados, reparto de campañas, interruptor general, informe (va con `admin.ts`; la web, con `docs/plataforma-web/codigo/anuncio.tsx`) |
| `infra/migraciones/0043-ciclo-de-cuentas.sql` | ciclo de cuentas: invitaciones personales/anuladas, rechazo y bloqueo con motivo, caducidad, `app.estado_acceso` por petición, freno por contraseñas fallidas, vigilancia de administradores sin 2FA (web: `codigo/auth.ts`, `codigo/acceso.ts`; `scripts/notificaciones.mjs` ya manda los correos de cuenta) |
| `infra/migraciones/0044-estados-de-pagina.sql` | estados de página: sin calendario, empieza el…, pendiente, no publicado (web: `federaciones.ts` + `codigo/estado-seccion.tsx`; ESTADOS-VACIOS.md) |
| `infra/migraciones/0045-buscador-por-pares.sql` | buscador: pares de palabras seguidas para «nombre apellido» comunes (el relleno tarda ~1,5 min por cada 2 millones de nombres). Va con el `entidades.ts` nuevo, que además arregla un fallo de 0041: `'\s+'` dentro de la plantilla de JS llegaba como `'s+'` |
| `apps/web/src/consultas/analisis.ts` | forma del equipo, reparto de goles, rachas del grupo |
| `scripts/despliega-plataforma.mjs`, `docs/plataforma-web/DESPLIEGUE-CONTINUO.md` | despliegue azul/verde con vuelta atrás automática (probado) |
| `docs/plataforma-web/codigo/github-workflows/*.yml` | **copiar a `.github/workflows/`** (desde aquí no se pueden escribir): CI de 4 trabajos + rendimiento semanal |
| `docs/plataforma-web/codigo/e2e/usuarios.spec.ts` | E2E de usuarios y administración para la fase C |
| `docs/plataforma-web/GRAFICOS.md` | qué gráfico para cada análisis; colores validados para daltonismo |
| `docs/plataforma-web/RENDIMIENTO-BASE.md`, `INGRESOS.md` | reglas para consultas rápidas; cuánto se gana por visitas |

## 2. Fase A — aplicar en el PC (esta semana, de noche)

Cada paso: **orden** → **esperado** → **si no**. Pega la salida de cada paso en `ESTADO-DEEPSEEK.md`.

### A1. Pruebas
```
pnpm test
pnpm lint
node pruebas/sql/m29.mjs      # necesita @electric-sql/pglite@0.5 (ver pruebas/sql/README.md)
node pruebas/sql/m30.mjs
for m in 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45; do node pruebas/sql/m$m.mjs; done
node pruebas/sql/analisis.mjs
```
Esperado: verde; m29 a m45 y analisis terminan en «TODO OK» (285 comprobaciones). Si npm no puede instalar PGlite en el repo (403), instálalo
en una carpeta fuera y ejecuta con `NODE_PATH`; si tampoco, sáltalo: ya pasaron en el entorno de Claude.

### A2. Copia antes de nada
```
node scripts/copia-seguridad.mjs
```
Esperado: «OK: índice legible, N tablas con datos» (N ≥ 30) y el fichero en `D:\facylf-copias`. **Si falla,
no sigas.** (La tabla `ops.copia` aún no existe: el registro fallará con un aviso; es normal la primera vez.)

### A3. Migraciones
```
pnpm db:migrar
pnpm db:estado
```
Esperado: aplica 0023…0045 en orden (0036 tarda segundos: rellena el ojeo si ya hay datos). La 0029 sube `analytics.version_metricas()` a 2 y la 0032 a 3: **todos los grupos
quedan pendientes de reproyectar** (es lo que se quiere). Si 0030 avisa «pg_monitor no concedido», ejecuta
como superusuario `grant pg_monitor to facylf_publicador;` (con `docker exec -it facylf-postgres psql -U
facylf_admin -d facylf`). Si una migración falla: pega el error; no la edites, se corrige con otra nueva.

### A4. Unión de clubes partidos por la letra del filial (autorizada)
```
node scripts/consolida-clubes-comillas.mjs                # cuenta
node scripts/consolida-clubes-comillas.mjs --aplicar      # aplica (una transacción)
node scripts/consolida-clubes-comillas.mjs                # debe contar 0
```
Esperado (medido): Madrid 3.404 → ~1.358 clubes, Valencia 2.453 → ~966, Cataluña 3.795 → ~1.977. Si los
números se desvían más de un 10 %, para y pega la salida.

### A5. Reclasificar ediciones
```
pnpm lectura:reclasificar             # cuenta
pnpm lectura:reclasificar --aplicar
```
Esperado: ~130 categorías corregidas, división en ~52 % de las ediciones, provincia en ~49 %. No toca lo curado.

### A6. Posiciones, capitán y sistema (sin red)
```
node scripts/rellena-posiciones.mjs --federacion valencia              # cuenta
node scripts/rellena-posiciones.mjs --federacion valencia --aplicar
node scripts/rellena-posiciones.mjs --federacion madrid --aplicar
```
Esperado: Valencia 2025-26 y 2026-27 con posición en ~85 % de los jugadores y sistema en ~85 % de las actas;
Madrid ~10 %. Antes, confirma el código de federación (`select codigo from core.federation`) y corrige el
mapa `CODIGO` del script si no es `valencia`/`madrid`. «sin_partido» alto = el código de acta de la cola no
coincide con `core.match_source.codigo_acta`: pega 5 ejemplos. «Literales sin normalizar»: añádelos en una
migración nueva a `core.posicion_normalizada`. Cataluña: hoy no empareja (su JSON no trae código de
jugador): no lo lances hasta §5.2.

### A7. Proyección completa, por federaciones, de noche
```
pnpm lectura:proyectar --federacion castilla-leon --limite 300 --sin-globales
pnpm lectura:estado
```
Mira los ms por grupo. Si la media es < 1 s y la máquina va holgada, sigue **una federación cada vez**
(`--limite 1000 --sin-globales`) hasta que `lectura:estado` diga «Pendientes: ninguno». Después, una vez:
```
node scripts/proyectar-lectura.mjs --temporadas-todo      # sanciones, temporadas de jugador y árbitros de todo
node scripts/proyectar-lectura.mjs --identidad-todo       # unión de jugadores entre federaciones
node scripts/mantenimiento-bd.mjs --noche                 # evolución, zonas, frecuencias, analyze
```
Pega las líneas «Minutos y disciplina (0029)…», «Identidad: …» y «Evolución: …».
Si un grupo da `statement timeout`: anota el id, sigue; al final `node scripts/proyectar-lectura.mjs --grupo <id>`
y, si vuelve a fallar, pega su tamaño (`select count(*) from core.appearance a join core.team_entry te on
te.id = a.team_entry_id where te.phase_group_id = <id>`).

### A8. Comprobaciones de datos (pega cada resultado)
```sql
-- 1. Minutos fiables por federación en la temporada en curso (esperado: > 85 % salvo Cataluña ≈ 0, ver §5.2)
select f.codigo, round(100.0*avg((s.minutos_fiables)::int),1) pct
  from analytics.player_team_season_summary s join core.competition_edition ce on ce.id=s.competition_edition_id
  join core.federation f on f.id=ce.federation_id join core.season se on se.id=s.season_id
 where se.orden=(select max(orden) from core.season) and s.partidos_demostrados>0 group by 1 order by 2;
-- 2. Dobles amarillas deducidas por federación (esperado: ~0 en Fénix; > 0 donde la fuente no marca la doble)
select f.codigo, sum(dobles_deducidas) deducidas, sum(dobles_amarillas) dobles
  from analytics.player_team_season_summary s join core.competition_edition ce on ce.id=s.competition_edition_id
  join core.federation f on f.id=ce.federation_id group by 1 order by 2 desc;
-- 3. Sanciones: reparto de partidos perdidos (esperado: la mayoría 1; cola larga corta)
select motivo, partidos_perdidos, cierre, count(*) from analytics.sancion_inferida group by 1,2,3 order by 1,2;
-- 4. Jugadores que subieron de equipo o cambiaron de club
select cambio_club, por_encima_de_su_edad, count(*) from analytics.jugador_temporada group by 1,2;
-- 5. Árbitros agrupados (esperado: muchos menos árbitros que personas-árbitro)
select count(distinct person_id) personas, count(distinct arbitro_id) arbitros from analytics.arbitro_persona;
-- 6. Ojeo sub-19 de Castilla y León 2025-26: las 20 primeras filas de la consulta 'ojeo-jugadores'
```
Revisión manual: abre 10 jugadores con `cambio_club = 'traspaso'` y 10 con `por_encima_de_su_edad` y
comprueba en las actas que es verdad. Anota cuántos aciertan.

### A9. Tiempos de las consultas
```
pnpm planes --guardar
```
Incluye las de `identidad.ts`, `paneles.ts` y `ojeo.ts` (ya enganchadas en `scripts/planes.mjs` el 22/10;
**no** las metas en `apps/web/test/planes.test.ts` hasta que tengan plan guardado). Ajusta antes en
`PARAMETROS_OJEO` los ids de ejemplo (edición, persona) a unos que existan en tu base. Presupuestos: ojeo 800 ms, minutos-por-equipo 150, sanciones 200, árbitros 200,
uso-de-cantera 600. Si alguna se pasa: pega el `explain (analyze, buffers)` y propón un índice en una
migración nueva (candidatos ya pensados: `analytics.jugador_temporada (season_id, categoria_principal)`,
`analytics.sancion_inferida (person_id)`, `analytics.arbitro_temporada (competition_edition_id)`).

**Fase A terminada cuando:** `lectura:estado` sin pendientes, las 6 comprobaciones pegadas, `planes` guardado
y la muestra manual de A8 revisada.

## 3. Fase B — vigilancia, avisos, copias y mantenimiento automáticos

### B1. Canal de avisos (elige uno; Telegram es lo más rápido)
1. En Telegram, habla con **@BotFather** → `/newbot` → nombre «facylf alertas» → copia el token.
2. Escribe cualquier cosa a tu bot y abre `https://api.telegram.org/bot<TOKEN>/getUpdates`: el `chat.id` es tu chat.
3. En `.env` (raíz): `ALERTAS_TELEGRAM_TOKEN=...` y `ALERTAS_TELEGRAM_CHAT=...`.
   Alternativa privada sin terceros: ntfy en Docker (`ALERTAS_NTFY_URL=http://127.0.0.1:8090/facylf-alertas`)
   y la app ntfy del móvil suscrita a ese tema (sólo funciona en casa salvo que David decida abrir acceso).
4. `node scripts/vigilancia-plataforma.mjs --probar-aviso` → tiene que llegar al móvil.

### B2. Primera pasada a mano
```
node scripts/vigilancia-plataforma.mjs
node scripts/vigilancia-plataforma.mjs --resumen
```
Esperado: lista de problemas nuevos (la primera vez saldrá «restauración_probada» porque nunca se ha hecho).
```
node scripts/copia-seguridad.mjs --restauracion-prueba
```
Esperado: «OK: la copia se restaura y cuadra». Tarda (restaura entera con 2 procesos): de noche.

### B3. Tareas programadas
```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\registrar-tareas-plataforma.ps1
```
Crea 10 tareas (proyector, vigilancia y avisos cada 15 min; resumen de avisos cada hora (sale si no es la hora de cada usuario); puntuación del ojeo cada hora (`--puntua-ojeo`); parte diario 8:05; copia 3:31; mantenimiento 4:31;
semanal domingo 5:01; restauración el día 2). Si PowerShell protesta por caracteres, pasa antes
`node scripts/_pon-bom-ps1.mjs scripts/registrar-tareas-plataforma.ps1`. Comprueba:
`Get-ScheduledTask -TaskName "FACyLF*" | Select TaskName, State`. La antigua `copia-canonico.ps1` puede
quedarse como alternativa manual; no programes las dos.

### B4. Umbrales
Están en `ops.parametro` (se cambian con un `update`, sin migración). Si una alerta salta a diario sin ser un
problema real, sube su umbral y anótalo en ESTADO-DEEPSEEK con el porqué. Nunca silencies una de copias.

### B5. Capacidad de datos y casos (tras la proyección completa de A7)
```
node scripts/proyectar-lectura.mjs --temporadas-todo
```
Mide todas las ediciones (`analytics.edicion_capacidad`) y detecta los casos (`ops.caso_dato`). Pega:
```sql
select * from analytics.federacion_capacidad order by federacion, orden;
select * from ops.casos_resumen;
```
Compara con `COBERTURA-FEDERACIONES.md` §2: deben parecerse (aquélla se midió en las colas). Si una federación
sale muy distinta, anótalo; **no cambies umbrales** de `analytics.parametro_capacidad` sin decírselo a David.
Los casos graves se revisan en el panel (o con `ops.revisa_caso`), nunca borrando filas.

### B6. Matriz de las 8 federaciones del servidor
Ver `COBERTURA-FEDERACIONES.md` §5 (una federación cada vez, con los límites de carga de siempre). Añade sus
filas a la tabla del §2.

### B7. Rapidez en la base real (tras A7 y B5)
```
node scripts/planes.mjs
```
Las 66 consultas tienen que quedar dentro de presupuesto y sin «Seq Scan» en las `indexado` (reglas en
`RENDIMIENTO-BASE.md` §3). Pega la tabla. Mira también:
`select count(*), max(calculado_en) from analytics.ojeo_jugador;` (debe tener filas tras la proyección) y el
tiempo de `node scripts/proyectar-lectura.mjs --puntua-ojeo` (si pasa de 60 s, avisa). Al día siguiente:
`select query, calls, round(mean_exec_time) ms from pg_stat_statements order by total_exec_time desc limit 20;`.
**No cambies `infra/docker-compose.yml`** sin que David lo diga (RENDIMIENTO-BASE §5 tiene la propuesta).

**Fase B terminada cuando:** llega el aviso de prueba, el parte diario del día siguiente llega solo a las 8:05,
hay una copia de las 3:31 y una restauración de prueba correcta en `ops.copia`.

## 4. Fase C — la web

> **24/10: el encargo detallado de esta fase es [`ENCARGO-WEB-DEEPSEEK-2026-10-24.md`](ENCARGO-WEB-DEEPSEEK-2026-10-24.md)**
> (etapas W0-W10, consultas que faltan, etiquetas de caché). Lo de abajo queda como resumen.

Next.js 15 está congelado en `apps/web`; la fase C es la reconstrucción (Next 16 + Cache Components, ver
PLATAFORMA-NACIONAL §5 y §10). Mapa de pantallas → consultas (todo lee `analytics`, nada agrega hechos):

| Pantalla (prototipo) | Ruta | Consultas |
|---|---|---|
| 1 Inicio | `/` | `busqueda-por-nombre` |
| 2 Competición | `/competicion/[id]?grupo=&jornada=` | `zonas-del-grupo`, clasificación oficial, `ranking-goleadores` |
| 3 Acta | `/partido/[id]` | (existente) + expulsiones de `sanciones-inferidas` |
| 4 Equipo | `/equipo/[id]` | `curva-del-equipo`, `goles-por-tramo`, plantilla de `minutos-por-equipo` por equipo |
| 5 Club | `/club/[id]` | `evolucion-del-club` |
| 6 Jugador | `/jugador/[id]` | `minutos-por-equipo` (barras apiladas), `trayectoria-unificada`, `sanciones-inferidas`, `candidatos-de-identidad` |
| 7 Comparar | `/comparar?a=&b=` | `comparador-jugadores` |
| 8 Rankings | `/rankings` | `ranking-goleadores`, `comparacion-de-ligas` |
| 9 Ojeo | `/ojeo` | `ojeo-jugadores` (paquete ojeador o superior) |
| 10 Árbitro | `/arbitro/[id]` | `arbitros` |
| 11 Estadísticas de la competición | `/competicion/[id]/estadisticas` | `goles-por-tramo` (de liga), `uso-de-cantera`, disciplina, `arbitros` |
| 13 Entrar / registrarse | `/entrar`, `/registro` | Better Auth (`docs/plataforma-web/codigo/auth.ts`) → `app.alta_usuario` |
| 14 Mi panel | `/mi` | `mis-accesos`, `bandeja-avisos`; escribir favoritos y preferencias (SQL en la cabecera de `usuario.ts`) |
| 15 Administración | `/admin/usuarios` | `app.usuario`, `app.invitacion`, `app.aprueba_usuario`, `app.ajuste`, `app.auditoria` |
| 16 Calidad de datos | `/admin/datos` | `ops.casos_resumen`, `ops.caso_dato`, `ops.revisa_caso`, `analytics.federacion_capacidad` |
| 18 Mi cuenta | `/cuenta` | `app.perfil`, `app.guarda_perfil`, `app.guarda_preferencias`, `app.exporta_mis_datos`, `app.baja_usuario` (acciones en `codigo/acciones-usuario.ts`) |
| 19 Federación | `/federacion/[codigo]` | `ficha-federacion`, `avisos-de-datos`, lista de competiciones |
| (todas las fichas) | | **`avisos-de-datos(federación, edición)` arriba de cada página de competición, equipo, jugador y acta** |
| 17 Publicidad | `/admin/publicidad` | `app.espacio_anuncio`, `app.campana_anuncio`, `ops.anuncio_dia` (**se queda apagada**) |
| 12 Salud | `/admin/salud` | `ops.salud`, `ops.chequeo_diario`, `ops.consulta_minuto`, `ops.copia`, `ops.evento_app` (sólo administrador) |

Reglas de la web: barra superior por **funciones** (Explorar · Rankings · Ojeo · Comparar · Siguiendo · Cuenta),
nunca por tipos de dato; **sin contadores de vanidad**; cada nombre es un enlace a su ficha; miga de pan y
selectores en la página; responsive (rejillas `auto-fit`, tablas anchas en caja con desplazamiento, objetivos de
44 px, probar a 375 px); minutos como primera cifra del jugador; «≥» cuando los minutos no son exactos.
Permisos: `app.puede(usuario, capacidad)` antes de cada consulta (ojeo → `cruzar_federaciones` o paquete
ojeador; salud → `administrar_usuarios`); nombres de menores sólo con `ver_menores_nombres`.
Observabilidad: integrar `apps/web/src/lib/observabilidad.ts` como dice su cabecera (`midiendo` en el ejecutor
de consultas, `anotaError` en `global-error` y route handlers, `/api/salud`, `/api/web-vitals`).
**Usuarios (C-usuarios), en este orden:**
1. `pnpm --filter web add better-auth pg web-push nodemailer` y mueve `docs/plataforma-web/codigo/auth.ts` a `apps/web/src/lib/auth.ts`.
2. `.env`: `BETTER_AUTH_SECRET` (32 bytes aleatorios), `BETTER_AUTH_URL`, `DATABASE_URL_AUTH` (rol facylf_app, `search_path=auth`).
3. `npx @better-auth/cli migrate` → crea las tablas en el esquema `auth`. Luego
   `grant usage on schema auth to facylf_publicador; grant select on auth."user" to facylf_publicador;` (el correo lo lee `notificaciones.mjs`).
4. Claves push: `npx web-push generate-vapid-keys` → `WEBPUSH_PUBLICA`, `WEBPUSH_PRIVADA`, `WEBPUSH_CONTACTO=mailto:...`.
   Service worker en `apps/web/public/sw.js` (evento `push` → `showNotification`, `notificationclick` → abrir `url`).
5. Correo: `SMTP_URL` (p. ej. el SMTP de su proveedor de correo). Sin él, sólo push y bandeja.
6. Primer administrador: registra a David con una invitación creada a mano
   (`insert into app.invitacion(codigo, paquete, usos_max) values ('DAVID', 'analista', 1)`), y
   `update app.usuario set rol='administrador' where ...`. Activa 2FA antes de entrar en `/admin`.
7. Prueba: crear invitación → registro → favorito de un equipo → `node scripts/notificaciones.mjs` dos veces
   (la primera sólo toma la foto) → cambia a mano la hora de un partido en una copia → aviso «cambio de horario».

**Publicidad:** no se enciende. Si David lo decide, sigue `PUBLICIDAD.md` §6 (CMP certificado primero).

**Caché y rapidez (C-rapidez):** `codigo/cache.ts` → `apps/web/src/lib/cache.ts`; `/api/revalidar` e
`instrumentation.ts` como dice su cabecera; `REVALIDAR_SECRETO` en `.env` (web y proyector). Comprobar: tras una
pasada del proyector, `select count(*) from ops.invalidacion where consumida_en is null` vuelve a 0 en un minuto.
Todas las páginas públicas leen con `consultaCacheada`; Mi panel, avisos y `/admin`, sin caché.
**Métricas de uso (0039):** en el layout del servidor, después de responder (`after()` de Next), una llamada
`select ops.anota_uso($ruta_patron, $user_id, $vino_de_cache, $ms)` por página servida — con el PATRÓN de la ruta
(`/equipo/[id]`), nunca la URL. Alimenta la portada del panel (prototipo 21): vistas, activos en 7 días, acierto de
caché, pantallas que nadie usa.

**Usuarios de punta a punta (C-usuarios, además de lo de arriba):** `proxy.ts`, `sw.js` en `public/`,
`push-cliente.ts`, `acciones-usuario.ts`. E2E (Playwright, `apps/web/e2e/usuarios.spec.ts`): registro con
invitación → confirmar correo (en desarrollo sale por consola) → entrar → estrella en un equipo → aparece en
Mi panel → cambiar preferencias → descargar mis datos → darse de baja → no puede entrar. Y: `/admin` sin 2FA
redirige a seguridad; un usuario normal en `/admin` ve 404.

**Terminada cuando:** las 19 pantallas con datos reales, E2E de los recorridos de PLATAFORMA-NACIONAL §6.1,
accesibilidad sin errores graves (axe), p95 de todas las consultas dentro de presupuesto en `ops.consulta_minuto`.

## 5. Fase D — recolectores e importador (código)

### 5.1 Posición y capitán en el importador (para lo que llegue a partir de ahora)
`rellena-posiciones.mjs` arregla lo archivado; lo nuevo tiene que llegar solo:
1. `scripts/recolector-valencia.mjs` (sirve a Valencia y Madrid con `ES_MADRID`), función `interpretaFicha`:
   en cada jugador de `lineups` añade `posicion` (`posicion_jugador_abreviatura` o `posicion`) y `capitan`
   (`capitan === '1'`); en `parseada` añade `esquemaLocal`/`esquemaVisitante` si cumplen `^1(-[1-6]){2,5}$`.
   Sube `VERSION_PARSER` (Madrid 5→6, Valencia 4→5): `reparaActasDesactualizadas` reprocesa lo archivado **sin
   red**, 50 actas por ciclo.
2. Esquema de la cola (`abreBase`): `alter table participaciones add column posicion text`,
   `add column capitan integer` (nulos), escritos por `guardaActaEstructura`.
3. `packages/canonico/src/origen/cola.ts`: si `pragma table_info(participaciones)` trae esas columnas,
   leerlas; `lote.ts`, tras `upsertMasivo('core.appearance', …)`, escribir `core.appearance_detalle` con
   `core.posicion_normalizada(abrev, literal)` y `core.match_esquema` desde `actas.datos`.
4. Prueba: un acta archivada de Valencia 2025-26 → aparición con posición y capitán, y sistema del partido.

### 5.2 Cataluña: tarjetas y cambios
Medido: la cola de Cataluña sólo tiene **goles** (172.611 eventos) y ningún cambio ni tarjeta; el JSON del acta
(`origen: acta-fcf`) guarda, junto a cada jugador, `minutos[]` («4'», hasta 4 por jugador) pero **sin el tipo**
(el icono se perdió al extraer). Sin esto Cataluña no tiene minutos ni disciplina.
1. Mira primero si hay HTML crudo de actas FCF en algún sitio (`descargas-cataluna/_muestras`, `grupos-html`):
   `node scripts/_diag-actas-cataluna.mjs` o abre 3 actas en `fcf.cat` a mano y anota cómo marca amarilla,
   roja, doble, entra y sale (clase o `src` del icono) y dónde está el código del jugador (enlace a su ficha).
2. En `recolector-cataluna-datos.mjs` (extracción del acta): guardar por cada minuto `{minuto, tipo}` y el código
   de jugador; emitir `eventos_acta` (amarilla, roja, doble-amarilla, entra, sale) y `participaciones.jugador_codigo`.
   Sube `VERSION_PARSER` 3→4.
3. Lo ya descargado **no tiene el icono**: hay que volver a pedir esas actas. Va a la cola con prioridad baja,
   al ritmo actual, temporada en curso primero. Estima cuántas son y cuánto tardaría al ritmo actual antes de
   empezar y pégalo en ESTADO-DEEPSEEK (David decide si la temporadas viejas se piden o no).

### 5.3 Árbitros bien separados y con código
Hoy `partidos.arbitro` une a todos los colegiados con « / » (31.208 partidos de Valencia, Madrid y Cataluña) y el
importador crea una persona con ese texto. La 0029 lo rodea usando sólo el primero. De raíz:
1. Recolectores Novanet y Cataluña: nueva tabla de cola `arbitros_partido(temporada, competicion, grupo,
   jornada, codigo_acta, orden, codigo, nombre, rol)` con `rol` mapeado: «ARBITRO»/«Árbitro/a Principal» →
   principal (el primero si hay dos), «ASISTENTE» → asistente1/asistente2 por orden, «CUARTO» → cuarto.
   Mantener `partidos.arbitro` = sólo el principal (compatibilidad).
2. Importador: si existe la tabla, `core.match_official` con su rol; persona con código federativo
   (`cod_arbitro`) en `person_source_identity` (identidad con código, ámbito federación) en vez de nominal por
   edición. Para Fénix (sin código), seguir nominal pero con ámbito **federación** (no edición) en una persona
   nueva; `analytics.arbitro_persona` ya agrupa las antiguas.

### 5.5 Tanda de penaltis, código de árbitro y de campo (Novanet: Madrid y Valencia)
Medido en COBERTURA-FEDERACIONES.md §3b. El acta JSON ya trae:
- `hay_penaltis`, `penaltis_casa`, `penaltis_fuera` → `core.match.penaltis_local/visitante` (0040). Sólo si el
  partido acabó en empate; si no, NULL (lo exige la restricción `match_penaltis_check`). Luego
  `node scripts/proyectar-lectura.mjs --federacion madrid` para que los casos P4 se cierren solos.
- `arbitros_partido[].cod_arbitro` + `tipo_arbitro` → identidad del árbitro con código
  (`core.person_source_identity`, contexto 'arbitro') y `core.match_official.rol` según el tipo (principal,
  asistente1/2, cuarto). Junta con §5.3.
- `codigo_campo` → `core.venue.codigo_externo` (une el mismo campo escrito de varias formas).
Prueba: un acta de copa con tanda de cada federación queda con sus penaltis; ningún partido con ganador los tiene.
Y mira si las actas Fénix (pnfg) tienen tanda en el HTML («penaltis», «lanzamientos»): mide antes de programar.

### 5.4 Informes PDF = misma regla de minutos
`scripts/lib/informe-minutos.mjs` tiene la regla v1 (sin volantes ni doble deducida). Dos opciones; la buena es
la segunda: (a) portar `analytics.minutos_partido` a JS con la tabla de casos de `pruebas/sql/m29.mjs` §1;
(b) que el informe lea `analytics.player_team_season_summary` (ya proyectado) y deje de calcular. Así web y PDF
dicen siempre lo mismo.

## 6. Fase E — afinados (cuando A-D estén cerradas)

1. **Fotos para identidad** (`fotos-desde-actas.mjs`): huella perceptual (pHash 64 bits) por persona y
   temporada; distancia Hamming ≤ 10 como prueba extra en `genera_candidatos`. Las fotos y huellas nunca salen
   del PC.
2. **Edad femenina y mixtas**: medir horquillas reales (personas con una sola ficha y varias temporadas) y
   añadir excepciones por federación y género.
3. **Línea renombrada** (el B pasa a A): si > 60 % de la plantilla del B de la temporada t está en el A de t+1
   y el A de t no existe, unir la línea en `recalcula_evolucion`.
4. **Reglamentos**: ciclo de amarillas por federación y categoría, reinicio en fases, en `parametro_sancion`
   (ampliar a `(federation_id, categoria)` con una migración nueva).
5. **Posición estimada**: sólo si una evaluación con Valencia (donde hay verdad) da ≥ 85 % de acierto por
   línea; hoy el dorsal da 64 % y no se usa.
6. **Exportación de análisis**: `dwh` → Parquet semanal y DuckDB en el PC para análisis pesados sin cargar la base.

## 7. Si algo va mal

| Síntoma | Qué hacer |
|---|---|
| `db:migrar` falla en 0029 por `mode() within group … filter` | PostgreSQL < 9.4 no lo admite; en 18 sí: comprueba que migras contra el contenedor 18 |
| proyección > 2 s por grupo | `explain (analyze, buffers) select analytics.proyecta_grupo(<id>)`; casi siempre falta `analyze` tras la carga: `node scripts/mantenimiento-bd.mjs --noche` y repetir |
| `proyecta_sanciones_edicion` lenta en ediciones enormes | se puede pasar a por grupo de la edición; antes mide cuántas apariciones tiene la edición |
| la vigilancia avisa cada 15 min de lo mismo | no debería (recordatorio cada 6 h); si pasa, revisa que `ops.marca_notificada` se ejecuta (permisos de facylf_publicador) |
| no llegan avisos | `--probar-aviso`; token/chat mal; el PC sin red; mira `ops.evento_app` tipo `aviso_no_enviado` |
| la copia falla por disco | libera copias viejas a mano o cambia `FACYLF_COPIAS`; nunca borres la última correcta |
| restauración de prueba «no cuadra» | **alerta seria**: no borres nada, pega la salida y avisa a David |
| un jugador sale con edad incoherente | revisa su unión entre federaciones; si es errónea, `identity_decision` = separar |

## 8. Al terminar cada fase

Escribe en `ESTADO-DEEPSEEK.md` un bloque con: fecha, fase, salidas pegadas, decisiones tomadas y por qué,
y lo que queda. Si algo del plan no se pudo hacer, dilo y por qué; no lo des por hecho.
