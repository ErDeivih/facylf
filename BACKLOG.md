# Backlog — FACYLF

Regla del protocolo: **nunca menos de 5 tareas listas**. Si baja de 5, se generan de las tres fuentes
(competencia, huecos de la especificación, deuda técnica). Una tarea de Nivel 3 se marca
`esperando decisión` con la pregunta exacta y se sigue con la siguiente.

## Hecho

- [x] **(Nivel 2) Métricas para el panel de proyectos.** `scripts/metricas-facylf.mjs` publica
  `metricas-facylf.json` con la forma exacta pedida por David: competiciones totales/completas/porcentaje
  que falta, desglose por temporada y ritmo de peticiones por minuto separado PC/servidor. Lee colas
  SQLite de CyL (PC y servidor por SSH de sólo lectura), el canónico y las peticiones de los últimos
  5 minutos; si una fuente falla no publica ceros (conserva el fichero anterior). 9 pruebas puras.
  Semántica en [`docs/plataforma-web/METRICAS-PANEL.md`](docs/plataforma-web/METRICAS-PANEL.md).

- [x] **(Nivel 2) V-E-D en toda la aplicación.** `lib/forma-equipo.ts` como única traducción
  (`G→V`, `E→E`, `P→D`); clasificación, `Racha`, ficha de equipo y actuaciones de jugador muestran V/E/D
  con palabra accesible. El dato de dominio y las consultas siguen en `G/E/P` (no se tocan contratos).
  7 pruebas nuevas y ajuste de las de presentación.

- [x] **(Nivel 2) Tema claro/oscuro (rutas migradas).** Cookie `tema` resuelta en el servidor
  (`<html data-tema>` en el primer HTML, sin parpadeo), botón accesible 44×44 en la cabecera que alterna
  y persiste, orden de foco = orden visual, axe 0 serias/críticas en claro y oscuro en la pantalla
  nueva. `proxy.ts` limita el tema a `/explorar…`; en las páginas viejas se fuerza claro y no se ofrece
  el botón. 19 pruebas nuevas de tema.

- [x] **(Nivel 1) Poner `pnpm test` en verde.** 27 fallos por el canónico apagado, 2 suites por limpieza
  cuadrática y 21 por FK de `analytics`: los tres diagnosticados y arreglados. Detalle en
  [`INFORME-PRUEBAS.md`](INFORME-PRUEBAS.md). Suite: **633 en verde, 1 saltada, 0 fallos**.
  Puertas: `pnpm lint` y `tsc --noEmit` de la web en verde.

- [x] **(Nivel 2) Pantalla 2 del prototipo, primera versión con datos reales de CyL.** Ruta
  `/explorar/competicion/[id]`: cabecera con desplegables y barra de temporada, pestañas, clasificación
  con zonas y forma, jornada con resultados y goleadores. Datos del canónico (grupo 797, Liga Nacional
  Juvenil 2025-26). 22 pruebas nuevas en `apps/web/test/competicion-pantalla.test.ts`. Decisiones en
  [`DECISIONES.md`](DECISIONES.md); captura en
  [`docs/plataforma-web/capturas/`](docs/plataforma-web/capturas/pantalla-2-clasificacion-cyl-2026-11-04.png).

- [x] **(Nivel 2) Pantalla 2 terminada contra el prototipo y el sistema de diseño (04/11/2026).**
  Componentes rehechos, tokens nuevos, tipografía Inter autoalojada, tabla responsiva con primera
  columna fija, estados vacío/parcial/carga y 404 correcto bajo `Suspense`. Arreglado un fallo real:
  los goles reconstruidos se mezclaban de otra jornada. 39 pruebas de vitest + 16 de Playwright
  (móvil 360 y escritorio 1280) + axe sin serias/críticas. Contrato y evidencia en
  [`docs/plataforma-web/SPEC-PANTALLA-2.md`](docs/plataforma-web/SPEC-PANTALLA-2.md); decisiones 10-19
  en [`DECISIONES.md`](DECISIONES.md); capturas `pantalla-2-clasificacion-3769-2026-11-04.png`,
  `…-360-…`, `…-400-…`, `pantalla-2-clasificacion-797-2026-11-04.png`,
  `pantalla-2-estado-vacio-2026-11-04.png`.

- [x] **(Nivel 2) Cabecera común del sitio (pantalla 2 y siguientes).** Según `Cabecera.dc.html`:
  barra de 64 px, marca, navegación de funciones, buscador global adaptado del existente, enlaces sin
  pantalla desactivados y sin contadores inventados. En móvil el buscador baja a su propia fila.
  Probada en `apps/web/test/cabecera-sitio.test.ts` (8 pruebas) y en la e2e de la pantalla 2.

- [x] **(Nivel 2) Prueba de página de la pantalla 2 (punta a punta).** `apps/web/e2e/pantalla-2.spec.ts`
  con Playwright: 16 pruebas (8 × móvil/escritorio): 16 filas ordenadas, migas reales, goles de la
  misma jornada, menores, 400 px sin scroll de documento y columna fija, 404 y axe. Se ejecuta sin CI.

## Listas

- [ ] **(Nivel 2, siguiente) Pestaña Jornadas de la pantalla 2.** El prototipo la dibuja y la pantalla
  sólo tiene las flechas de la jornada actual. Necesita: listado de jornadas del grupo con enlace a cada
  una y estado de cada jornada (jugada / programada / sin datos). Datos: `partidos-de-grupo` ya los trae.

- [ ] **(Nivel 2) Pestañas Goleadores, Disciplina y Equipos de la pantalla 2.** Hoy están apagadas con
  `aria-disabled`. Goleadores ya tiene consulta (`ranking-goleadores`); Disciplina necesita tarjetas y
  sanciones (`sanciones-inferidas`, `analytics`); Equipos necesita la lista de inscripciones del grupo.

- [ ] **(Nivel 2) Conmutador Total / Casa / Fuera de la clasificación.** Hoy está desactivado porque
  `analytics` sólo tiene `jugados_casa`/`jugados_fuera`, no el G-E-P por condición. Sale como migración
  nueva (0051+) que añada las columnas y la proyección, con su prueba en `pruebas/sql/`; no se agrega
  desde `core.match` en la página (regla del encargo).

- [ ] **(Nivel 1) Tema oscuro en las páginas viejas.** El tema está limitado a `/explorar…`; en las
  rutas viejas se fuerza claro y no se ofrece el botón porque usan colores literales (`DESIGN.md` §2) y
  en oscuro quedarían ilegibles (`/canonico` pasaba de 401 a 1.785 nodos de contraste serios). Para
  activar el tema allí hay que migrar esas páginas (W9) o sustituir sus literales por tokens. Hasta
  entonces, el tema **no** está disponible en la web vieja y así se debe contar.

- [ ] **(Nivel 2) Interruptor de densidad (cómoda/compacta).** `tokens.css` define
  `[data-densidad="compacta"]` y la pantalla 2 está medida en las dos densidades forzando el atributo,
  pero **ninguna pantalla escribe la preferencia**: hoy no se puede cambiar. El tema claro/oscuro ya
  está resuelto (cookie + servidor); la densidad puede seguir el mismo patrón (cookie resuelta en el
  servidor, sin parpadeo) o esperar a decidir si entra en el producto.

- [ ] **(Nivel 1) Deuda e2e de la web vieja.** `apps/web/e2e/recorridos.spec.ts` (9 recorridos) está en
  rojo desde antes del 04/11 porque en `next dev` con Turbopack la web vieja no compila
  (`@facylf/ingesta` importa `.js` y no se resuelve a `.ts`; en el build de webpack sí). Hay que
  arreglar la resolución en dev o retirar esos recorridos al migrar las pantallas (W9). Mientras tanto
  la suite nueva se ejecuta aparte: `playwright test e2e/pantalla-2.spec.ts`.

- [ ] **(Nivel 1) Capturar el estado de error con un canónico de pruebas, no parando el de
  producción.** La pantalla 2 reutiliza `SinCanonico` (ya restilizado con tokens) y mantiene los 404,
  pero el estado de error no se ha podido ver en ejecución porque provocarlo exige parar el PostgreSQL
  que usan la ingesta y el resto de la plataforma (prohibido). Con una base de pruebas aparte o
  `DATABASE_URL_LECTOR` apuntando a una copia se puede capturar y medir con axe. Mientras tanto, la
  evidencia es revisión de código + `tsc`, y así se declara.

- [ ] **(Nivel 1) Auditar TODAS las superficies de búsqueda por nombres de menores.** El QA del
  04/11/2026 encontró que `/api/buscar` (y con él el buscador de cabecera) publicaba nombres de menores;
  se corrigió en la ruta aplicando `nombreVisible`, pero la página vieja `/buscar` y cualquier otra
  lista que pinte `persona.nombre` directamente hay que revisarlas igual. Prueba por superficie, no por
  función interna: pedir un apellido con menores y comprobar que no sale ningún nombre.

- [ ] **(Nivel 1) Escudos reales cuando existan.** `core.club_asset` ya guarda escudos, pero en CyL sólo
  hay 1 de 16 para el grupo de referencia. Cuando el recolector los tenga, `Escudo` debe enseñar la
  imagen real (`next/image` o ruta de imagen con caché) manteniendo el marcador determinista como
  respaldo. No inventar colores de club mientras no haya imagen.

- [ ] **(Nivel 1) Limpiar la capa de alias vieja de `globals.css` al migrar la última pantalla.**
  `--color-club*`, `--color-pizarra*`, `--color-cal`, `--font-display` y `.rayas` sobreviven por la web
  vieja; `.rayas` ya no lo usa nadie. La regla de `SISTEMA-DISENO` §2 es borrar la capa entera en el
  mismo cambio en que se migre la última página que la usa.

- [ ] **(Nivel 1) Deuda de pruebas de la sesión de pruebas** (5 puntos al final de `INFORME-PRUEBAS.md`):
  - una sola importación base en `lote.test.ts` (hoy 34 × ~7 s = 233 s);
  - `skip` explícito cuando el canónico no está (hoy las suites «pasan» sin comprobar nada);
  - `pnpm test` comprueba el canónico antes de empezar y avisa;
  - función común de limpieza de la federación de pruebas (hoy dos copias divergidas);
  - la proyección de lectura no debería proyectar los grupos de la federación `pruebas`.

- [ ] **(Nivel 1) Reparto de la ingesta por temporadas — configuración en el PC**, sin tocar el
  servidor: dejar la lista de temporadas que le tocan al PC en configuración, comprobar con las
  temporadas que ya ingiere el servidor que no hay solape y escribir la regla «cuando una temporada
  pasa al servidor, se quita del PC». Ver `ESPECIFICACION.md` Objetivo 2 y
  `docs/plataforma-web/REPARTO-TEMPORADAS.md`.

- [ ] **(Nivel 1) Comprobación del reparto**: informe que cruce la configuración del PC con lo que el
  servidor tiene en curso y saque cualquier temporada recogida dos veces (en septiembre se duplicaron
  ocho federaciones).

- [ ] **(Nivel 1) Pieza de honestidad del dato**: un componente único para «Sobre estos datos», zonas
  aproximadas y cobertura, para que ninguna pantalla prometa más de lo que hay (hoy está escrito en
  cada pantalla; la 2 ya lo tiene bien y sirve de referencia).

- [ ] **(Nivel 1) Capturar el estado de carga en la e2e.** La pantalla 2 tiene `Suspense` con esqueleto
  (mismas dimensiones, sin spinner) y el 404 se mantiene, pero no hay prueba que capture el HTML
  intermedio. Se puede hacer con una petición sin esperar al stream o con un retraso controlado en una
  ruta de pruebas.

## Esperando decisión (Nivel 3 — no bloquea)

- [ ] **¿Cuántas de las 22 pantallas entran en la primera tanda?** Mientras no se decida, se hace una
  cada vez; la 2 ya está terminada y la cabecera común sirve a las siguientes.
- [ ] **¿Se registra la tarea de métricas cada minuto?** `scripts/metricas-facylf.mjs` genera el JSON del
  panel y tarda ~3 s, pero **crear una tarea programada toca los ajustes del PC** (nivel 3). Mientras
  no se decida, el fichero se actualiza lanzando el script a mano.
