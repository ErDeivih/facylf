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

## Revisión de las capturas (David, 05/11/2026)

- [x] **Marca**: logo propio y nombre de producto; pie «archivo privado» retirado; navegación explicada.
  Hecho como **Balompié** (provisional) con logotipo de cancha, tagline, favicon, pie sustituido por un
  enlace a Publicidad y descriptores en la navegación. El nombre se cambia en `componentes/marca/marca.ts`.
- [x] **Jornadas**: tablas por jornada con resultados, equipos y actas enlazados; 4 tablas por fila en PC,
  apiladas en móvil; árbitro, escudos y nombres cortos; fecha derecha = última jornada jugada
  (`fecha_ultima_jugada`). Los asistentes de árbitro no están en `core.match_official` y no se inventan.
- [x] **Nombres cortos de equipo**: migración 0060 (`analytics.nombre_corto_equipo`), 34.904/34.904
  equipos de CyL, reglas + 2.569 manuales; integrados en jornadas, acta, clasificación y calendario.
- [x] **Acceso**: registro abierto sin invitación (0059), `/entrar` y `/crear-cuenta` separados, avisos
  «más adelante» sin botones falsos; sin verificación de correo ni captcha, documentado.
- [x] **Historiales**: jugador, equipo y club, enlazados desde las fichas; varios equipos del mismo club y
  cambios a mitad de temporada. Declarados los huecos del canónico.
- [x] **Estadísticas de árbitros, entrenadores y delegados**: fichas con datos reales, medias y V-E-D.
  Los asistentes de árbitro no existen en el canónico.

## Pantallas restantes del prototipo (continuación)

- [x] **Inicio / Main** rediseñado: buscador, competiciones reales de CyL y «Tus equipos» con sesión.
- [x] **Rankings y Ojeo**: `/explorar/rankings` (goleadores/tarjetas, filtros y paginación) y
  `/explorar/ojeo` (perfiles, edad calculada, minutos y posición) con datos reales y CyL por defecto.
- [x] **Comparar jugadores**: `/explorar/comparar`, selección por nombre/id sin unir identidades.
- [x] **Federación y Liga**: `/explorar/federacion/[codigo]` y `/explorar/liga/[id]` con cobertura,
  resultados, goles por tramo, cantera y disciplina.
- [x] **Cuenta**: `/mi-cuenta` con datos, preferencias de aviso, seguridad y cierre de sesión.
- [x] **Administración**: `/admin` y `/admin/usuarios` con guardia de servidor, resumen, usuarios,
  invitaciones, auditoría y paginación; sólo lectura y sin datos personales sensibles.
- [x] **Datos, Salud y Estados**: `/explorar/datos`, `/explorar/salud` y `/explorar/estados` con datos
  reales de observabilidad y estados honestos.
- [x] **Publicidad**: `/explorar/publicidad`, enlazada desde el pie; espacios reales apagados y sin
  campañas inventadas.
- [x] **Backend/API de estadísticas, historiales y oficiales**: siete endpoints nuevos en `/api/v1` con
  ETag/304, caché por etiquetas y contrato documentado.

- [ ] **Cobertura completa de Castilla y León**: a 05/11/2026 hay **133/889 competiciones completas**
  (85 % por terminar) según `metricas-facylf.json`; las pantallas nuevas priorizan CyL por defecto y
  muestran la cobertura real, pero la recogida la siguen haciendo los colectores programados
  (servidor/PC, sin cambiar su ritmo). No se abre ninguna otra federación por defecto.

## Terminado cuando

Puedo pedir cualquier competición/temporada y ver calendario, clasificación, jornadas, actas,
estadísticas e historiales sin que falte nada.


## Bitácora

- 05/11/2026: **backend de Mi cuenta**: preferencias de aviso editables (`POST
  /api/cuentas/preferencias`, validación y CSRF por `Origin`, `user_id` de la cookie) y descarga de
  datos (`GET /api/cuentas/exportar`, `app.exporta_mis_datos`, `no-store`). La baja y el cambio de
  contraseña siguen no disponibles y se dicen. Administración sigue deliberadamente en sólo lectura.
- 05/11/2026: **pantallas restantes del prototipo completadas y API v1 ampliada.** Inicio/Main, Mi
  cuenta, Rankings, Ojeo, Comparar, Federación, Liga, administración (`/admin` y `/admin/usuarios`),
  Datos, Salud, Estados y Publicidad, con datos reales y CyL por defecto; cabecera con Rankings, Ojeo y
  Comparar enlazados; portada con tema oscuro; siete endpoints nuevos en `/api/v1` (estadísticas,
  historiales y oficiales) con ETag/304 y caché. QA ronda 12 **APTA** tras corregir el contraste del
  comparador en oscuro y los textos internos de Datos/Salud. Puertas finales: suite completa **1.353/1**,
  e2e **64/64**, web **770/1**, `tsc`, `lint` y `next build` verdes; `ops.chequeos()` sube el presupuesto
  a 30 s porque bajo carga del banco de pruebas tarda más de 10 s (la pantalla lo cachea 5 min).

- 05/11/2026: **pantallas de Liga y de Publicidad implementadas, pendientes de validación del Lead
  (sin marcar ninguna casilla).** Rutas nuevas: `/explorar/liga/[id]` (el id es
  `core.phase_group.id`, el mismo de la ficha de competición: resultados recientes de la última
  jornada jugada, cuándo se marcan los goles con el tiempo añadido, minutos de cantera de los equipos
  inferiores del mismo club, clasificación resumida y disciplina por equipo; enlaces a competición,
  jornada, acta y ficha de cada equipo) y `/explorar/publicidad` (diseño y estado de los siete huecos,
  reglas, y «sin espacios contratados»; enlazada desde el pie, no desde la cabecera). Consulta nueva
  `apps/web/src/consultas/liga.ts` (`disciplina-y-cantera-del-grupo`, presupuesto 400 ms; mediana
  33 ms en caliente) que reutiliza sin copiar `GRUPO_POR_ID`, `CLASIFICACION_DE_LA_PANTALLA`,
  `PARTIDOS_DE_GRUPO` y `EVENTOS_DEL_GRUPO`; reglas puras en `apps/web/src/lib/liga.ts` y
  `apps/web/src/lib/publicidad.ts`; componentes en `componentes/liga/` y `componentes/publicidad/`;
  prueba `apps/web/test/liga-publicidad.test.ts` (27). Medido en el servidor de desarrollo: TTFB
  0,85–0,96 s para la liga 797, 0,76–0,85 s para la 3769 y 0,08–0,10 s para publicidad; gzip 24,7 /
  23,1 / 11,5 KB. axe 0 serias/críticas en 1440/360 claro y oscuro, sin desplazamiento horizontal;
  404 real para id inexistente y página de liga sin datos con sus estados explícitos. **Límite
  declarado**: los datos de campañas (`app.espacio_anuncio`, `app.campana_anuncio`) sólo los puede
  leer `facylf_app`, así que la página pública de publicidad es informativa y no refleja campañas en
  vivo; el estado comprobado el 05/11/2026 era: 7 huecos con proveedor «ninguno» y apagados, 0
  campañas y 0 impresiones. Capturas en `tmp/liga-*.png` y `tmp/publicidad-*.png`.

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

- 05/11/2026: **feedback de capturas aplicado**. Marca provisional **Balompié** con logotipo propio,
  pie legal retirado y navegación explicada; jornadas en tablas (4 por fila en PC, apiladas en móvil,
  árbitro, escudos, actas y nombres cortos), fecha derecha corregida con `fecha_ultima_jugada`; nombres
  cortos guardados para 34.904 equipos de CyL; registro abierto en `/entrar` + `/crear-cuenta`; historiales
  de jugador, equipo y club enlazados desde las fichas; fichas de árbitro, entrenador y delegado. Los
  asistentes de árbitro no están en el canónico y no se inventan. QA ronda 8 encontró dos bloqueantes
  (acta sin nombres cortos y portada con axe), corregidos; ronda 9 cerró la portada y dejó abierto el
  `h1` del acta; ronda 10 dio **APTA** con el `h1` corto y el completo en `title`. Suite completa
  1.183/1, e2e 58/58, web 600/1, `tsc`, `lint` y `next build` verdes.

- 05/11/2026: **QA ronda 6 (NO APTA) y ronda 7 (APTA)**. La ronda 6 encontró un contraste serious en
  la ficha de jugador en oscuro (chip de federación a 4,33:1) y cuatro importantes: federaciones de
  prueba visibles, `/mi-panel` sin tema, etiqueta «Actas» ambigua y tamaños de escudo. Corregido:
  chip con `text-[var(--texto)]`, `f.codigo not like 'pruebas%'` en `SQL_FEDERACION_NO_EXCLUIDA`
  (incluye `/explorar/competicion/1117` y API → 404), `/mi-panel` en `RUTAS_CON_TEMA`, «Actas
  correctas» y tamaños 22×24/56×56 confirmados con `getBoundingClientRect`. La ronda 7 dio **APTA**:
  axe 0 en jugador oscuro a 1440/360, 0 apariciones de federaciones de prueba, escudos exactos y
  base limpia (0 usuarios/sesiones/favoritos). `pnpm test` 1061, e2e 48/48, web 478, `tsc`, `lint` y
  `next build` en verde.
- 05/11/2026: **revisión de capturas · ACCESO implementado, pendiente de validación (la casilla de
  «Acceso» sigue SIN marcar).** Registro abierto: migración nueva **0059** pone
  `app.ajuste.registro_modo = 'abierto'` (idempotente; no se tocan 0057/0058) y la web deja de pedir
  código de invitación; `app.alta_cuenta`/`app.alta_usuario` crean la cuenta activa sin consumir
  invitación, con el paquete por defecto (sólo favoritos y datos públicos). `/entrar` queda sólo para
  entrar y el alta se separa en `/crear-cuenta`, con enlaces entre ambas y `volver` conservado.
  «Avisos» se anuncia en `/mi-panel` como «más adelante», sin botones ni push. Se mantienen scrypt,
  sesión con token hasheado, CSRF por `Origin` y los límites de entrada/alta. Pruebas actualizadas:
  cuentas (23), flujo real contra PostgreSQL (4), `/entrar` (8), `/crear-cuenta` (9) y `/mi-panel`
  (7); `tsc` verde. Chrome real 1440/360 con axe 0 y sin desplazamiento; capturas en
  `tmp/acceso-*.png`. Detalle en `docs/plataforma-web/CUENTAS.md`.

- 05/11/2026: **revisión de capturas, punto «Marca» implementado y pendiente de validación (casilla
  SIN marcar).** Nombre provisional **Balompié** y tagline «fútbol federado, temporada a temporada» en
  un único sitio (`componentes/marca/marca.ts`): cabecera, `metadata` del layout y título por defecto.
  Logotipo propio en `componentes/marca/Logotipo.tsx` (baldosa del acento con la cancha dibujada:
  rectángulo, línea de medio campo y círculo central; 28×28, decorativo porque la marca va en texto) y
  `app/icon.svg` con el mismo dibujo. Se retira el pie «Archivo privado. No es una web oficial.» del
  layout (sin sustituirlo). Las funciones de la barra se explican con un descriptor de dos líneas en
  escritorio (≥1280) y `sr-only` + `aria-describedby` + `title` por debajo, porque el espacio es del
  buscador: Explorar → «Competiciones y grupos» (a `/explorar/competiciones`), Rankings → «Goleadores»
  (a `/explorar/estadisticas`, con `seccionActiva` marcándola), y Ojeo/Comparar quedan desactivadas
  (`aria-disabled` + nombre accesible + `title`, sin enlaces muertos). El anillo de foco de la nav ya
  no se recorta (padding interno del contenedor de desplazamiento). Pruebas
  `apps/web/test/cabecera-sitio.test.ts` 12/12 (marca, tagline, logotipo, favicon sin «--» en
  comentarios, funciones explicadas, pie ausente, órdenes de foco y sección activa); `tsc` verde.
  Chrome real 1440/360 y oscuro con axe 0 serias/críticas, sin desplazamiento horizontal y objetivos de
  44 px; capturas `tmp/marca-1440.png`, `tmp/marca-360.png`, `tmp/marca-oscuro-1440.png` (y
  `tmp/marca-logo.png`, `tmp/marca-icono.png`, `tmp/marca-vieja-1440.png`). **Pendiente**: validación
  del nombre y del logotipo; los `<title>` por pantalla de otros ficheros (`app/entrar`,
  `app/mi-panel`, fichas, `lib/calendario.ts`, `lib/estadisticas.ts`, `lib/jornadas.ts`, `lib/acta.ts`,
  `lib/pantalla-competicion.ts`) siguen diciendo «— facylf»: no se tocan aquí porque son de otros
  agentes y algunos están en edición.

- 05/11/2026: **revisión de capturas · nombres cortos de equipo y fecha de última jornada (datos),
  pendiente de integración y validación.** La migración de nombres cortos se aplicó como **0060**
  (el Lead la renombró para no chocar con `0059-registro-abierto`, que sigue intacta). Tabla
  `analytics.nombre_corto_equipo` con `team_entry_id` PK, `nombre_corto` no vacío, `metodo`
  (`regla`/`manual`), `confianza` 0..1 y `observado_en`; grants SELECT a `facylf_lector` y
  SELECT/INSERT/UPDATE/DELETE a `facylf_publicador`. Poblado con
  `scripts/nombres-cortos-equipos.mjs` (reglas en `scripts/lib/nombres-cortos.mjs`, decisiones manuales
  incluidas) sobre los **34.904 equipos de CyL**: todos con nombre corto, 2.569 filas `manual` (7,36 %),
  17 con confianza < 0,7 para revisar. Ejemplos guardados: `Isoba`, `R. Valladolid`, `Santa Marta`,
  `Ponferradina`, `Salamanca CF`. Segunda pasada del script: 0 filas modificadas (idempotente).
  Consultas ampliadas: `local_nombre_corto`/`visitante_nombre_corto` en `partidos-de-grupo` (y en el
  acta), `equipo_corto` en `clasificación-de-la-pantalla`, `rival_corto` en `partidos-del-equipo`,
  `equipo_corto`/`rival_corto` en `partidos-de-persona` y `fecha_ultima_jugada` en `grupo-por-id`
  (3769: 2026-10-04; 75252: `null` pese a tener calendario el 2026-10-17). Medido con el rol de lectura:
  `grupo-por-id` 9,5 ms, clasificación 10,8 ms, partidos 55,9 ms, partidos del equipo 7,2 ms y partidos
  de persona 44,2 ms. Planes guardados actualizados. 13 pruebas nuevas y suite web en verde (541). En
  el momento de cerrar, `tsc` fallaba sólo por `consultas/historial.ts`, un fichero en edición de otro
  agente; mis ficheros compilan. El uso del nombre corto en jornadas/móvil y la fecha derecha de la
  barra los integra `pantalla`.

- 05/11/2026: **historial de jugador implementado, pendiente de validación del Lead (el punto
  «Historiales» del feedback de capturas sigue SIN marcar: faltan equipo, club, equipos de un club y
  equipo por temporadas).** Ruta nueva `/explorar/jugador/[id]/historial` (id `core.person.id`), sin
  editar pantallas existentes; el enlace desde la ficha lo integra el Lead. Consulta nueva
  `apps/web/src/consultas/historial.ts` (`historial-de-jugador`, una sola consulta: persona +
  apariciones en JSON, con goles/tarjetas de `match_event` y minutos fiables del resumen por
  equipo-temporada); reglas puras en `apps/web/src/lib/historial-jugador.ts` (tramos, cambios,
  solapes, resumen); componentes en `apps/web/src/componentes/historial/`. Pruebas
  `apps/web/test/historial-jugador.test.ts` (25), contrato real con la persona 1181455 (144
  apariciones, 8 inscripciones, 5 temporadas, cambio real de club a mitad de 2015-16) y 19057 (dos
  equipos del mismo club con fechas solapadas). `EXPLAIN (ANALYZE, BUFFERS)`: 7,06 ms (presupuesto 400;
  el primer intento con `analytics.federacion_ficha` daba 590 ms y se quitó). Página en caliente
  0,55–0,71 s en el servidor de desarrollo. Axe 0 serias/críticas en 1440/360 claro y oscuro, sin
  desplazamiento horizontal, un solo `h1` y 404 real; capturas en `tmp/historial-jugador-*.png`.
  Casos que no existen en el canónico: no hay dos inscripciones del mismo grupo en una temporada
  (imposible por esquema) y las identidades nominales con «muchos equipos» (p. ej. 12137, 15 equipos)
  son colisiones de nombre, no traspasos: la página conserva el aviso de identidad nominal y no fusiona.

- 05/11/2026: **feedback de capturas de JORNADAS implementado, pendiente de validación del Lead (el
  punto «Jornadas» de la revisión sigue SIN marcar).** `/explorar/competicion/[id]/jornadas` ahora son
  tablas: una por jornada, con `Jornada N`, fechas publicadas y estado (jugada, parcial, programada,
  sin fecha); resultados local-marcador-visitante con escudo en cada partido, filas enlazadas a
  `/explorar/equipo/[id]`, árbitro publicado en cada partido y enlace a `/explorar/acta/[id]` sólo con
  acta analizada. La rejilla es de 4 tablas por fila en escritorio (`sm:grid-cols-2` y
  `xl:grid-cols-4`), 2 en tablet y 1 en móvil; en móvil cada partido apila los dos equipos y deja el
  marcador a la derecha. Los nombres usan `local_nombre_corto`/`visitante_nombre_corto` guardados
  (fallback puro `nombreCorto()` en `apps/web/src/lib/nombres-equipo.ts` para lo que falte; los casos
  dudosos se quedan completos). La barra de temporada muestra a la derecha
  `GRUPO_POR_ID.fecha_ultima_jugada` (`max(coalesce(played_at, fecha_prevista))` sólo de partidos con
  resultado), no la última programada: 75256 enseña 3 oct y no el 4 oct del calendario; 75252 no tiene
  ninguna jornada jugada y no finge la fecha del 17 oct. Se actualizaron `CabeceraCompeticion`, la
  página de clasificación, calendario y estadísticas para pasar esa fecha; el detalle usa el mismo
  componente de partidos (árbitro, escudos, actas) y la tarjeta lateral de clasificación pasa a
  escudos/nombres cortos/árbitro/acta. Pruebas: `jornada-pantalla.test.ts` 31, `nombres-equipo.test.ts`
  7 y `competicion-pantalla.test.ts` 63 (contrato de `fecha_ultima_jugada`, 3769 = 2026-10-04 y 75252 =
  null, columnas de nombres cortos); las cinco suites relacionadas suman 195 en verde. `tsc` en verde al
  cerrar. Chrome real: axe 0 serias/críticas y sin desplazamiento horizontal en 1440/400/360 claro y
  1440 oscuro; capturas `tmp/jornadas-tablas-1440.png`, `-360`, `-400`, `-1440-oscuro`,
  `tmp/jornadas-tablas-30665-1440.png`, `tmp/jornadas-tablas-75252-1440.png`,
  `tmp/jornadas-clasificacion-797-1440.png`, `tmp/jornadas-detalle-1440.png` y
  `tmp/jornadas-detalle-360.png`. **Pendiente para el Lead**: validar el conjunto; decidir si la tabla
  de clasificación también debe usar `equipo_corto` (la consulta ya lo trae, la tabla sigue con el
  nombre completo) y si el listado debe paginar/plegar jornadas cuando la temporada esté completa (hoy
  pinta todas las publicadas seguidas).

- 05/11/2026: **estadísticas de árbitros, entrenadores y delegados implementadas, pendiente de
  validación del Lead (la casilla sigue SIN marcar).** Rutas nuevas `/explorar/arbitro/[id]`,
  `/explorar/entrenador/[id]` y `/explorar/delegado/[id]` con el id canónico de `core.person`; contrato
  en `docs/plataforma-web/` no cambiado (no se existe API todavía para estas fichas). Una consulta por
  pantalla en `apps/web/src/consultas/oficiales.ts` (`arbitro-por-id`, `entrenador-por-id`,
  `delegado-por-id`; `plan: indexado`, presupuesto 400 ms): **21,7 / 15,6 / 15,1 ms p50** con el rol de
  lectura (EXPLAIN ANALYZE: 6,97 / 3,20 / 2,56 ms) y **ningún `Seq Scan`** en `core.match`,
  `match_event`, `match_official`, `match_staff` ni `match_report`. La media del árbitro se compara con
  la de TODA su competición (240 partidos con acta en 797, no sus 10). Reglas puras en
  `apps/web/src/lib/oficiales.ts`: normaliza los 171 literales de rol del acta (español, euskera,
  catalán e inglés) a familias —entrenador, segundo, portero, delegado de equipo, delegado de campo— y
  con la MISMA regla que el SQL; V-E-D para la racha; medias que devuelven `null` (nunca 0) sin partidos
  con acta. Componentes en `apps/web/src/componentes/oficiales/` (cabecera, piezas y una sección por
  figura) reutilizando `Cifras`/`TARJETA` de estadísticas y los tokens del sistema. Pruebas
  `apps/web/test/oficiales-pantalla.test.ts`: **33 en verde**, con contrato real (18951 = 10 partidos,
  37 amarillas, 12 rojas, 4 penaltis y la competición 1101/240; 19080 = 30 partidos, 13-5-12; 19236 = 30
  partidos como «DEL. Equipo»), 404 (id inexistente, no numérico, persona sin rol y rol cruzado) y
  textos prohibidos (§8). `tsc` en verde. Chrome real: axe **0** serias/críticas en 1440/360 claro y 1440
  oscuro, sin desplazamiento horizontal a 360; capturas `tmp/oficiales-arbitro-1440.png`, `-360`,
  `tmp/oficiales-entrenador-*`, `tmp/oficiales-delegado-*` y `*-oscuro-1440.png`. **Límite**: sólo
  árbitro principal (`core.match_official` no guarda asistentes; no se inventan). El enlace acta →
  ficha del árbitro queda pendiente: `ACTA_DEL_PARTIDO` no devuelve el `person_id` de los oficiales y
  esa consulta vive en `partidos.ts`, fuera del alcance de esta tarea; cuando se añada el id, el enlace
  es una línea en `componentes/acta/ContextoActa.tsx`.
- 05/11/2026: **API v1 ampliada con estadísticas, historiales y fichas de oficiales; pendiente de
  validación del Lead (la casilla «Backend/API de estadísticas, historiales y oficiales» sigue SIN
  marcar).** Siete endpoints nuevos, reutilizando las consultas existentes sin copiar SQL:
  `GET /api/v1/estadisticas/competicion/[id]` (grupo-por-id + partidos + eventos + goleadores; resumen
  con la función pura de la página), `GET /api/v1/ficha/jugador/[id]/historial`,
  `/ficha/equipo/[id]/historial`, `/ficha/club/[id]/historial`, y
  `GET /api/v1/oficiales/arbitro/[id]`, `/entrenador/[id]`, `/delegado/[id]`. Mismo sobre, errores, ETag/304, `Cache-Control` y límite de la
  API v1; ids inválidos 400, recursos inexistentes 404 y **un jugador en la ficha de árbitro es 404**
  (no se inventa una ficha vacía). Sin datos de cuenta. Etiquetas nuevas en `lib/cache.ts`:
  `estadisticas` (grupo), `historiales` (persona/equipo/club) y `oficiales` (persona), con derivación
  desde grupo/edición/federación/equipo/club/persona; el índice `/api/v1` ya las anuncia como
  `disponible` (antes `estadisticas` era «planeado»). Medido en dev: MISS p50 28,9–120,2 ms, HIT p50
  15,2–33,2 ms, 304 5/5 por recurso; `EXPLAIN` de las 10 consultas implicadas dentro de presupuesto y
  sin `Seq Scan` en tablas de hechos (19,9 ms la más lenta, historial de club). **No se añade ningún
  índice ni migración.** Pruebas nuevas `apps/web/test/api-v1-ampliacion.test.ts` (12) y contrato real
  con 3769, 1181455, 17609, 1495, 657011, 1251791 y 1072476; `tsc` aislado de la API en verde. La suite
  web completa queda en 633 pasadas y una suite externa roja (`rankings-ojeo.test.ts`, de otro agente en
  vuelo); `tsc` global bloqueado por ese mismo fichero externo. `docs/plataforma-web/API.md` actualizado
  con recursos, parámetros, errores, tabla de mediciones y pendientes; evidencia en
  `tmp/api-ampliacion-mediciones.json`, `tmp/api-curl-ampliacion.txt` y
  `tmp/api-ampliacion-explain.json`.
- 05/11/2026: **Administración (AdminInicio y Admin) implementada, pendiente de validación (la
  casilla «Administración» sigue SIN marcar).** Rutas **`/admin`** y **`/admin/usuarios`** con datos
  reales de `consultas/admin.ts` (rol `facylf_app`): resumen de cuentas, invitaciones, avisos,
  accesos sensibles, procesos, auditoría y lista de usuarios con filtros por estado/nombre. Guardia en
  servidor: sin sesión → `/entrar?volver=<ruta>`; con sesión sin rol `administrador` o sin
  `administrar_usuarios` → **404** (no 403, no se revela la zona); no se acepta `user_id` por la URL y
  ambas páginas son `no-store`. **Sólo lectura**: no hay botones de aprobar/rechazar/bloquear; se dice
  en pantalla. 2FA/verificación no implementadas, también dicho. Pruebas
  `apps/web/test/admin-pantallas.test.ts` (22: decisión de guardia, guardia de servidor con sesión
  simulada, render con fixtures y contrato de consultas reales). Chrome real 1440/360: 200 como
  administrador, 404 como usuario normal, axe 0 y sin desplazamiento horizontal; capturas en
  `tmp/admin-*.png`. Detalle en `docs/plataforma-web/ADMINISTRACION.md`.

- 05/11/2026: **pantallas restantes · comparador de jugadores y ficha de federación, hechos y pendientes
  de validación (casillas «Comparar jugadores» y «Federación y Liga» SIN marcar).** Rutas nuevas
  **`/explorar/comparar`** (selección por nombre o id; si un nombre coincide con varias personas se
  enseñan y no se elige solo; dos consultas en una foto: personas y trayectorias; métricas de carrera con
  «sin datos» en el lado que falte, barras espejo y rejilla de trayectorias con tabla accesible) y
  **`/explorar/federacion/[codigo]`** (por defecto redirige a `castilla-leon`; identidad con escudo,
  «qué datos publica» medido, avisos con cifra, 12 de las 55 competiciones de 2026-27 con su nivel y
  enlace a su grupo, y comparativa con otras federaciones). Consultas nuevas
  `apps/web/src/consultas/comparar.ts` y `federacion-ficha.ts` (reutiliza `FICHA_FEDERACION` y
  `AVISOS_DE_DATOS` de `federaciones.ts`); lógica en `apps/web/src/lib/comparar.ts` y
  `lib/federacion-ficha.ts`; componentes en `componentes/comparar/` y `componentes/federacion/`.
  Medido con rol lector: comparar 2 consultas · 13,5 ms; federación 4 consultas · 92,6 ms (la mayor,
  `ficha-federación` todas, 84 ms; presupuestos 150/300/400/50 ms). Pruebas
  `apps/web/test/comparar-federacion.test.ts` (30) y suite web con 732 pasadas; en el cierre fallan sólo
  dos ficheros de otros agentes (`admin-pantallas` y `cabecera-sitio`) y `tsc` global queda bloqueado por
  `datos-salud-estados` (ajeno); sin errores en los ficheros de esta tanda. Chrome real 1440/360: axe 0
  en las dos, sin desplazamiento horizontal del documento a 360/400, 404 real para código inexistente o
  inválido y redirección por defecto comprobada. Capturas en `tmp/comparar-1440.png`,
  `tmp/comparar-360.png`, `tmp/federacion-1440.png` y `tmp/federacion-360.png`. Pendiente: la pantalla
  **Liga** del par «Federación y Liga» (no incluida en esta tanda) y la validación del Lead.

- 05/11/2026: **Inicio rediseñado y Mi cuenta implementados, pendientes de validación del Lead (los
  puntos «Inicio / Main» y «Cuenta» de la revisión de capturas siguen SIN marcar).** `/` ya no es el
  resumen técnico del archivo: hero de búsqueda que usa la misma consulta canónica que `/buscar`
  (`/buscar?q=…`), «Explorar una competición» con seis competiciones reales de Castilla y León
  (primer grupo de cada edición, para no repetir la misma competición por provincias; cobertura
  medida en cada tarjeta, «Cobertura sin medir» cuando no hay punto de control) y enlace al selector
  `/explorar/competiciones`; y «Tus equipos»: con sesión, hasta tres favoritos de `app.mis_accesos`
  con último/próximo y enlace a su ficha; sin sesión, invitación honesta a entrar o crear cuenta, sin
  equipos inventados; si los favoritos fallan, la portada sigue y lo dice. Consulta de portada
  `grupos-del-selector` con `fed=castilla-leon`, 60 filas para sacar seis ediciones distintas: 44 ms
  de mediana; una sola consulta de catálogo y, sólo con sesión, sesión + favoritos. `Mi cuenta`
  (`/mi-cuenta`) lee `app.perfil(user_id)` con el rol `facylf_app` (una consulta, 23 ms): nombre,
  estado (la fecha de validez manda: «Caducada»), paquete y fin, zona horaria, alta, rol, favoritos y
  avisos sin leer; preferencias reales de aviso (canales, correo/resumen/hora, silencio, eventos) con
  la frase de que los avisos automáticos aún no se envían; seguridad con lo que NO existe dicho
  (verificación de correo, 2FA y cambio de contraseña no implementados) y cierre de sesión POST real
  a `/api/cuentas/salir`; «Tus datos» dice que descarga y baja no están disponibles. Sin sesión invita
  a entrar; si la cuenta no se puede leer, lo dice sin pintar una cuenta vacía. **El correo solo
  puede enseñarse enmascarado si una función SQL lo expone: `facylf_app` no tiene permiso de lectura
  sobre `app.credencial` y la pantalla lo dice («No se muestra en esta pantalla») en vez de inventar
  una dirección.** Añadido el enlace «Mi cuenta» a la cabecera de Mi panel (sin tocar
  `CabeceraSitio`). Ficheros nuevos: `consultas/mi-cuenta.ts`, `lib/cuenta-pantalla.ts`,
  `lib/inicio.ts`, `componentes/inicio/InicioContenido.tsx`, `componentes/cuenta/MiCuenta.tsx`,
  `app/mi-cuenta/page.tsx`, `app/page.tsx` reescrito y pruebas `inicio.test.ts` (10) y `cuenta.test.ts`
  (14). Chrome real con una cuenta de prueba creada y borrada después: 1440/360, axe 0 serias/críticas
  y sin desplazamiento horizontal en Inicio y Mi cuenta, con y sin sesión; capturas
  `tmp/inicio-1440.png`, `tmp/inicio-360.png`, `tmp/inicio-sesion-1440.png`,
  `tmp/inicio-sesion-360.png`, `tmp/cuenta-1440.png`, `tmp/cuenta-360.png`,
  `tmp/cuenta-sin-sesion-1440.png` y `tmp/cuenta-sin-sesion-360.png`. `tsc` de los ficheros de esta
  tanda en verde (al cerrar quedaba un error de otra prueba de otro agente en `datos-salud-estados`).
  **Pendiente para el Lead**: (a) decidir si hace falta la función SQL para el correo enmascarado —
  requiere migración nueva, que esta tarea no aplica—; (b) las preferencias de aviso y el cambio de
  nombre/zona están en solo lectura porque no hay acción/API que guarde, y 2FA, verificación de
  correo, cambio de contraseña, descarga y baja no existen; (c) la portada enseña seis competiciones
  de la temporada más reciente del catálogo de CyL: decidir si se quiere una selección editorial por
  categoría en vez del primer grupo de cada edición.

- 05/11/2026: **Rankings y Ojeo implementados, pendiente de validación (casilla SIN marcar).** Rutas
  `/explorar/rankings` y `/explorar/ojeo`, con datos reales y sin tocar `CabeceraSitio` (los enlaces
  los integra el Lead). Rankings con pestañas Goleadores/Tarjetas y filtros federación/temporada/
  competición/grupo/mínimo de partidos; por defecto CyL, la temporada más reciente y mínimo 5 partidos
  (como el prototipo: con 0, la temporada en curso la encabezaban benjamines con 3 partidos y 20
  goles); tabla con enlaces a jugador, equipo y competición, total real y paginación de 25. Ojeo con
  federación/temporada/categoría/edad (calculada desde la temporada: sub-19 de 2026-27 = nacidos en
  2008 o después)/minutos/posición; 40 perfiles por búsqueda (el total está acotado a 1.001 y se dice
  «más de 1.000»), enlaces a ficha e historial y lista propia a 360 px porque la tabla de 900 no cabe.
  **Los nombres de menores se publican**: la consulta de ojeo recibe el permiso en `true` y una prueba
  exige nombre en filas `es_menor`. Consultas nuevas en `consultas/rankings.ts` (ranking por
  tipo/edición/grupo con `count(*) over ()` para el total y `LIMIT/OFFSET`; ediciones de la federación
  y temporada; categorías del ojeo). Medido contra el canónico: ranking 7–19 ms con mínimo 5 y
  182–195 ms con mínimo 0; ediciones 0,8 ms; categorías 38 ms; ojeo 54–135 ms. Pruebas
  `apps/web/test/rankings-ojeo.test.ts` 21/21 (filtros y URL, edad, contrato de las consultas y
  canónico real) y `cabecera-sitio.test.ts` 12/12; `tsc` global en verde al cerrar. Chrome real: axe 0
  serias/críticas en Rankings y Ojeo a 1440, 360, 400 y en oscuro; sin desplazamiento horizontal del
  documento; capturas `tmp/rankings-1440.png`, `tmp/rankings-360.png`,
  `tmp/rankings-oscuro-1440.png`, `tmp/rankings-tarjetas-1440.png`,
  `tmp/rankings-pagina2-1440.png`, `tmp/rankings-vacio-1440.png`, `tmp/ojeo-1440.png`,
  `tmp/ojeo-360.png`, `tmp/ojeo-oscuro-1440.png` y `tmp/ojeo-posicion-vacio-1440.png`.
  **Pendiente para el Lead**: (a) enlazar «Rankings» a `/explorar/rankings` y activar «Ojeo» a
  `/explorar/ojeo` (dejé `activo.ts` marcando esas rutas); (b) en el canónico la posición de campo
  (`linea`) está vacía en todas las filas, así que filtrar por defensa/medio/delantero devuelve el
  vacío explicado y sólo «Portero» tiene datos —no se inventa—; (c) el pie con «Publicidad» lo añadió
  otro agente: la prueba de cabecera ya sólo exige que no vuelva el texto «Archivo privado».

- 05/11/2026: **Datos, Salud y Estados implementados, pendiente de validación del Lead (la casilla sigue
  SIN marcar).** Rutas nuevas `/explorar/datos` (calidad y cobertura), `/explorar/salud` (estado de la
  plataforma) y `/explorar/estados` (vacíos, carga, error y 404). Fuente única, toda con el rol de
  lectura: `ops.chequeos()` (68 comprobaciones con estado, valor y umbral), `ops.coverage_checkpoint`,
  `ops.recuento_canonico`, `analytics.federacion_capacidad` y `analytics.parametro_capacidad`; sin datos
  de cuentas ni de publicidad. Consultas en `apps/web/src/consultas/observabilidad.ts`
  (`chequeos-de-la-plataforma`, `cobertura-por-temporada`, `capacidad-de-federaciones`,
  `parametros-de-capacidad`, `frescura-y-cobertura`, `ejemplos-de-estados`); las comprobaciones y la
  frescura se cachean 5 minutos (`consultas/observabilidad-cache.ts`), porque `ops.chequeos()` tarda
  ~3,1 s por diseño (ventanas de 60 días sobre tablas de hechos) y `max(ingested_at)` recorre
  `core.match_report` (~0,33 s). Medido con el rol de lectura: comprobaciones 3,07 s p50 (cacheadas;
  presupuesto 6 s), cobertura 15,8 ms, capacidad 28,7 ms, parámetros 1,0 ms, frescura 328 ms, ejemplos
  de estados 48 ms; ninguna consulta de pantalla hace `Seq Scan` sobre tablas de hechos salvo el
  `max(ingested_at)` de la frescura, que está documentado. Reglas puras en
  `apps/web/src/lib/observabilidad-pantalla.ts`: comprobación → nombre/unidad/umbral (lo desconocido se
  enseña legible y no se inventa), peor estado por área, capacidad derivada de los umbrales REALES
  (40 % de cambios, 15 % de tarjetas, 80 % de minuto, 30 % de actas), porcentajes imposibles (>100)
  como «—», temporada de referencia = última cerrada y los cuatro motivos de estado vacío con sus
  cifras reales. Componentes en `apps/web/src/componentes/observabilidad/` con el sistema de diseño y
  una tabla propia con región enfocable (axe marcaba `scrollable-region-focusable` a 360 en la tabla
  compartida). Pruebas `apps/web/test/datos-salud-estados.test.ts` **34 en verde**: reglas puras,
  contrato real (68 comprobaciones, 12 temporadas de CyL, capacidad 2025-26, frescura y cuatro grupos
  reales para Estados), 404 reales de rutas hijas y textos internos prohibidos; toda la web **770
  pruebas en verde** (37 ficheros) y `tsc` global verde. Chrome real: 200 en las tres rutas, axe **0**
  serias/críticas en 1440/360 claro y 1440 oscuro, sin desplazamiento horizontal del documento y sin
  errores de consola; en caliente datos 0,64 s, salud 0,30 s y estados 0,23 s (servidor de desarrollo).
  Capturas `tmp/datos-*.png`, `tmp/salud-*.png` y `tmp/estados-*.png`. **Límites**: (a) no se publican
  datos de cuentas ni publicidad; (b) el tiempo de respuesta por petición no se enseña porque
  `lib/observabilidad.ts` (`midiendo`/`anotaError`/`registraWebVital`) existe pero todavía no está
  integrado en ninguna ejecución: la pantalla lo dice en vez de inventar p95; (c) los estados de cuenta
  del prototipo (solicitud pendiente, acceso suspendido, paquete caducado) son de la pantalla de cuenta
  y no se incluyen aquí.
