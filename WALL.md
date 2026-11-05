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

- [ ] **4. Selector de temporada y de competición «inventada».** Poder pedir, por ejemplo, «Segunda
  Juvenil 2017, Burgos» y obtener calendario, clasificación, jornadas, actas, estadísticas y gráficos.
  Si la competición o temporada no existen en el canónico, hay que crearlas o encontrarlas (ingesta,
  archivo, histórico), no fingir. Estado actual: **selector hecho y validado (05/11/2026)**: ruta
  `/explorar/competiciones`, filtros de federación/temporada histórica/categoría/modalidad/género/
  provincia/nivel/texto, paginación y total real; «Segunda Juvenil 2017, Burgos» encuentra el grupo
  30665 de 2016-17 y lo abre con su temporada seleccionada; «Explorar» de la cabecera ya apunta ahí.
  **Falta para marcar la casilla**: las páginas de estadísticas y gráficos (objetivo 5) para que la
  competición inventada muestre también esas vistas.

- [ ] **5. Estadísticas y páginas de gráficos.** Páginas de estadísticas y gráficos del prototipo
  (equipos, jugadores, competición), con datos y backend detrás. Estado actual: algunos gráficos
  viejos; el rediseño no tiene páginas de estadísticas.

- [ ] **6. Backend e infraestructura para servir todo.** Endpoints, caché y consultas que respondan
  rápido para todas las páginas; medido, no supuesto. Estado actual: consultas canónicas por página,
  APIs de escudo y búsqueda; falta la capa de endpoints/caché para el resto.

- [ ] **7. Registro de usuarios con favoritos.** Registro real, sesión, favoritos de clubes, equipos y
  jugadores y accesos rápidos a horarios y resultados. Estado actual: `/entrar` es sólo diseño
  preparado, sin backend; la cabecera ya enlaza.

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
