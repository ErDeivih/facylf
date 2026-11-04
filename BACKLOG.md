# Backlog — FACYLF

Regla del protocolo: **nunca menos de 5 tareas listas**. Si baja de 5, se generan de las tres fuentes
(competencia, huecos de la especificación, deuda técnica). Una tarea de Nivel 3 se marca
`esperando decisión` con la pregunta exacta y se sigue con la siguiente.

## Hecho

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
  Lo que la primera versión deja fuera, abajo.

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

- [ ] **(Nivel 1) Cabecera común del sitio** (`Componente · cabecera común.png` y `Cabecera.dc.html`):
  barra oscura con navegación, avisos con contador, avatar y buscador global. Hoy la pantalla nueva se
  monta bajo la cabecera vieja; es lo que más la separa del prototipo.

- [ ] **(Nivel 2) Prueba de página de la pantalla 2 (punta a punta).** Las 22 pruebas cubren consultas y
  reglas puras; falta una prueba tipo Playwright que cargue `/explorar/competicion/797`, compruebe que
  hay 16 filas, que la jornada tiene 8 partidos y que ningún nombre de menor aparece en el HTML.

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

- [ ] **(Nivel 1) Sistema visual en código**: quedan valores del prototipo sueltos en las pantallas
  nuevas (colores `#F4F6F8`, `#1A2027`, `#0B7285`, radios, `tnum`). El radio de tarjeta ya es token;
  falta el resto y una revisión de contraste/accesibilidad de la pantalla 2.

- [ ] **(Nivel 1) Pieza de honestidad del dato**: un componente único para «Sobre estos datos», zonas
  aproximadas y cobertura, para que ninguna pantalla prometa más de lo que hay (hoy está escrito en
  cada pantalla).

## Esperando decisión (Nivel 3 — no bloquea)

- [ ] **¿Se reutiliza `apps/web` (Next) o se rehace contra el diseño?** Hoy se implementa *dentro* de
  `apps/web` para aprovechar las consultas y el canónico. Es la decisión que más condiciona las
  siguientes pantallas. Pregunta para David en `DECISIONES.md` y `ESPECIFICACION.md`.
- [ ] **¿Cuántas de las 22 pantallas entran en la primera tanda?** Mientras no se decida, se hace una
  cada vez; la 2 ya tiene primera versión.
- [ ] **¿`V-E-D` o `G-E-P`?** El prototipo usa las dos (Inicio `V-E-D`, Competición `G-E-P`). La
  pantalla 2 usa `G-E-P`; si se elige `V-E-D`, se cambia en la cabecera de la tabla y en las rachas.
