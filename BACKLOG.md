# Backlog — FACYLF

Regla del protocolo: **nunca menos de 5 tareas listas**. Si baja de 5, se generan de las tres fuentes
(competencia, huecos de la especificación, deuda técnica). Una tarea de Nivel 3 se marca
`esperando decisión` con la pregunta exacta y se sigue con la siguiente.

## Hecho

- [x] **(Nivel 1) Poner `pnpm test` en verde.** 27 fallos por el canónico apagado, 2 suites por limpieza
  cuadrática y 21 por FK de `analytics`: los tres diagnosticados y arreglados. Detalle en
  [`INFORME-PRUEBAS.md`](INFORME-PRUEBAS.md). Suite: **633 en verde, 1 saltada, 0 fallos**.
  Puertas: `pnpm lint` y `tsc --noEmit` de la web en verde.

## Listas

- [ ] **(Nivel 2, siguiente) Pantalla 2 del prototipo — Competición: clasificación y jornada**, con
  **datos reales de Castilla y León**. Contra `diseno/prototipo/2 · Competición clasificación y
  jornada.png` y la fuente `docs/plataforma-web/prototipo/Competicion.dc.html` (tokens: fondo `#F4F6F8`,
  texto `#1A2027`, acento `#0B7285`, Inter con `tnum`). Incluye: cabecera común, migas, cabecera de
  competición con desplegables de grupo y temporada y barra de progreso de la temporada, pestañas,
  tabla de clasificación con zonas de color y forma, columna de jornada y goleadores.
  **Criterio de hecho**: se ve con datos reales de CyL en `pnpm dev`, con estados vacíos honestos
  (sin inventar ceros) y `pnpm test` sigue en verde.

- [ ] **(Nivel 2) Inventario de datos reales de la pantalla 2**: qué campos pide el diseño y cuáles
  existen ya en el canónico para CyL (clasificación reconstruida, jornadas, goleadores, zonas). Lo que
  falte se anota como hueco, no se rellena a mano.

- [ ] **(Nivel 1) Deuda de pruebas de esta sesión** (5 puntos al final de `INFORME-PRUEBAS.md`):
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

- [ ] **(Nivel 1) Sistema visual en código**: extraer de `docs/plataforma-web/prototipo/*.dc.html` los
  tokens que hoy están sueltos (colores, tipografía, radios, sombras, densidad de tabla) a un único
  sitio reutilizable, y sustituir los valores a mano de las pantallas que se vayan haciendo.

- [ ] **(Nivel 2) Cabecera común** (`Componente · cabecera común.png` y `Cabecera.dc.html`): barra
  oscura con navegación, avisos con contador, avatar y buscador global, tomando la del prototipo.

- [ ] **(Nivel 1) Pieza de honestidad del dato**: un componente único para «Sobre estos datos», zonas
  aproximadas y cobertura, para que ninguna pantalla prometa más de lo que hay.

## Esperando decisión (Nivel 3 — no bloquea)

- [ ] **¿Se reutiliza `apps/web` (Next) o se rehace contra el diseño?** Hoy se implementa *dentro* de
  `apps/web` para aprovechar las consultas y el canónico. Pregunta para David en
  `ESPECIFICACION.md` («Decisiones de diseño que hay que confirmar»).
- [ ] **¿Cuántas de las 22 pantallas entran en la primera tanda?** Mientras no se decida, se hace una
  cada vez, empezando por la 2.
- [ ] **¿`V-E-D` o `G-E-P`?** El prototipo usa las dos (Inicio `V-E-D`, Competición `G-E-P`). Mientras
  no se decida, la pantalla 2 usa `G-E-P`, que es lo que enseña el prototipo en esa pantalla.
