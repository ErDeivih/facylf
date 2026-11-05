# WALL — facylf

Derivado del bloque **2** de `F:\EspacioCodigo\_flujo-dsh\MAPA-DE-OBJETIVOS.md` (fuente de verdad,
05/11/2026). Aquí se marcan las casillas; la siguiente tarea ya está escrita. No se para: si algo se
bloquea, se pasa a la siguiente casilla.

**Objetivo final**: todas las páginas del prototipo, funcionando con datos reales de CyL y con backend
detrás. Se acabaron las explicaciones: se implementa.

## Falta (por orden)

- [x] **1. Acta del partido.** Alineaciones, goles, tarjetas, cambios, árbitro, campo y contexto del
  partido, contra `prototipo/Acta.dc.html`, con datos del canónico y enlace desde la jornada.
  Estado actual: **hecho y validado (05/11/2026)**. Ruta
  `/explorar/acta/[id]` (id de `core.match`); consulta nueva `acta-del-partido` en
  `apps/web/src/consultas/partidos.ts` (una sola consulta: partido, eventos, alineaciones, árbitros,
  cuerpo técnico y enfrentamientos en JSON; ~8 ms medidos, presupuesto 500 ms, plan indexado y sin
  `Seq Scan` en tablas de hechos); componentes en `apps/web/src/componentes/acta/`; enlace desde el
  detalle de Jornada sólo para partidos con acta publicada; pruebas en
  `apps/web/test/acta-pantalla.test.ts` (35). 404 real para id inexistente, partido sin acta y acta
  `unavailable`. Axe 0 (1440 y 360, claro y oscuro), sin desplazamiento horizontal del documento;
  capturas en `tmp/acta-*.png`. Pendiente: validación del Lead y los enlaces a ficha de jugador y de
  equipo desde el acta (los integra el Lead).

- [x] **2. Calendario y jornadas completos.** Calendario del grupo y de la competición por jornadas y
  fechas, con navegación completa, estados (jugado/programado/sin resultado), filtros y enlaces a
  jornada y acta. Estado actual: **hecho y validado (05/11/2026)**. Rutas
  `/explorar/competicion/[id]/calendario` y `/explorar/calendario`; calendario del grupo (todas las
  jornadas, filtros jornada/equipo/estado, enlaces a jornada y acta) y global (federación, temporada,
  jornada, fechas, búsqueda; paginado de 60). Consulta en `consultas/calendario.ts`; medidas 43–304 ms
  (presupuesto 800). Pruebas 52 y `tsc` verde; axe 0 y sin desbordamiento en 1440/360 claro y oscuro.
  Pestaña «Calendario» integrada en `CabeceraCompeticion`.

- [x] **3. Ficha de jugador, de equipo y de club.** Tres fichas contra los artboards del prototipo
  (`Jugador`, `Equipo`, `Club`), con plantilla, trayectoria, estadísticas, últimos partidos y contexto.
  Estado actual: **hecho y validado (05/11/2026)**. Rutas
  `/explorar/jugador/[id]` (id de `core.person`), `/explorar/equipo/[id]` (id de `core.team_entry`) y
  `/explorar/club/[id]` (id de `core.club`); tres consultas nuevas en `apps/web/src/consultas/fichas.ts`
  (últimos partidos de una persona, goles por tramo, escudo del club) sobre las de `entidades.ts`;
  componentes en `apps/web/src/componentes/fichas/`; pruebas en `apps/web/test/fichas-pantalla.test.ts`
  (40). Medido con el rol de lectura: jugador 3 consultas · 175 ms, equipo 5 · 58 ms, club 3 · 59 ms.
  Axe 0 (1440 y 360) y sin desplazamiento horizontal del documento a 360/400; 404 real. Capturas en
  `tmp/ficha-*.png`. Pendiente: enlaces desde la cabecera del sitio y desde Jornada/Acta (los integra
  el Lead) y decidir si la ficha de jugador enseña el nombre corto de la federación.

- [x] **4. Selector de temporada y de competición «inventada».** Poder pedir, por ejemplo, «Segunda
  Juvenil 2017, Burgos» y obtener calendario, clasificación, jornadas, actas, estadísticas y gráficos.
  Si la competición o temporada no existen en el canónico, hay que crearlas o encontrarlas (ingesta,
  archivo, histórico), no fingir. Estado actual: **hecho y validado (05/11/2026)**. Ruta
  `/explorar/competiciones`, filtros de federación/temporada histórica/categoría/modalidad/género/
  provincia/nivel/texto, paginación y total real; «Segunda Juvenil 2017, Burgos» encuentra el grupo
  30665 de 2016-17 y lo abre con su temporada seleccionada; «Explorar» de la cabecera ya apunta ahí.
  La ficha histórica ya ofrece calendario, clasificación, jornadas, actas y estadísticas (objetivos 1,
  2, 5).

- [x] **5. Estadísticas y páginas de gráficos.** Páginas de estadísticas y gráficos del prototipo
  (equipos, jugadores, competición), con datos y backend detrás. Estado actual: **hecho y validado
  (05/11/2026)**. Rutas nuevas `/explorar/estadisticas` (federación y
  temporada, con búsqueda de competición) y `/explorar/competicion/[id]/estadisticas` (también grupos
  históricos como 30665, 2016-17); gráficos SVG sin librería con resumen en texto, tabla equivalente y
  colores del sistema (puntos acumulados por jornada, goles por mes, goles por tramo, reparto de
  resultados, casa/fuera, forma, goleadores y disciplina); estados de carga y «sin datos» explícitos
  (el 30665 no tiene tarjetas publicadas y así se dice; una temporada que no existe no se sustituye por
  otra). Consultas nuevas en `apps/web/src/consultas/estadisticas.ts`, reglas puras en
  `apps/web/src/lib/estadisticas.ts`, componentes en `apps/web/src/componentes/estadisticas/` y
  pruebas en `apps/web/test/estadisticas-pantalla.test.ts` (42). Medido: resumen de CyL 2026-27
  103 ms (2025-26, 420 ms), goleadores 13 ms, eventos de un grupo 3–5 ms, opciones 2 ms; TTFB de
  página 143–216 ms. Axe 0 y sin desbordamiento en 1440/400/360 claro y 1440 oscuro. Pestaña
  «Estadísticas» integrada en `CabeceraCompeticion`.

- [x] **6. Backend e infraestructura para servir todo.** Endpoints, caché y consultas que respondan
  rápido para todas las páginas; medido, no supuesto. Estado actual: **hecho y validado (05/11/2026)**.
  Siete endpoints en `/api/v1` (índice, competición,
  acta, calendario, fichas de equipo/jugador/club) que reutilizan las consultas del catálogo; ETag/304,
  `Cache-Control` público con `stale-while-revalidate`, `X-Cache` para medir hit/miss y límite de 300
  peticiones por minuto e IP con 429 y `Retry-After`. Caché por etiquetas (`unstable_cache` +
  `revalidateTag`), `POST /api/revalidar` y consumo de la cola cada minuto en `instrumentation.ts`.
  Medido: MISS 46–84 ms p50, HIT 31–38 ms p50, 304 49–103 ms p50 (servidor de desarrollo, máquina
  compartida); las 14 consultas que sirven la API están dentro de presupuesto y sin `Seq Scan` en
  tablas de hechos (no hace falta índice nuevo ni migración). Contrato en
  `docs/plataforma-web/API.md`; pruebas `apps/web/test/api-v1.test.ts` (26). Nota: la cola de
  invalidaciones tenía 1,7 M de etiquetas pendientes de la proyección histórica; se vacía sola a
  2000/min, no se ha borrado nada.

- [x] **7. Registro de usuarios con favoritos.** Registro real, sesión, favoritos de clubes, equipos y
  jugadores y accesos rápidos a horarios y resultados. Estado actual: **hecho y validado (05/11/2026)**.
  Alta real por invitación (`app.ajuste.registro_modo`), contraseña
  con scrypt, sesión en cookie `httpOnly` con token hasheado en `app.sesion` (migraciones 0057/0058),
  entrada, cierre, freno de intentos, `/mi-panel` con favoritos y estrella en las fichas de club,
  equipo y jugador. Sin Better Auth y sin instalar dependencias. Capturas y axe en `pruebas/cuentas/`;
  detalle en `docs/plataforma-web/CUENTAS.md`. Pruebas 94/94 (unitarias y flujo real contra
  PostgreSQL).

## Terminado cuando

Puedo pedir cualquier competición/temporada y ver calendario, clasificación, jornadas, actas y
estadísticas sin que falte nada.

## Bitácora

- 05/11/2026: creado el WALL desde el bloque 2. Ya hechos de la primera tanda anterior: clasificación
  (completa), jornada (listado y detalle), escudos de club y federación, zonas por reglamento, textos
  y menores según doctrina, y el diseño de `/entrar`.

- 05/11/2026: **objetivo 4, primera entrega: selector de temporada y competición**. Ruta nueva
  `/explorar/competiciones` con filtros de federación, temporada (históricas incluidas), categoría,
  modalidad, género, provincia, nivel y texto libre; paginación por desplazamiento y total real (el
  que cuenta la consulta, no el de la página). «Segunda Juvenil 2017, Burgos» encuentra el grupo real
  **30665** de Castilla y León (temporada 2016-17, «2ª División Provincial de Juveniles · Primera -
  Burgos», 156 de 157 partidos con resultado) y enlaza a su ficha. El año suelto se interpreta como la
  temporada que termina ese año; «segunda» busca como «2»; sin tilde y por comienzo de palabra; si la
  temporada no está en el catálogo no se inventa y se ofrecen las temporadas que sí tienen datos.
  Sin resultados el estado dice la verdad y deja quitar filtros; lo no medido se lee «Cobertura sin
  medir», nunca 0. Consultas nuevas en `apps/web/src/consultas/catalogo-selector.ts` (grupos con id de
  ficha y opciones en una pasada); lógica pura en `apps/web/src/lib/selector-competiciones.ts`;
  interfaz en `apps/web/src/componentes/catalogo/` y la página. Medido con `EXPLAIN ANALYZE`:
  «Segunda Juvenil 2017, Burgos» 32–43 ms, opciones de los filtros ~105 ms y catálogo sin filtros
  0,5–0,9 s (máquina compartida con los recolectores; la misma consulta oscila entre pasadas).
  Pruebas `apps/web/test/selector-competiciones.test.ts`: 20/20 en verde, contrato contra el catálogo
  incluido; `pnpm --filter @facylf/web exec tsc --noEmit` en verde. Capturas: `tmp/selector-1440.png`,
  `tmp/selector-360.png`, `tmp/selector-vacio-1440.png`, `tmp/selector-oscuro-1440.png` y
  `tmp/selector-defecto-1440.png`. axe sin incidencias serias ni críticas en 1440, 360 y oscuro; sin
  scroll horizontal del documento a 360; controles y chips de 44 px. **Pendiente para el Lead antes de
  marcar la casilla**: (a) la ficha de destino (`/explorar/competicion/30665`) funciona y enseña su
  temporada en el título, pero su desplegable de temporada no incluye 2016-17 porque
  `temporadasPublicables` recorta a 2023-24 en `apps/web/src/lib/pantalla-competicion.ts` (lo usan
  `[id]/page.tsx`, `[id]/calendario` y `[id]/jornadas`); (b) «Explorar» de la cabecera sigue
  enlazando a `/competiciones` (web vieja) y no a esta ruta; (c) el enlace desde la ficha de
  competición a esta búsqueda no está puesto.
- 05/11/2026: **«Calendario y jornadas completos» implementado, pendiente de validación del Lead (la
  casilla sigue SIN marcar).** Rutas nuevas: `/explorar/competicion/[id]/calendario` (todas las
  jornadas del grupo, agrupadas, con filtros de jornada/equipo/estado y enlaces a jornada y acta) y
  `/explorar/calendario` (global, por fechas, con federación, temporada, jornada, rango de fechas y
  búsqueda, paginado de 60 en 60). Consulta nueva `apps/web/src/consultas/calendario.ts` (no se tocó
  `partidos.ts`). Medido contra el canónico: primera página de CyL 43 ms, todas las federaciones
  235 ms, peor caso con búsqueda 304 ms, opciones de filtros 20 ms (presupuesto declarado 800/300 ms).
  Pruebas `apps/web/test/calendario-pantalla.test.ts` en verde (52) y `tsc` verde; axe sin
  incidencias serias ni críticas y sin desbordamiento de documento en 1440 y 360, claro y oscuro.
  Capturas en `tmp/calendario-*.png`. Los partidos con acta analizada enlazan a
  `/explorar/acta/[id]` (la pantalla del objetivo 1, que ya responde). Pendiente fuera de esta tarea:
  la pestaña/enlace de la cabecera lo integra el Lead.
- 05/11/2026: fichas de jugador, equipo y club implementadas con datos reales de CyL, contra los
  artboards. No se marca la casilla 3: falta la validación del Lead y la integración de los enlaces
  desde la cabecera y desde Jornada/Acta.
- 05/11/2026: acta del partido implementada contra `prototipo/Acta.dc.html` con datos reales del
  canónico (referencia 94040 y casos reales de acta a revisar y parcial). Una sola consulta y su plan
  guardado; el enlace desde el detalle de Jornada sólo se pinta en partidos con acta publicada. No se
  marca la casilla 1: falta la validación del Lead.
- 05/11/2026: **objetivo 7 implementado, pendiente de validación (casilla SIN marcar).** Registro real
  sin Better Auth: `app.credencial` (scrypt) y `app.sesion` (SHA-256 del token) en migraciones nuevas
  **0057** y **0058**; `app.alta_cuenta` crea usuario y credencial en una transacción reutilizando
  `app.alta_usuario` (invitación/aprobación/abierto); entrada con mensaje único, freno por cuenta y por
  IP, cookie `httpOnly`/`SameSite=Lax`, cierre de sesión, caducidad de 7 días y limpieza de caducadas.
  `/mi-panel` lee `app.mis_accesos` y traduce sus enlaces a `/explorar/…`; la estrella de favorito de
  club, equipo y jugador vive en `componentes/fichas/Cabeceras.tsx` (no se tocaron las páginas de las
  fichas) y usa `GET/POST /api/favoritos` con el `user_id` de la sesión. No se instaló ninguna
  dependencia; no se tocaron `.env`, migraciones aplicadas, ingesta ni servidor. Pruebas: 23 unitarias
  de cuenta + 4 de flujo real contra PostgreSQL + 13 de `/entrar` + 6 de `/mi-panel`, `tsc` verde
  (salvo un error de una prueba de estadísticas de otro compañero en curso). Comprobado con Chrome
  real: alta, entrada correcta e incorrecta, cookie, favorito, panel y cierre; axe 0 en 1440 y 360, sin
  desplazamiento horizontal. Capturas en `pruebas/cuentas/`. Detalle en
  `docs/plataforma-web/CUENTAS.md`. **Pendiente del Lead:** validar el flujo y decidir si una
  invitación de prueba (`FACYLF-PRUEBA-2026`, 20 usos) se queda en la base local o se retira.

- 05/11/2026: **API pública v1 implementada, pendiente de validación del Lead (casilla 6 sin marcar).**
  Siete endpoints en `/api/v1` (índice, competición, acta, calendario y fichas de equipo/jugador/club)
  que reutilizan las consultas del catálogo, con ETag/304, caché HTTP pública, `X-Cache` y límite de
  300 peticiones/minuto/IP (429). Caché por etiquetas con `POST /api/revalidar` y consumo de
  `ops.invalidacion` cada minuto; medido con curl y `EXPLAIN (ANALYZE, BUFFERS)`: HIT ~31-38 ms p50,
  MISS ~46-84 ms p50, 304 ~49-103 ms p50, las 14 consultas dentro de presupuesto y sin `Seq Scan` en
  tablas de hechos (sin índice nuevo). Contrato en `docs/plataforma-web/API.md`; pruebas en
  `apps/web/test/api-v1.test.ts` (26). Aviso: la cola de invalidaciones tiene 1,7 M de etiquetas
  pendientes de una proyección histórica (se vacía sola a 2000/min, ~14 h).

- 05/11/2026: **«Estadísticas y páginas de gráficos» implementado, pendiente de validación del Lead (la
  casilla sigue SIN marcar).** Rutas nuevas: `/explorar/estadisticas` (federación y temporada; buscador
  de competición que enlaza a la vista de un grupo) y `/explorar/competicion/[id]/estadisticas`, que
  funciona también con grupos históricos (30665, 2016-17). Contenido: cifras del ámbito (partidos con
  resultado, goles, goles por partido, actas), reparto de resultados, puntos acumulados por jornada,
  goles por mes, goles por tramo de quince minutos, goleadores, disciplina, casa/fuera y forma. Los
  gráficos son SVG sin librería nueva, con `role="img"` y `aria-label`, resumen en texto, tabla
  equivalente en `<details>`, letras en la forma (G/E/P) y en la disciplina (A/R) para no depender sólo
  del color, y tokens del sistema. Consultas nuevas en `apps/web/src/consultas/estadisticas.ts`
  (`resumen-de-estadísticas`, `eventos-del-grupo`, `goleadores-de-estadísticas`,
  `opciones-de-estadísticas`); no se tocaron `partidos.ts`, `paneles.ts`, `analisis.ts`, fichas, acta ni
  calendario. Reglas puras en `apps/web/src/lib/estadisticas.ts`; componentes en
  `apps/web/src/componentes/estadisticas/`; pruebas en `apps/web/test/estadisticas-pantalla.test.ts`
  (42), con contrato real contra 3769 (32 partidos, 135 goles con minuto, tarjetas) y 30665 (156 de 157
  partidos, 615 goles, **ninguna tarjeta publicada**: la página lo dice). Medido con el rol de lectura:
  resumen CyL 2026-27 103 ms (2025-26, 420 ms; presupuesto 1.200), goleadores 13 ms, eventos de grupo
  3–5 ms, opciones 2 ms; TTFB 143–216 ms y carga 0,5–1,2 s en el servidor de desarrollo. Comprobado con
  Chrome real: 1440/400/360 claro y 1440 oscuro, axe 0 serias/críticas y sin desplazamiento horizontal;
  estados de carga y «sin datos»; 404 real para grupo inexistente o id no numérico; capturas en
  `tmp/estadisticas-*.png`. **Pendiente para el Lead antes de marcar la casilla**: (a) añadir la pestaña
  «Estadísticas» a `CabeceraCompeticion` (el tipo `activa` y el `href`; la página ya pasa
  `activa="estadisticas"` mediante un cast y hoy no se marca ninguna pestaña, mejor que marcar otra) y
  enlazar desde la ficha de competición; (b) decidir si el buscador de competición de la página global
  se queda como acceso al selector existente o pasa a un desplegable de grupos; (c) el endpoint
  `/api/v1/estadisticas` que el objetivo 6 dejó reservado puede servirse ya con estas consultas (no se
  tocó la API).

- 05/11/2026: **bloque 2 completo; validación del Lead (05/11/2026)**. Casillas 1–3 validadas con
  e2e (40/40 entonces) y 4–7 con las pruebas de selector (20), estadísticas (42), API (26) y cuentas
  (94); `tsc` y `lint` verdes. Integración final: pestañas Calendario y Estadísticas en la cabecera de
  competición, «Explorar» al selector nuevo, enlaces a fichas desde clasificación/jornada/acta y la
  búsqueda, y el buscador con las rutas nuevas. La condición de cierre («puedo pedir cualquier
  competición/temporada y ver calendario, clasificación, jornadas, actas y estadísticas») se cumple
  con datos reales: probado con 3769 (2026-27) y 30665 (2016-17, «Segunda Juvenil 2017, Burgos»).
  Lo que queda fuera del bloque: artboards de administración, ojeo, rankings, comparador y publicidad;
  las cuentas no tienen verificación de correo, recuperación de contraseña ni 2FA, y están dichas en
  `CUENTAS.md` sin fingirlas.

- 05/11/2026: **QA ronda 6 (NO APTA) y ronda 7 (APTA)**. La ronda 6 encontró un contraste serious en
  la ficha de jugador en oscuro (chip de federación a 4,33:1) y cuatro importantes: federaciones de
  prueba visibles, `/mi-panel` sin tema, etiqueta «Actas» ambigua y tamaños de escudo. Corregido:
  chip con `text-[var(--texto)]`, `f.codigo not like 'pruebas%'` en `SQL_FEDERACION_NO_EXCLUIDA`
  (incluye `/explorar/competicion/1117` y API → 404), `/mi-panel` en `RUTAS_CON_TEMA`, «Actas
  correctas» y tamaños 22×24/56×56 confirmados con `getBoundingClientRect`. La ronda 7 dio **APTA**:
  axe 0 en jugador oscuro a 1440/360, 0 apariciones de federaciones de prueba, escudos exactos y
  base limpia (0 usuarios/sesiones/favoritos). `pnpm test` 1061, e2e 48/48, web 478, `tsc`, `lint` y
  `next build` en verde.